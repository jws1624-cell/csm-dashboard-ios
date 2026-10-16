'use strict';
// ITSM/ONE360 SSO 진행중-감지 + 공유 세션 가드 순수 로직 단위 테스트 (DOM/네트워크 비의존).
// init-session.js(isSsoInProgressUrl) / sidepanel.js(ensureItsmSession 공유 가드, one360 진행중 감지)에서
// 그대로 복제한 로직을, 중복 redirect 방지와 "진행 중이면 건드리지 않음"이 성립하는지 검증.
const assert = require('assert');

// ── init-session.js 포팅분: ITSM용 SSO 진행중 URL 감지 ──
// 활성 탭이 이미 ITSM 또는 SAP SSO IdP 도메인이면 "로그인 진행 중"으로 보고 redirect를 생략한다.
function isItsmSsoInProgressUrl(url) {
  if (!url) return false;
  return /:\/\/(itsm\.services\.sap|accounts\.sap\.com|[^/]*\.accounts\.ondemand\.com|[^/]*\.authentication\.[^/]*\.hana\.ondemand\.com)\b/i.test(url);
}

// ── sidepanel.js 포팅분: ONE360용 SSO 진행중 URL 감지 ──
// one360.for.sap + 동일 SAP SSO IdP 도메인.
function isOne360SsoInProgressUrl(url) {
  if (!url) return false;
  return /:\/\/(one360\.for\.sap|accounts\.sap\.com|[^/]*\.accounts\.ondemand\.com|[^/]*\.authentication\.[^/]*\.hana\.ondemand\.com)\b/i.test(url);
}

// ── init-session.js 포팅분: fetchGck 세션 판정 규칙 ──
// g_ck는 미로그인 login.do(SSO 랜딩)에도 익명 토큰으로 들어있으므로, "g_ck 추출됨"만으론 세션 판정 불가.
// 추출한 g_ck로 보호 API 프로브 → 200일 때만 세션 유효. (hadGckMatch=false면 추출조차 실패 = 세션 없음)
// probeStatus: 프로브 응답 상태코드(네트워크 예외는 호출부에서 null 전달).
function isSessionOk(hadGckMatch, probeStatus) {
  if (!hadGckMatch) return false;          // g_ck 추출 실패 → 세션 없음
  if (probeStatus == null) return false;   // 프로브 네트워크 오류 → 세션 없음
  return probeStatus >= 200 && probeStatus < 300; // 2xx만 진짜 로그인 세션
}

// ── 비동기 테스트 러너 (one360-pure.test.js는 동기 러너라 여기선 async 지원판 사용) ──
let pass = 0;
async function test(name, fn) { await fn(); pass++; console.log('  ✓', name); }

(async () => {
  console.log('isItsmSsoInProgressUrl:');
  await test('itsm.services.sap → true', () => assert.strictEqual(isItsmSsoInProgressUrl('https://itsm.services.sap/now/cwf/agent/home/list'), true));
  await test('accounts.sap.com(IdP) → true', () => assert.strictEqual(isItsmSsoInProgressUrl('https://accounts.sap.com/saml2/idp/sso'), true));
  await test('IAS *.accounts.ondemand.com → true', () => assert.strictEqual(isItsmSsoInProgressUrl('https://axyz123.accounts.ondemand.com/login'), true));
  await test('XSUAA *.authentication.*.hana.ondemand.com → true', () => assert.strictEqual(isItsmSsoInProgressUrl('https://foo.authentication.eu10.hana.ondemand.com/oauth/authorize'), true));
  await test('무관 사이트 → false', () => assert.strictEqual(isItsmSsoInProgressUrl('https://www.google.com/'), false));
  await test('one360(ITSM 아님) → false', () => assert.strictEqual(isItsmSsoInProgressUrl('https://one360.for.sap/'), false));
  await test('빈 문자열 → false', () => assert.strictEqual(isItsmSsoInProgressUrl(''), false));
  await test('null → false', () => assert.strictEqual(isItsmSsoInProgressUrl(null), false));
  await test('undefined → false', () => assert.strictEqual(isItsmSsoInProgressUrl(undefined), false));

  console.log('isOne360SsoInProgressUrl:');
  await test('one360.for.sap → true', () => assert.strictEqual(isOne360SsoInProgressUrl('https://one360.for.sap/app/x'), true));
  await test('accounts.sap.com(IdP) → true', () => assert.strictEqual(isOne360SsoInProgressUrl('https://accounts.sap.com/saml2/idp/sso'), true));
  await test('IAS *.accounts.ondemand.com → true', () => assert.strictEqual(isOne360SsoInProgressUrl('https://axyz123.accounts.ondemand.com/login'), true));
  await test('무관 사이트 → false', () => assert.strictEqual(isOne360SsoInProgressUrl('https://www.google.com/'), false));
  await test('itsm(ONE360 아님) → false', () => assert.strictEqual(isOne360SsoInProgressUrl('https://itsm.services.sap/'), false));
  await test('null → false', () => assert.strictEqual(isOne360SsoInProgressUrl(null), false));

  // ── 공유 세션 가드: ensureItsmSession 핵심 로직(window/retriggerSso mock) ──
  // doSearch의 병렬 N개 + 메인 조회가 하나의 폴링을 공유해 retriggerSso(=redirect)가 1회만 돌아야 한다.
  console.log('ensureItsmSession 공유 가드:');

  // 가드 로직 복제본 (sidepanel.js ensureItsmSession과 동일 구조). win/_shared를 인자로 주입해 테스트.
  function makeEnsure(win) {
    let shared = null;
    return async function ensure() {
      if (win._gck && Date.now() < win._gckExpiry) return true;
      if (typeof win.retriggerSso !== 'function') return false;
      if (!shared) {
        shared = new Promise((resolve) => win.retriggerSso(resolve)).finally(() => { shared = null; });
      }
      const ok = await shared;
      return ok && !!win._gck && Date.now() < win._gckExpiry;
    };
  }

  await test('동시 4개 호출 → retriggerSso 1회만, 전부 true', async () => {
    let calls = 0;
    const win = {
      _gck: null, _gckExpiry: 0,
      retriggerSso: (cb) => {
        calls++;
        setTimeout(() => { win._gck = 'TOK'; win._gckExpiry = Date.now() + 1e6; cb(true); }, 20);
      },
    };
    const ensure = makeEnsure(win);
    const results = await Promise.all([ensure(), ensure(), ensure(), ensure()]);
    assert.strictEqual(calls, 1, 'retriggerSso는 1회만 호출(redirect 1회)');
    assert.deepStrictEqual(results, [true, true, true, true]);
  });

  await test('세션 이미 있으면 → retriggerSso 0회, 즉시 true', async () => {
    let calls = 0;
    const win = { _gck: 'TOK', _gckExpiry: Date.now() + 1e6, retriggerSso: () => { calls++; } };
    const ensure = makeEnsure(win);
    assert.strictEqual(await ensure(), true);
    assert.strictEqual(calls, 0, '세션 유효하면 retriggerSso 미호출');
  });

  await test('폴링 타임아웃(callback(false)) → false, _gck 미세팅', async () => {
    let calls = 0;
    const win = {
      _gck: null, _gckExpiry: 0,
      retriggerSso: (cb) => { calls++; setTimeout(() => cb(false), 10); }, // 로그인 실패/타임아웃
    };
    const ensure = makeEnsure(win);
    const r = await ensure();
    assert.strictEqual(r, false, '세션 못 얻으면 false');
    assert.strictEqual(calls, 1);
  });

  await test('성공 후 Promise 리셋 → 다음 만료 때 새 폴링 1회', async () => {
    let calls = 0;
    const win = {
      _gck: null, _gckExpiry: 0,
      retriggerSso: (cb) => {
        calls++;
        setTimeout(() => { win._gck = 'TOK' + calls; win._gckExpiry = Date.now() + 1e6; cb(true); }, 10);
      },
    };
    const ensure = makeEnsure(win);
    assert.strictEqual(await ensure(), true);       // 1회차 폴링
    assert.strictEqual(calls, 1);
    win._gck = null; win._gckExpiry = 0;            // 세션 만료 모사
    assert.strictEqual(await ensure(), true);       // 2회차 폴링(가드 리셋됐으므로 새로 돈다)
    assert.strictEqual(calls, 2);
  });

  // ── fetchGck 세션 판정 규칙 ──
  // 핵심 회귀 방지: "미로그인 login.do의 익명 g_ck(추출 성공=true) + 프로브 401" → 세션 없음(false)이어야 한다.
  console.log('isSessionOk (fetchGck 프로브 판정):');
  await test('g_ck 추출O + 프로브 200 → 세션 있음(true)', () => assert.strictEqual(isSessionOk(true, 200), true));
  await test('g_ck 추출O + 프로브 401(익명 g_ck) → 세션 없음(false)', () => assert.strictEqual(isSessionOk(true, 401), false));
  await test('g_ck 추출O + 프로브 403 → 세션 없음(false)', () => assert.strictEqual(isSessionOk(true, 403), false));
  await test('g_ck 추출O + 프로브 네트워크오류(null) → 세션 없음(false)', () => assert.strictEqual(isSessionOk(true, null), false));
  await test('g_ck 추출X → 세션 없음(false)', () => assert.strictEqual(isSessionOk(false, 200), false));
  await test('g_ck 추출O + 프로브 204 → 세션 있음(true)', () => assert.strictEqual(isSessionOk(true, 204), true));

  console.log(`\n✅ 전체 ${pass}개 테스트 통과`);
})().catch((e) => { console.error('\n❌ 테스트 실패:', e.message); process.exit(1); });
