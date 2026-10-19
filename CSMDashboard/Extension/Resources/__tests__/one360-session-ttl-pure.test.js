'use strict';
// ONE360 "프로브 성공 TTL" 낙관 캐시 + invalidate + getToken 분리 단위 테스트 (DOM 비의존).
//
// init-session.js 의 세션 캐시 1단계 규칙을 순수화해 복제. 실제 코드와 동일 동작해야 함.
//   - ensureSession 1단계: cfg.token.value && Date.now() < cfg.token.expiry → 즉시 true (needsToken 무관)
//   - getToken: needsToken 게이트 유지 → ONE360 센티넬('probe-ok')은 헤더로 유출 안 됨
//   - ONE360 probe valid → token={'probe-ok', now+PROBE_OK_TTL_MS}, invalid → {null,0}
//   - invalidate(key): token 폐기(끊김 신호 시 재확보 전 호출, 낙관 캐시 거짓 통과 방지)
const assert = require('assert');

let pass = 0, fail = 0;
function t(name, cond) { if (cond) { pass++; } else { fail++; console.log('  ✗ FAIL:', name); } }

const TOKEN_TTL_MS = 15 * 60 * 1000;
const PROBE_OK_TTL_MS = 5 * 60 * 1000;

// ── init-session.js 복제: cfg.token 기반 캐시 모델 ──
function makeSystem(key, needsToken) {
  return { key, needsToken, token: { value: null, expiry: 0 } };
}
// ensureSession 1단계 (needsToken 게이트 없음 — ITSM/ONE360 대칭)
function cacheOkStep(cfg, now) {
  return !!(cfg.token.value && now < cfg.token.expiry);
}
// getToken (needsToken 게이트 유지 — 센티넬 유출 차단)
function getToken(cfg, now) {
  if (!cfg || !cfg.needsToken) return null;
  return (cfg.token.value && now < cfg.token.expiry) ? cfg.token.value : null;
}
// ONE360 probe 결과 반영 (sidepanel.js probe 끝부분과 동일)
function applyOne360Probe(cfg, state, now) {
  if (state === 'valid') { cfg.token.value = 'probe-ok'; cfg.token.expiry = now + PROBE_OK_TTL_MS; }
  else { cfg.token.value = null; cfg.token.expiry = 0; }
}
// ITSM probe 성공 반영 (itsmProbe valid 분기와 동일)
function applyItsmValid(cfg, gck, now) {
  cfg.token.value = gck; cfg.token.expiry = now + TOKEN_TTL_MS;
}
function invalidate(cfg) {
  cfg.token.value = null; cfg.token.expiry = 0;
}

const T0 = 1_000_000_000_000;

console.log('[1] ONE360 프로브 성공 → TTL 내 1단계 즉시 통과');
(function(){
  const one360 = makeSystem('one360', false);
  applyOne360Probe(one360, 'valid', T0);
  t('valid 직후 캐시 심김', one360.token.value === 'probe-ok');
  t('TTL 내(4분 뒤) 통과', cacheOkStep(one360, T0 + 4 * 60 * 1000) === true);
  t('TTL 경계 직전 통과', cacheOkStep(one360, T0 + PROBE_OK_TTL_MS - 1) === true);
})();

console.log('[2] TTL 경과 → 1단계 불통(재프로브 필요)');
(function(){
  const one360 = makeSystem('one360', false);
  applyOne360Probe(one360, 'valid', T0);
  t('TTL 지나면(6분 뒤) 불통', cacheOkStep(one360, T0 + 6 * 60 * 1000) === false);
  t('TTL 정확히 만료시각엔 불통', cacheOkStep(one360, T0 + PROBE_OK_TTL_MS) === false);
})();

console.log('[3] 프로브 invalid(401 등) → 캐시 안 심음');
(function(){
  const one360 = makeSystem('one360', false);
  applyOne360Probe(one360, 'invalid', T0);
  t('invalid면 value null', one360.token.value === null);
  t('invalid면 1단계 불통', cacheOkStep(one360, T0) === false);
  // login-redirect도 invalid와 동일(valid 아님)
  const o2 = makeSystem('one360', false);
  applyOne360Probe(o2, 'login-redirect', T0);
  t('login-redirect도 캐시 안 심음', cacheOkStep(o2, T0) === false);
})();

console.log('[4] invalidate 후 1단계 불통');
(function(){
  const one360 = makeSystem('one360', false);
  applyOne360Probe(one360, 'valid', T0);
  t('invalidate 전 통과', cacheOkStep(one360, T0) === true);
  invalidate(one360);
  t('invalidate 후 불통', cacheOkStep(one360, T0) === false);
})();

console.log('[5] getToken 분리 — 센티넬 유출 차단');
(function(){
  const one360 = makeSystem('one360', false);
  applyOne360Probe(one360, 'valid', T0);
  t('ONE360(needsToken:false)는 캐시 있어도 getToken=null', getToken(one360, T0) === null);
  const itsm = makeSystem('itsm', true);
  applyItsmValid(itsm, 'ABCDEF1234', T0);
  t('ITSM(needsToken:true)는 getToken=실제 g_ck', getToken(itsm, T0) === 'ABCDEF1234');
  t('ITSM TTL 경과 후 getToken=null', getToken(itsm, T0 + TOKEN_TTL_MS) === null);
})();

console.log('[6] ITSM 회귀 — 1단계 일반화가 ITSM 동작을 안 바꿈');
(function(){
  const itsm = makeSystem('itsm', true);
  t('초기 상태 불통', cacheOkStep(itsm, T0) === false);
  applyItsmValid(itsm, 'GCK99', T0);
  t('g_ck 확정 후 TTL 내 통과', cacheOkStep(itsm, T0 + 10 * 60 * 1000) === true);
  t('g_ck TTL(15분) 경과 후 불통', cacheOkStep(itsm, T0 + TOKEN_TTL_MS) === false);
  invalidate(itsm);
  t('ITSM invalidate 후 불통', cacheOkStep(itsm, T0) === false);
})();

console.log(`\n[최종] ONE360 세션 TTL 캐시 테스트: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
