// iOS Safari Extension 통합 세션 매니저 (window.CSMSession)
// ─────────────────────────────────────────────────────────────────────────
// 왜: 확장은 popup WebView에서 fetch(credentials:'include')로 Safari 공유 쿠키를 쓴다.
// 그래서 모든 fetch 결과가 "그 순간 Safari 상태(활성 탭/쿠키/SSO 진행 단계)"에 종속된다.
// 확장 열 때 어떤 페이지가 열려있고 어느 작업 중이었냐에 따라 동작이 갈리던 불안정을 없애기 위해,
// ITSM/ONE360 세션 확보를 하나의 매니저로 통합한다.
//   - 유효성 판정: redirect:'manual' 프로브 + classifyProbe (valid|invalid|login-redirect)
//   - 확보(로그인 유도): 전역 _redirectOwner로 활성 탭 상호 조정(상대 도메인/IdP면 안 뺏음)
//   - 대기(폴링): 시스템별 단일 Promise 공유 + 경량 프로브 1초 폴링(최대 90초)
// init-session.js가 popup.html에서 먼저 로드되므로 코어를 여기 두고 window.CSMSession으로 노출한다.
// ONE360 config는 datablock 헬퍼가 있는 sidepanel.js에서 registerSystem으로 주입한다.
(function () {
  'use strict';

  const browserAPI = typeof browser !== 'undefined' ? browser : chrome;

  // 하위호환: 기존 코드가 window._gck를 직접 참조하므로 shim으로 동기화 유지.
  window._gck = null;
  window._gckExpiry = 0;

  // 양쪽 시스템이 공유하는 SAP SSO IdP 도메인.
  // accounts.sap.com = SAP ID Service, *.accounts.ondemand.com = IAS,
  // *.authentication.*.hana.ondemand.com = XSUAA.
  const SHARED_IDP = '(accounts\\.sap\\.com|[^/]*\\.accounts\\.ondemand\\.com|[^/]*\\.authentication\\.[^/]*\\.hana\\.ondemand\\.com)';
  // 활성 탭이 IdP에 있으면 OAuth authorization-code 교환이 "진행 중"이라는 뜻.
  // 이때 tabs.update로 로그인 루트를 다시 때리면 일회용 code/state가 무효화돼
  // "code invalid / 400 oauth_error"로 SSO가 깨진다 → IdP 도메인에서는 절대 redirect 금지.
  const IDP_RE = new RegExp('://' + SHARED_IDP + '\\b', 'i');

  // redirect로 유도한 SSO가 끝날 때까지 "끈기있게" 기다린다 — 그래야 사용자 개입 없이
  // 완료 즉시 호출부(one360Fetch/itsmFetch)가 그 자리에서 자동 조회한다.
  // OAuth 리다이렉트 체인(one360→XSUAA→IAS→복귀)이 느린 날 20초를 넘길 수 있어, 20초면
  // 완료 직전에 폴링이 포기해 "실패"로 떨어진다(사용자가 겪은 'redirect 후 바로 오류'의 원인).
  // 사람 입력이 없더라도 네트워크/리다이렉트 지연을 넉넉히 흡수하도록 90초로 둔다.
  const SESSION_TIMEOUT_MS = 90000; // redirect를 실제로 건 뒤 SSO 완료 대기 상한
  // 활성 탭이 IdP(OAuth 진행 중)라 redirect를 생략한 경우의 짧은 대기.
  // 진행 중 OAuth가 곧 끝날 수 있으니 잠깐은 기다리되, redirect로 유도한 게 아니므로
  // 90초를 끌면 안 된다(헛폴링 플러드). 짧게 보고 포기 → 사용자가 실제 조회를 누르면 재확보.
  const IDP_WAIT_MS = 15000;        // skip-idp 폴링 상한
  const POLL_INTERVAL_MS = 500;     // 폴링 간격
  const TOKEN_TTL_MS = 15 * 60 * 1000;

  // ── 세션 판정 순수 규칙 ────────────────────────────────────────────────
  // probe 결과를 'valid' | 'invalid' | 'login-redirect' 로 분류. (Node 단위테스트 대상)
  // redirect:'manual'이면 리다이렉트는 opaqueredirect(status 0)로 오므로 "세션 없음"으로 본다.
  function classifyProbe(o) {
    const status = o.status, type = o.type, finalUrl = o.finalUrl;
    const ssoDomainsRe = o.ssoDomainsRe, contentType = o.contentType;
    const bodyLooksLikeLogin = o.bodyLooksLikeLogin;
    // 1) redirect:'manual' → opaqueredirect / status 0 = 로그인 리다이렉트 = 세션없음
    if (type === 'opaqueredirect' || status === 0) return 'login-redirect';
    // 2) 3xx가 그대로 노출되는 환경 = 세션없음
    if (status >= 300 && status < 400) return 'login-redirect';
    // 3) 최종 URL이 로그인/IdP 도메인(단 /api/ 제외)이면 = 세션없음 (follow 됐을 때 안전망)
    if (finalUrl && ssoDomainsRe && ssoDomainsRe.test(finalUrl) && !/\/api\//.test(finalUrl)) return 'login-redirect';
    // 4) 2xx
    if (status >= 200 && status < 300) {
      if (contentType && /text\/html/i.test(contentType)) return 'invalid'; // 로그인 HTML
      if (bodyLooksLikeLogin) return 'invalid';
      return 'valid';
    }
    // 5) 400/401/403/405 등 = 세션없음 (GET not supported 400, 인증실패 포함)
    return 'invalid';
  }

  // 자기 1차 도메인 + 상대 시스템 도메인(들) + 공유 IdP 를 하나의 정규식으로.
  function makeSsoDomainsRe(domains) {
    return new RegExp('://(' + domains.join('|') + '|' + SHARED_IDP + ')\\b', 'i');
  }

  // ── 시스템 config 레지스트리 ───────────────────────────────────────────
  const SYSTEMS = Object.create(null);
  function registerSystem(cfg) {
    cfg.token = cfg.token || { value: null, expiry: 0 };
    cfg._ssoPromise = null;
    cfg._probePromise = null;
    SYSTEMS[cfg.key] = cfg;
  }

  // 전역 확보 체인 — 활성 탭은 Safari에 하나뿐이므로, 두 시스템이 동시에 탭을 뺏으면 핑퐁이 난다.
  // 확보(redirect+폴링)를 이 체인에 "직렬"로 붙여 한 번에 하나의 시스템만 활성 탭을 redirect한다.
  // ITSM 먼저 요청됐으면 ITSM 쿠키를 받은 뒤 ONE360로 넘어감. URL/소유권 판단 불필요.
  let _acquireChain = Promise.resolve();

  // ── ITSM 전용 프로브: login.do(manual)에서 g_ck 추출 → sys_user(manual) 프로브 ──
  async function itsmProbe(cfg) {
    let resp;
    try {
      resp = await fetch('https://itsm.services.sap/login.do', { credentials: 'include', redirect: 'manual' });
    } catch (e) {
      return { state: 'invalid' };
    }
    // login.do 자체가 302(opaqueredirect)면 로그인 안 됨
    if (resp.type === 'opaqueredirect' || resp.status === 0 || (resp.status >= 300 && resp.status < 400)) {
      cfg.token.value = null; cfg.token.expiry = 0; window._gck = null; window._gckExpiry = 0;
      return { state: 'login-redirect' };
    }
    let html = '';
    try { html = await resp.text(); } catch (_) {}
    const m = html && html.match(/g_ck\s*=\s*['"]([^'"]+)['"]/);
    if (!m) {
      cfg.token.value = null; cfg.token.expiry = 0; window._gck = null; window._gckExpiry = 0;
      return { state: 'invalid' };
    }
    const gck = m[1];
    // g_ck는 미로그인 login.do에도 익명으로 들어있으므로, 보호 API 프로브로 진짜 세션인지 검증.
    let probe;
    try {
      probe = await fetch('https://itsm.services.sap/api/now/table/sys_user?sysparm_limit=1&sysparm_fields=sys_id', {
        credentials: 'include', redirect: 'manual',
        headers: { Accept: 'application/json', 'X-UserToken': gck },
      });
    } catch (e) {
      cfg.token.value = null; cfg.token.expiry = 0; window._gck = null; window._gckExpiry = 0;
      return { state: 'invalid' };
    }
    const state = classifyProbe({
      status: probe.status, type: probe.type, finalUrl: probe.url,
      ssoDomainsRe: cfg.ssoDomainsRe,
      contentType: probe.headers && probe.headers.get ? probe.headers.get('content-type') : null,
    });
    if (state === 'valid') {
      cfg.token.value = gck; cfg.token.expiry = Date.now() + TOKEN_TTL_MS;
      window._gck = gck; window._gckExpiry = cfg.token.expiry; // shim 동기화
      console.log('[CSMSession] itsm 세션 유효 - g_ck 확정:', gck.slice(0, 8) + '...');
    } else {
      cfg.token.value = null; cfg.token.expiry = 0; window._gck = null; window._gckExpiry = 0;
      console.log('[CSMSession] itsm 세션 미유효(프로브', probe.status, '/', probe.type, ')');
    }
    return { state };
  }

  // ── 확보: 활성 탭을 loginUrl로 redirect ────────────────────────────────
  // 세션 invalid라 여기 왔으므로 원칙은 "활성 탭을 로그인 루트로 보내 쿠키를 새로 받는다".
  // 단 하나의 예외: 활성 탭이 IdP(OAuth code 교환 진행 중)이면 redirect가 그 흐름을 깨므로 생략.
  //   - 자기/상대 시스템 도메인(itsm/one360)은 400 에러·stale 페이지일 수 있어 그냥 redirect (안 하면 갇힘).
  //   - IdP 도메인만 "진행 중"의 신뢰 가능한 신호 → 생략하고 폴링으로 완료를 기다린다.
  // 동시성(ITSM↔ONE360 핑퐁)은 상위 _acquireChain 직렬화가 보장한다.
  // 반환: 'redirected'(실제 redirect함) | 'skip-idp'(OAuth 진행중이라 생략) | 'no-redirect'(탭없음/실패).
  // 이 구분이 중요한 이유: redirect를 실제로 걸지 않았으면 폴링해도 새 쿠키가 들어올 길이 없어
  // 90초 폴링은 sys_user(401)만 난사하는 헛짓이 된다. 호출부(ensureSession)가 이에 맞춰 폴링을 조절.
  async function acquireRedirect(cfg) {
    let tab;
    try {
      const tabs = await browserAPI.tabs.query({ active: true, currentWindow: true });
      tab = tabs && tabs[0];
    } catch (e) {
      console.log('[CSMSession] tabs.query 실패 - redirect 생략:', e && e.message);
      return 'no-redirect';
    }
    if (!tab) { console.log('[CSMSession] 활성 탭 없음 - redirect 생략'); return 'no-redirect'; }
    // IdP에서 OAuth 진행 중이면 건드리지 않는다(code invalid 400 방지).
    if (IDP_RE.test(tab.url || '')) {
      console.log('[CSMSession] ' + cfg.key + ': 활성 탭이 IdP(OAuth 진행 중) - redirect 생략, 짧게 대기', (tab.url || '').slice(0, 70));
      return 'skip-idp';
    }
    try {
      await browserAPI.tabs.update(tab.id, { url: cfg.loginUrl });
      console.log('[CSMSession] ' + cfg.key + ': Safari를 ' + cfg.loginUrl + ' 으로 리다이렉트(SSO 유도)');
    } catch (e) {
      console.error('[CSMSession] ' + cfg.key + ' redirect 실패:', e && e.message);
      return 'no-redirect';
    }
    return 'redirected';
  }

  // ── 대기: 경량 프로브 폴링 ─────────────────────────────────────────────
  function pollUntilValid(cfg, deadline) {
    return new Promise((resolve) => {
      const tick = async () => {
        let res;
        try { res = await cfg.probe(cfg); } catch (_) { res = { state: 'invalid' }; }
        if (res.state === 'valid') return resolve(true);
        if (Date.now() >= deadline) return resolve(false);
        setTimeout(tick, POLL_INTERVAL_MS);
      };
      setTimeout(tick, POLL_INTERVAL_MS);
    });
  }

  // ── 유일 진입점 ────────────────────────────────────────────────────────
  function getToken(key) {
    const cfg = SYSTEMS[key];
    if (!cfg || !cfg.needsToken) return null;
    return (cfg.token.value && Date.now() < cfg.token.expiry) ? cfg.token.value : null;
  }

  async function ensureSession(key) {
    const cfg = SYSTEMS[key];
    if (!cfg) { console.warn('[CSMSession] 미등록 시스템:', key); return false; }
    // 1) 토큰 캐시 유효(ITSM) → 즉시.
    if (cfg.needsToken && cfg.token.value && Date.now() < cfg.token.expiry) return true;
    // 1.5) 이미 확보(redirect+폴링)가 진행 중이면 중복 프로브 없이 그 결과를 기다린다.
    //      확장 로드 시 itsmFetch가 동시 10여 개 들어오면 각자 probe(401)를 찍어 콘솔이
    //      401로 도배되던 문제의 핵심 — 진행 중이면 다시 확인하지 말고 수렴시킨다.
    if (cfg._ssoPromise) return cfg._ssoPromise;
    // 2) 경량 프로브로 현 상태 판정. 동시 진입은 _probePromise로 묶어 probe도 1회만.
    let res;
    try {
      if (!cfg._probePromise) {
        cfg._probePromise = Promise.resolve()
          .then(() => cfg.probe(cfg))
          .finally(() => { cfg._probePromise = null; });
      }
      res = await cfg._probePromise;
    } catch (_) { res = { state: 'invalid' }; }
    if (res.state === 'valid') return true;
    // 2.5) 프로브를 기다리는 사이 다른 호출이 확보를 시작했을 수 있다 → 그걸 공유.
    if (cfg._ssoPromise) return cfg._ssoPromise;
    // 3) 세션없음 → 전역 체인에 직렬로 붙여 확보(redirect+폴링). 시스템당 Promise 1개 공유.
    //    같은 시스템 동시 호출은 cfg._ssoPromise로 수렴, 다른 시스템은 _acquireChain으로 순차 실행.
    if (!cfg._ssoPromise) {
      const run = _acquireChain.then(async () => {
        const r = await acquireRedirect(cfg);
        // redirect를 실제로 건 경우에만 SSO 완료를 길게(90초) 기다린다.
        if (r === 'redirected') return pollUntilValid(cfg, Date.now() + SESSION_TIMEOUT_MS);
        // IdP OAuth 진행 중이라 생략한 경우: 곧 끝날 수 있으니 짧게만(15초) 보고 포기.
        if (r === 'skip-idp')  return pollUntilValid(cfg, Date.now() + IDP_WAIT_MS);
        // 탭없음/실패: redirect를 못 걸었으니 폴링해도 새 쿠키가 안 들어온다 → 즉시 실패.
        return false;
      });
      // 한 시스템 확보 실패가 다음 시스템을 막지 않도록 체인은 항상 이어감.
      _acquireChain = run.then(() => {}, () => {});
      cfg._ssoPromise = run.finally(() => { cfg._ssoPromise = null; });
    }
    return cfg._ssoPromise;
  }

  // ── ITSM config 등록 (ONE360은 sidepanel.js에서 등록) ──────────────────
  registerSystem({
    key: 'itsm',
    // 로그인 유도는 루트로 보낸다. ServiceNow 딥링크(/now/cwf/agent/home/list)로 GET 하면
    // 세션 없을 때 "HTTP Status 400 – HTTP method GET is not supported by this URL"을 뱉는다.
    // 루트(itsm.services.sap/)가 SSO 로그인 플로우를 정상 트리거(sap-fetch entryUrl과 동일).
    loginUrl: 'https://itsm.services.sap/',
    // 자기(itsm) + 상대(one360) + 공유 IdP → 활성 탭이 one360/IdP면 ITSM이 뺏지 않음.
    ssoDomainsRe: makeSsoDomainsRe(['itsm\\.services\\.sap', 'one360\\.for\\.sap']),
    needsToken: true,
    probe: itsmProbe,
  });

  // ── 공개 API ───────────────────────────────────────────────────────────
  window.CSMSession = {
    registerSystem, ensureSession, getToken,
    SHARED_IDP, makeSsoDomainsRe,
    _classifyProbe: classifyProbe,   // 테스트/디버깅용
    _SYSTEMS: SYSTEMS,
  };

  // ── 하위호환 shim: 기존 window.retriggerSso(callback) 시그니처 유지 ──────
  // sidepanel.js의 showError 등 레거시 경로가 아직 이걸 부를 수 있으므로 ensureSession('itsm')에 위임.
  window.retriggerSso = function (callback) {
    ensureSession('itsm').then((ok) => { if (callback) callback(ok); });
  };

  // 로드 시 선제 ITSM 프로브는 하지 않는다. ONE360만 쓰려고 확장을 열었는데도
  // ITSM 세션을 잡으려다(그리고 활성 탭이 ONE360라 redirect 못 걸고) 500ms 폴링이
  // 90초간 sys_user(401)를 난사하던 원인. ITSM 세션은 첫 ITSM 조회 때 itsmFetch가
  // ensureSession('itsm')으로 lazy 확보하므로 여기서 미리 할 필요가 없다.

})();
