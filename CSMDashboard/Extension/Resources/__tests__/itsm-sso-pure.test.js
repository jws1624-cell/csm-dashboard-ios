'use strict';
// 통합 SessionManager(window.CSMSession, init-session.js) 순수 로직 단위 테스트 (DOM/네트워크 비의존).
// init-session.js의 classifyProbe / makeSsoDomainsRe / ensureSession 공유가드 / acquireRedirect 소유권
// 로직을 그대로 복제해, 6개 결함 수정이 성립하는지 검증한다.
const assert = require('assert');

// ── init-session.js 복제: 공유 IdP + ssoDomainsRe 생성 ──
const SHARED_IDP = '(accounts\\.sap\\.com|[^/]*\\.accounts\\.ondemand\\.com|[^/]*\\.authentication\\.[^/]*\\.hana\\.ondemand\\.com)';
function makeSsoDomainsRe(domains) {
  return new RegExp('://(' + domains.join('|') + '|' + SHARED_IDP + ')\\b', 'i');
}
// 실제 등록과 동일: ITSM = [itsm, one360], ONE360 = [one360, itsm]
const ITSM_RE = makeSsoDomainsRe(['itsm\\.services\\.sap', 'one360\\.for\\.sap']);
const ONE360_RE = makeSsoDomainsRe(['one360\\.for\\.sap', 'itsm\\.services\\.sap']);

// ── init-session.js 복제: acquireRedirect의 3-상태 판정 ──
// 'skip-idp'   = 활성 탭이 IdP(OAuth code 교환 진행 중) → redirect 생략(code invalid 방지), 짧게만 대기.
// 'redirected' = 자기/상대 시스템 도메인·무관 도메인 → 실제 redirect 발행(갇힘 방지).
// 'no-redirect'= 활성 탭 없음(빈 url) → redirect 못 걸었으니 폴링 무의미.
const IDP_RE = new RegExp('://' + SHARED_IDP + '\\b', 'i');
function decideRedirect(tabUrl) {
  if (!tabUrl) return 'no-redirect';
  return IDP_RE.test(tabUrl) ? 'skip-idp' : 'redirected';
}
// 폴링 상한: redirect 실제로 걸면 길게, IdP 생략이면 짧게, 못 걸면 폴링 안 함.
const SESSION_TIMEOUT_MS = 90000;
const IDP_WAIT_MS = 15000;

// ── init-session.js 복제: classifyProbe (valid|invalid|login-redirect) ──
function classifyProbe(o) {
  const status = o.status, type = o.type, finalUrl = o.finalUrl;
  const ssoDomainsRe = o.ssoDomainsRe, contentType = o.contentType;
  const bodyLooksLikeLogin = o.bodyLooksLikeLogin;
  if (type === 'opaqueredirect' || status === 0) return 'login-redirect';
  if (status >= 300 && status < 400) return 'login-redirect';
  if (finalUrl && ssoDomainsRe && ssoDomainsRe.test(finalUrl) && !/\/api\//.test(finalUrl)) return 'login-redirect';
  if (status >= 200 && status < 300) {
    if (contentType && /text\/html/i.test(contentType)) return 'invalid';
    if (bodyLooksLikeLogin) return 'invalid';
    return 'valid';
  }
  return 'invalid';
}

// ── init-session.js 복제: ensureSession 공유가드 + 전역 순차 큐 ──
// 핵심 재설계: 확보(redirect+poll)는 전역 체인 _acquireChain에 직렬로 붙는다.
//   - 같은 시스템 동시 N개 → cfg._ssoPromise로 1개 공유 (확보 1회·폴링 1회).
//   - 다른 시스템 2개 동시 → _acquireChain으로 "한 번에 하나만" 활성 탭 redirect (경쟁/핑퐁 제거).
// URL/소유권 판단 없음 — probe가 invalid면 그냥 순서대로 로그인 루트로 redirect해 쿠키를 새로 받는다.
function makeManager(sharedState) {
  // sharedState._acquireChain: 전역 직렬 체인 (모든 시스템 공유)
  // ctx: { key, needsToken, token, probe(), acquire()→상태문자열, poll(deadline) }
  function makeEnsure(ctx) {
    return async function ensure() {
      if (ctx.needsToken && ctx.token.value && Date.now() < ctx.token.expiry) return true;
      // 진행 중 확보가 있으면 중복 프로브 없이 수렴(401 도배 방지).
      if (ctx._ssoPromise) return ctx._ssoPromise;
      // 프로브도 동시 진입을 1회로 묶는다.
      if (!ctx._probePromise) {
        ctx._probePromise = Promise.resolve().then(() => ctx.probe())
          .finally(() => { ctx._probePromise = null; });
      }
      const res = await ctx._probePromise;
      if (res.state === 'valid') return true;
      if (ctx._ssoPromise) return ctx._ssoPromise;
      if (!ctx._ssoPromise) {
        // 전역 체인에 직렬로 붙임: 앞선 시스템 확보가 끝나야 내 redirect가 시작된다.
        const run = sharedState._acquireChain.then(async () => {
          const r = await ctx.acquire();   // 'redirected' | 'skip-idp' | 'no-redirect'
          // redirect를 실제로 건 경우에만 길게(90s) 폴링. IdP 생략은 짧게(15s). 못 걸면 폴링 안 함.
          if (r === 'redirected') return ctx.poll(Date.now() + SESSION_TIMEOUT_MS);
          if (r === 'skip-idp')  return ctx.poll(Date.now() + IDP_WAIT_MS);
          return false;
        });
        // 체인은 성공/실패 무관하게 이어지도록(한 시스템 실패가 다음을 막지 않음)
        sharedState._acquireChain = run.then(() => {}, () => {});
        ctx._ssoPromise = run.finally(() => { ctx._ssoPromise = null; });
      }
      return ctx._ssoPromise;
    };
  }
  return { makeEnsure };
}

let pass = 0;
async function test(name, fn) { await fn(); pass++; console.log('  ✓', name); }

(async () => {
  console.log('classifyProbe (세션 유효성 3-상태):');
  await test('200 + JSON → valid', () => assert.strictEqual(classifyProbe({ status: 200, contentType: 'application/json' }), 'valid'));
  await test('204 → valid', () => assert.strictEqual(classifyProbe({ status: 204 }), 'valid'));
  await test('200 + text/html(로그인) → invalid', () => assert.strictEqual(classifyProbe({ status: 200, contentType: 'text/html; charset=utf-8' }), 'invalid'));
  await test('200 + bodyLooksLikeLogin → invalid', () => assert.strictEqual(classifyProbe({ status: 200, bodyLooksLikeLogin: true }), 'invalid'));
  await test('status 0(opaqueredirect) → login-redirect', () => assert.strictEqual(classifyProbe({ status: 0, type: 'opaqueredirect' }), 'login-redirect'));
  await test('302 → login-redirect', () => assert.strictEqual(classifyProbe({ status: 302 }), 'login-redirect'));
  await test('400(GET not supported) → invalid', () => assert.strictEqual(classifyProbe({ status: 400 }), 'invalid'));
  await test('401 → invalid', () => assert.strictEqual(classifyProbe({ status: 401 }), 'invalid'));
  await test('403 → invalid', () => assert.strictEqual(classifyProbe({ status: 403 }), 'invalid'));
  await test('405 → invalid', () => assert.strictEqual(classifyProbe({ status: 405 }), 'invalid'));
  await test('200 + finalUrl=accounts.sap.com(비 api) → login-redirect', () =>
    assert.strictEqual(classifyProbe({ status: 200, finalUrl: 'https://accounts.sap.com/saml2/idp/sso', ssoDomainsRe: ITSM_RE }), 'login-redirect'));
  await test('200 + finalUrl=itsm /api/ 경로 → valid(아니라 content로 판정, api는 로그인 아님)', () =>
    assert.strictEqual(classifyProbe({ status: 200, finalUrl: 'https://itsm.services.sap/api/now/table/sys_user', ssoDomainsRe: ITSM_RE, contentType: 'application/json' }), 'valid'));

  console.log('ssoDomainsRe (ITSM↔ONE360 상호 인식 — 결함2 회귀방지):');
  await test('ITSM re가 itsm.services.sap → true', () => assert.strictEqual(ITSM_RE.test('https://itsm.services.sap/now/x'), true));
  await test('ITSM re가 one360.for.sap → true(상대 도메인 인식)', () => assert.strictEqual(ITSM_RE.test('https://one360.for.sap/app'), true));
  await test('ITSM re가 accounts.sap.com → true', () => assert.strictEqual(ITSM_RE.test('https://accounts.sap.com/x'), true));
  await test('ITSM re가 IAS *.accounts.ondemand.com → true', () => assert.strictEqual(ITSM_RE.test('https://a1.accounts.ondemand.com/login'), true));
  await test('ITSM re가 XSUAA *.authentication.*.hana.ondemand.com → true', () => assert.strictEqual(ITSM_RE.test('https://x.authentication.eu10.hana.ondemand.com/'), true));
  await test('ITSM re가 google → false', () => assert.strictEqual(ITSM_RE.test('https://www.google.com'), false));
  await test('ONE360 re가 one360.for.sap → true', () => assert.strictEqual(ONE360_RE.test('https://one360.for.sap/app'), true));
  await test('ONE360 re가 itsm.services.sap → true(상대 도메인 인식)', () => assert.strictEqual(ONE360_RE.test('https://itsm.services.sap/now'), true));
  await test('ONE360 re가 google → false', () => assert.strictEqual(ONE360_RE.test('https://www.google.com'), false));

  console.log('decideRedirect (3-상태: IdP 생략 / 실제 redirect / 탭없음):');
  await test('활성탭=XSUAA IdP(OAuth 진행중) → skip-idp', () =>
    assert.strictEqual(decideRedirect('https://sapit-strategicservices-prod-falcon.authentication.eu10.hana.ondemand.com/oauth/authorize'), 'skip-idp'));
  await test('활성탭=IAS accounts.ondemand.com → skip-idp', () =>
    assert.strictEqual(decideRedirect('https://centralit.accounts.ondemand.com/saml2/idp/sso'), 'skip-idp'));
  await test('활성탭=accounts.sap.com → skip-idp', () =>
    assert.strictEqual(decideRedirect('https://accounts.sap.com/saml2/idp/sso'), 'skip-idp'));
  await test('활성탭=oauth_error 페이지(IdP 도메인) → skip-idp', () =>
    assert.strictEqual(decideRedirect('https://sapit-strategicservices-prod-falcon.authentication.eu10.hana.ondemand.com/oauth_error'), 'skip-idp'));
  await test('활성탭=itsm 자기 도메인(400 에러페이지) → redirected(갇힘 방지)', () =>
    assert.strictEqual(decideRedirect('https://itsm.services.sap/now/cwf/agent/home/list'), 'redirected'));
  await test('활성탭=one360 자기 도메인 → redirected', () =>
    assert.strictEqual(decideRedirect('https://one360.for.sap/app'), 'redirected'));
  await test('활성탭=상대 도메인(itsm when acquiring one360) → redirected(IdP 아니므로)', () =>
    assert.strictEqual(decideRedirect('https://itsm.services.sap/now'), 'redirected'));
  await test('활성탭=무관 도메인 → redirected', () =>
    assert.strictEqual(decideRedirect('https://www.google.com'), 'redirected'));
  await test('활성탭=빈 문자열(탭없음) → no-redirect(폴링 무의미)', () =>
    assert.strictEqual(decideRedirect(''), 'no-redirect'));

  console.log('폴링 조절 (redirect 실제로 걸었을 때만 — ONE360-start 헛폴링 플러드 방지):');
  await test("acquire='redirected' → poll 호출(긴 deadline=90s)", async () => {
    let polledDeadline = null;
    const ctx = {
      key: 'itsm', needsToken: false, token: { value: null, expiry: 0 },
      probe: async () => ({ state: 'invalid' }),
      acquire: async () => 'redirected',
      poll: async (deadline) => { polledDeadline = deadline - Date.now(); return true; },
    };
    const { makeEnsure } = makeManager({ _acquireChain: Promise.resolve() });
    assert.strictEqual(await makeEnsure(ctx)(), true);
    assert.ok(polledDeadline > IDP_WAIT_MS, '긴 폴링(90s 쪽)이어야');
    assert.ok(polledDeadline <= SESSION_TIMEOUT_MS + 50);
  });
  await test("acquire='skip-idp' → poll 호출(짧은 deadline=15s)", async () => {
    let polledDeadline = null;
    const ctx = {
      key: 'itsm', needsToken: false, token: { value: null, expiry: 0 },
      probe: async () => ({ state: 'invalid' }),
      acquire: async () => 'skip-idp',
      poll: async (deadline) => { polledDeadline = deadline - Date.now(); return false; },
    };
    const { makeEnsure } = makeManager({ _acquireChain: Promise.resolve() });
    assert.strictEqual(await makeEnsure(ctx)(), false);
    assert.ok(polledDeadline <= IDP_WAIT_MS + 50 && polledDeadline > 0, '짧은 폴링(15s)이어야');
  });
  await test("acquire='no-redirect' → poll 호출 안 함, 즉시 false (ONE360-start 핵심)", async () => {
    let pollCalls = 0;
    const ctx = {
      key: 'itsm', needsToken: false, token: { value: null, expiry: 0 },
      probe: async () => ({ state: 'invalid' }),
      acquire: async () => 'no-redirect',
      poll: async () => { pollCalls++; return true; },
    };
    const { makeEnsure } = makeManager({ _acquireChain: Promise.resolve() });
    assert.strictEqual(await makeEnsure(ctx)(), false);
    assert.strictEqual(pollCalls, 0, 'redirect 못 걸었으면 폴링 자체를 안 해야(헛폴링 방지)');
  });

  console.log('ensureSession 공유가드 (같은 시스템 동시 호출 1폴링 공유):');
  await test('동시 4개 → acquire 1회·poll 1회, 전부 true', async () => {
    let acquireCalls = 0, pollCalls = 0, probeCalls = 0;
    const ctx = {
      key: 'itsm', needsToken: false, token: { value: null, expiry: 0 },
      probe: async () => { probeCalls++; return { state: 'invalid' }; },  // 아직 세션 없음
      acquire: async () => { acquireCalls++; return 'redirected'; },
      poll: async () => { pollCalls++; await new Promise(r => setTimeout(r, 15)); return true; },
    };
    const { makeEnsure } = makeManager({ _acquireChain: Promise.resolve() });
    const ensure = makeEnsure(ctx);
    const results = await Promise.all([ensure(), ensure(), ensure(), ensure()]);
    assert.strictEqual(acquireCalls, 1, 'acquireRedirect 1회(redirect 1회로 수렴)');
    assert.strictEqual(pollCalls, 1, '폴링 1개 공유');
    assert.deepStrictEqual(results, [true, true, true, true]);
    assert.strictEqual(probeCalls, 1, '동시 진입 → probe 1회로 수렴(401 콘솔 도배 방지)');
  });
  await test('로드 시 동시 10개 itsmFetch → probe 1·acquire 1·poll 1 (ONE360-start 폭주 방지)', async () => {
    // 실제 시나리오: 확장 로드 시 doSearch/customer_account/loadMyUser 등이 세션 없는 상태에서
    // itsmFetch를 10여 개 동시에 던진다. 각자 probe(401)를 찍으면 콘솔이 401로 도배된다.
    let probeCalls = 0, acquireCalls = 0, pollCalls = 0;
    const ctx = {
      key: 'itsm', needsToken: false, token: { value: null, expiry: 0 },
      probe: async () => { probeCalls++; await new Promise(r => setTimeout(r, 5)); return { state: 'invalid' }; },
      acquire: async () => { acquireCalls++; return 'redirected'; },
      poll: async () => { pollCalls++; await new Promise(r => setTimeout(r, 10)); return true; },
    };
    const { makeEnsure } = makeManager({ _acquireChain: Promise.resolve() });
    const ensure = makeEnsure(ctx);
    const results = await Promise.all(Array.from({ length: 10 }, () => ensure()));
    assert.deepStrictEqual(results, Array(10).fill(true));
    assert.strictEqual(probeCalls, 1, 'probe 1회(10개가 각자 401 안 찍음)');
    assert.strictEqual(acquireCalls, 1, 'redirect 1회');
    assert.strictEqual(pollCalls, 1, '폴링 1개 공유');
  });
  await test('토큰 유효(ITSM) → probe/acquire/poll 0회, 즉시 true', async () => {
    let acquireCalls = 0, pollCalls = 0, probeCalls = 0;
    const ctx = {
      key: 'itsm', needsToken: true, token: { value: 'TOK', expiry: Date.now() + 1e6 },
      probe: async () => { probeCalls++; return { state: 'invalid' }; },
      acquire: async () => { acquireCalls++; },
      poll: async () => { pollCalls++; return true; },
    };
    const { makeEnsure } = makeManager({ _acquireChain: Promise.resolve() });
    const ensure = makeEnsure(ctx);
    assert.strictEqual(await ensure(), true);
    assert.strictEqual(probeCalls, 0);
    assert.strictEqual(acquireCalls, 0);
    assert.strictEqual(pollCalls, 0);
  });
  await test('probe가 valid면 → acquire/poll 없이 true', async () => {
    let acquireCalls = 0, pollCalls = 0;
    const ctx = {
      key: 'itsm', needsToken: false, token: { value: null, expiry: 0 },
      probe: async () => ({ state: 'valid' }),
      acquire: async () => { acquireCalls++; },
      poll: async () => { pollCalls++; return true; },
    };
    const { makeEnsure } = makeManager({ _acquireChain: Promise.resolve() });
    const ensure = makeEnsure(ctx);
    assert.strictEqual(await ensure(), true);
    assert.strictEqual(acquireCalls, 0);
    assert.strictEqual(pollCalls, 0);
  });
  await test('poll 타임아웃(false) → false 반환, 이후 재호출 시 새 폴링', async () => {
    let pollCalls = 0;
    const ctx = {
      key: 'itsm', needsToken: false, token: { value: null, expiry: 0 },
      probe: async () => ({ state: 'invalid' }),
      acquire: async () => 'redirected',
      poll: async () => { pollCalls++; return false; },
    };
    const { makeEnsure } = makeManager({ _acquireChain: Promise.resolve() });
    const ensure = makeEnsure(ctx);
    assert.strictEqual(await ensure(), false);
    assert.strictEqual(await ensure(), false);
    assert.strictEqual(pollCalls, 2, 'Promise 리셋되어 매번 새 폴링');
  });

  console.log('전역 순차 큐 (ITSM→ONE360 경쟁 제거: 활성 탭 redirect 직렬):');
  await test('ITSM·ONE360 동시 invalid → redirect 겹치지 않고 직렬(1개씩)', async () => {
    // acquire가 겹치면(동시에 활성 탭 2번 바꾸면) 핑퐁. 그걸 방지하는지 "동시 실행 중 개수"로 검증.
    const shared = { _acquireChain: Promise.resolve() };
    const { makeEnsure } = makeManager(shared);
    let inFlight = 0, maxInFlight = 0;
    const order = [];
    function mkCtx(key) {
      return {
        key, needsToken: false, token: { value: null, expiry: 0 },
        probe: async () => ({ state: 'invalid' }),
        acquire: async () => {
          inFlight++; maxInFlight = Math.max(maxInFlight, inFlight);
          order.push('acq:' + key);
          await new Promise(r => setTimeout(r, 10));  // redirect 진행 중
          return 'redirected';
        },
        poll: async () => { await new Promise(r => setTimeout(r, 10)); inFlight--; order.push('ok:' + key); return true; },
      };
    }
    const itsm = makeEnsure(mkCtx('itsm'));
    const one360 = makeEnsure(mkCtx('one360'));
    // Case 탭(itsm) 먼저, 곧바로 Contracts 탭(one360) — 동시 트리거
    const [a, b] = await Promise.all([itsm(), one360()]);
    assert.strictEqual(a, true); assert.strictEqual(b, true);
    assert.strictEqual(maxInFlight, 1, '활성 탭 redirect는 한 번에 하나만(경쟁 없음)');
    // itsm이 먼저 큐에 붙었으니 itsm 확보 완료 후 one360 확보 시작
    assert.deepStrictEqual(order, ['acq:itsm', 'ok:itsm', 'acq:one360', 'ok:one360'], 'ITSM 완료→ONE360 순차');
  });
  await test('앞 시스템 실패해도 뒤 시스템 확보는 진행(체인 안 막힘)', async () => {
    const shared = { _acquireChain: Promise.resolve() };
    const { makeEnsure } = makeManager(shared);
    const order = [];
    const itsm = makeEnsure({
      key: 'itsm', needsToken: false, token: { value: null, expiry: 0 },
      probe: async () => ({ state: 'invalid' }),
      acquire: async () => { order.push('acq:itsm'); return 'redirected'; },
      poll: async () => { order.push('fail:itsm'); return false; },  // ITSM 확보 실패(timeout)
    });
    const one360 = makeEnsure({
      key: 'one360', needsToken: false, token: { value: null, expiry: 0 },
      probe: async () => ({ state: 'invalid' }),
      acquire: async () => { order.push('acq:one360'); return 'redirected'; },
      poll: async () => { order.push('ok:one360'); return true; },
    });
    const [a, b] = await Promise.all([itsm(), one360()]);
    assert.strictEqual(a, false, 'ITSM은 실패');
    assert.strictEqual(b, true, 'ONE360은 성공(앞 실패와 무관)');
    assert.deepStrictEqual(order, ['acq:itsm', 'fail:itsm', 'acq:one360', 'ok:one360']);
  });

  // ── 진행상태 리포터 (세션 확보 중 sidepanel에 단계 표시) ──
  // init-session.js 복제: phase→i18n 메시지키 매핑(순수함수) + setProgressReporter/report 안전성.
  // 왜: ensureSession 폴링(최대 90초) 동안 확장 popup이 "빈 스켈레톤"으로 보이던 문제를 메우려고,
  // 세션 단계(probing→redirecting/skip-idp→waiting→done/failed)를 sidepanel setProgress로 쏜다.
  // 콜백은 세션 로직에 영향 0이어야 하므로 report()는 리포터 미등록/예외에도 절대 throw 안 함.
  function phaseToMsgKey(phase) {
    switch (phase) {
      case 'probing':     return 'sessionChecking'; // 세션 확인 중
      case 'redirecting': return 'ssoIdp';          // SAP SSO 인증 중(활성 탭 redirect)
      case 'skip-idp':    return 'ssoIdp';           // 이미 IdP에서 OAuth 진행 중
      case 'waiting':     return 'itsmReturn';       // SSO 완료 폴링(세션 확립 중)
      case 'done':        return '';                 // 완료 → 메시지 지움
      case 'failed':      return '';                 // 실패 → 지움(상위에서 showError)
      default:            return '';
    }
  }
  // report 복제: 등록된 리포터가 있으면 (key, msgKey)로 호출, 예외는 삼킨다.
  function makeReport() {
    let reporter = null;
    return {
      setProgressReporter(fn) { reporter = typeof fn === 'function' ? fn : null; },
      report(key, phase) {
        if (!reporter) return;
        try { reporter(key, phaseToMsgKey(phase), phase); } catch (_) { /* 세션 로직 보호 */ }
      },
    };
  }

  console.log('진행상태 리포터 phase→메시지키 매핑:');
  await test("probing → 'sessionChecking'", () => assert.strictEqual(phaseToMsgKey('probing'), 'sessionChecking'));
  await test("redirecting → 'ssoIdp'", () => assert.strictEqual(phaseToMsgKey('redirecting'), 'ssoIdp'));
  await test("skip-idp → 'ssoIdp'", () => assert.strictEqual(phaseToMsgKey('skip-idp'), 'ssoIdp'));
  await test("waiting → 'itsmReturn'", () => assert.strictEqual(phaseToMsgKey('waiting'), 'itsmReturn'));
  await test("done → '' (메시지 지움)", () => assert.strictEqual(phaseToMsgKey('done'), ''));
  await test("failed → '' (메시지 지움)", () => assert.strictEqual(phaseToMsgKey('failed'), ''));
  await test("미지정 phase → '' (기본 안전)", () => assert.strictEqual(phaseToMsgKey('zzz'), ''));

  console.log('진행상태 리포터 안전성 (세션 로직 비파괴):');
  await test('리포터 미등록 → report() 호출해도 throw 안 함', () => {
    const r = makeReport();
    assert.doesNotThrow(() => r.report('itsm', 'probing'));
  });
  await test('리포터가 예외 던져도 report()는 삼킴', () => {
    const r = makeReport();
    r.setProgressReporter(() => { throw new Error('boom'); });
    assert.doesNotThrow(() => r.report('itsm', 'waiting'));
  });
  await test('등록된 리포터는 (key, msgKey, phase)로 호출됨', () => {
    const r = makeReport();
    const calls = [];
    r.setProgressReporter((key, msgKey, phase) => calls.push([key, msgKey, phase]));
    r.report('itsm', 'probing');
    r.report('itsm', 'waiting');
    r.report('itsm', 'done');
    assert.deepStrictEqual(calls, [
      ['itsm', 'sessionChecking', 'probing'],
      ['itsm', 'itsmReturn', 'waiting'],
      ['itsm', '', 'done'],
    ]);
  });
  await test('setProgressReporter(null)로 해제 → 이후 호출 무시', () => {
    const r = makeReport();
    let n = 0;
    r.setProgressReporter(() => n++);
    r.report('itsm', 'probing');
    r.setProgressReporter(null);
    r.report('itsm', 'waiting');
    assert.strictEqual(n, 1, '해제 후엔 리포터 호출 안 됨');
  });

  console.log(`\n✅ 전체 ${pass}개 테스트 통과`);
})().catch((e) => { console.error('\n❌ 테스트 실패:', e.message, '\n', e.stack); process.exit(1); });
