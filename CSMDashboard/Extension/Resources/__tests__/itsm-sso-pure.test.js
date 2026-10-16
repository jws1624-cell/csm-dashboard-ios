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

// ── init-session.js 복제: acquireRedirect의 IdP-생략 판정 ──
// IdP(OAuth code 교환 진행 중)에서만 redirect 생략. 자기/상대 도메인은 redirect(갇힘 방지).
const IDP_RE = new RegExp('://' + SHARED_IDP + '\\b', 'i');
function decideRedirect(tabUrl) {
  return IDP_RE.test(tabUrl || '') ? 'skip-idp' : 'redirect';
}

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
  // ctx: { key, needsToken, token, probe(), acquire(), poll() }
  function makeEnsure(ctx) {
    return async function ensure() {
      if (ctx.needsToken && ctx.token.value && Date.now() < ctx.token.expiry) return true;
      const res = await ctx.probe();
      if (res.state === 'valid') return true;
      if (!ctx._ssoPromise) {
        // 전역 체인에 직렬로 붙임: 앞선 시스템 확보가 끝나야 내 redirect가 시작된다.
        const run = sharedState._acquireChain.then(async () => {
          await ctx.acquire();      // 활성 탭을 loginUrl로 redirect (URL 판단 없음)
          return ctx.poll();        // valid 될 때까지(또는 timeout) 폴링
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

  console.log('decideRedirect (IdP만 생략 — code invalid 400 방지):');
  await test('활성탭=XSUAA IdP(OAuth 진행중) → skip-idp', () =>
    assert.strictEqual(decideRedirect('https://sapit-strategicservices-prod-falcon.authentication.eu10.hana.ondemand.com/oauth/authorize'), 'skip-idp'));
  await test('활성탭=IAS accounts.ondemand.com → skip-idp', () =>
    assert.strictEqual(decideRedirect('https://centralit.accounts.ondemand.com/saml2/idp/sso'), 'skip-idp'));
  await test('활성탭=accounts.sap.com → skip-idp', () =>
    assert.strictEqual(decideRedirect('https://accounts.sap.com/saml2/idp/sso'), 'skip-idp'));
  await test('활성탭=oauth_error 페이지(IdP 도메인) → skip-idp', () =>
    assert.strictEqual(decideRedirect('https://sapit-strategicservices-prod-falcon.authentication.eu10.hana.ondemand.com/oauth_error'), 'skip-idp'));
  await test('활성탭=itsm 자기 도메인(400 에러페이지) → redirect(갇힘 방지)', () =>
    assert.strictEqual(decideRedirect('https://itsm.services.sap/now/cwf/agent/home/list'), 'redirect'));
  await test('활성탭=one360 자기 도메인 → redirect', () =>
    assert.strictEqual(decideRedirect('https://one360.for.sap/app'), 'redirect'));
  await test('활성탭=상대 도메인(itsm when acquiring one360) → redirect(IdP 아니므로)', () =>
    assert.strictEqual(decideRedirect('https://itsm.services.sap/now'), 'redirect'));
  await test('활성탭=무관 도메인 → redirect', () =>
    assert.strictEqual(decideRedirect('https://www.google.com'), 'redirect'));
  await test('활성탭=빈 문자열 → redirect', () =>
    assert.strictEqual(decideRedirect(''), 'redirect'));

  console.log('ensureSession 공유가드 (같은 시스템 동시 호출 1폴링 공유):');
  await test('동시 4개 → acquire 1회·poll 1회, 전부 true', async () => {
    let acquireCalls = 0, pollCalls = 0, probeCalls = 0;
    const ctx = {
      key: 'itsm', needsToken: false, token: { value: null, expiry: 0 },
      probe: async () => { probeCalls++; return { state: 'invalid' }; },  // 아직 세션 없음
      acquire: async () => { acquireCalls++; },
      poll: async () => { pollCalls++; await new Promise(r => setTimeout(r, 15)); return true; },
    };
    const { makeEnsure } = makeManager({ _acquireChain: Promise.resolve() });
    const ensure = makeEnsure(ctx);
    const results = await Promise.all([ensure(), ensure(), ensure(), ensure()]);
    assert.strictEqual(acquireCalls, 1, 'acquireRedirect 1회(redirect 1회로 수렴)');
    assert.strictEqual(pollCalls, 1, '폴링 1개 공유');
    assert.deepStrictEqual(results, [true, true, true, true]);
    assert.strictEqual(probeCalls, 4, '초기 probe는 각자(값 싸고 상태 확인용)');
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
      acquire: async () => {},
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
      acquire: async () => { order.push('acq:itsm'); },
      poll: async () => { order.push('fail:itsm'); return false; },  // ITSM 확보 실패(timeout)
    });
    const one360 = makeEnsure({
      key: 'one360', needsToken: false, token: { value: null, expiry: 0 },
      probe: async () => ({ state: 'invalid' }),
      acquire: async () => { order.push('acq:one360'); },
      poll: async () => { order.push('ok:one360'); return true; },
    });
    const [a, b] = await Promise.all([itsm(), one360()]);
    assert.strictEqual(a, false, 'ITSM은 실패');
    assert.strictEqual(b, true, 'ONE360은 성공(앞 실패와 무관)');
    assert.deepStrictEqual(order, ['acq:itsm', 'fail:itsm', 'acq:one360', 'ok:one360']);
  });

  console.log(`\n✅ 전체 ${pass}개 테스트 통과`);
})().catch((e) => { console.error('\n❌ 테스트 실패:', e.message, '\n', e.stack); process.exit(1); });
