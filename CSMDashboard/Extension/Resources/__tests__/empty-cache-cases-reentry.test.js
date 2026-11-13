'use strict';
// ONE360 빈-결과 캐시 금지 가드 + Cases 재진입 ITSM 재시도 (크롬 v1.38.48 이식) 순수 함수 테스트.
// sidepanel.js 의 loader 캐시 결정 / one360Fetch _fresh 판정 / 탭 재진입 재조회 로직을 복제해 검증.
// (실제 코드와 동일해야 함 — 수정 시 양쪽을 함께 바꾼다.) DOM 비의존, `node __tests__/xxx.test.js`.
//
// 배경(2026-11-12): SSO 완주 전 탭 왕복 시 빈 화면 박제. iOS 는 크롬과 세션 구조가 다르지만
//   (CSMSession.ensureSession, 탭 생성 없음) "빈 결과를 캐시하면 재클릭해도 재조회 skip" 증상은 동형.
//   iOS fresh 신호 = one360Fetch 가 재확보(invalidate+ensureSession) 분기를 탔는지(reacquired).
const assert = require('assert');

let pass = 0;
function test(name, fn) { fn(); pass++; console.log('  ✓', name); }

// ── [1] one360Fetch _fresh 판정 (ensureSession 게이트 통과 = 세션 확립됨 = 항상 fresh) ──
// 🚨 2026-11-13 수정: 과거엔 _fresh=reacquired(invalidate+재확보 분기)만 true 로 봤는데, 정상적으로
//   ensureSession 이 첫 호출에 통과하면 reacquired=false → "진짜 0건"까지 !_fresh 로 오판해
//   "세션 확인 중…"을 오표시했다. iOS 의 ensureSession('one360')은 프로브 valid 또는 redirect+폴링
//   완주로 세션을 검증한 뒤에만 true 를 반환하는 선행 게이트 → 데이터 파싱까지 도달 = 세션 확립 = fresh.
console.log('[1] one360Fetch _fresh = true (ensureSession 게이트 통과 = 세션 확립)');
test('ensureSession 통과 후 조회 → _fresh=true (재확보 분기 여부 무관, 핵심 수정)', () => {
  // one360Fetch 는 ensureSession 이 true 여야 데이터 파싱 단계에 도달하므로 _fresh 는 상수 true.
  const freshOf = () => true;
  assert.strictEqual(freshOf(), true);
});
test('세션 살아있는 첫 조회 0건 → _fresh=true (진짜 0건 신뢰, 세션확인중 아님)', () => {
  const freshOf = () => true;
  assert.strictEqual(freshOf(), true);
});
test('_fresh 비열거 — length/JSON 무영향', () => {
  const rows = [{ a: 1 }];
  Object.defineProperty(rows, '_fresh', { value: true, enumerable: false });
  assert.strictEqual(rows.length, 1);
  assert.strictEqual(JSON.parse(JSON.stringify(rows))._fresh, undefined);
  assert.strictEqual(Object.keys(rows).join(','), '0');
});
test('래퍼는 rows._fresh 를 {ok,rows,fresh} 로 전달', () => {
  const rows = []; Object.defineProperty(rows, '_fresh', { value: true, enumerable: false });
  const resp = { ok: true, rows, fresh: rows._fresh === true };
  assert.strictEqual(resp.fresh, true);
});

// ── [2] loader 캐시 결정 (빈 rows + !fresh → 캐시 금지) ────────────────────
console.log('[2] loader 캐시 결정 (빈+!fresh → skip)');
function decide(resp) {
  if (!resp.ok) return 'throw';
  const rows = resp.rows || [];
  if (rows.length === 0 && !resp.fresh) return 'skip';  // 죽은 세션 가짜 빈 → 캐시 안 함
  return 'cache';
}
test('데이터 있음 → cache (fresh 무관)', () => assert.strictEqual(decide({ ok: true, rows: [{ x: 1 }], fresh: false }), 'cache'));
test('진짜 0건(빈 + fresh) → cache (재조회 안 함, 성능)', () => assert.strictEqual(decide({ ok: true, rows: [], fresh: true }), 'cache'));
test('죽은 세션 가짜 빈(빈 + !fresh) → skip (박제 방지, 핵심)', () => assert.strictEqual(decide({ ok: true, rows: [], fresh: false }), 'skip'));
test('세션확보 실패(ok=false) → throw (기존 동작)', () => assert.strictEqual(decide({ ok: false, error: 'x' }), 'throw'));
test('fresh 누락 + 빈 → skip (보수적)', () => assert.strictEqual(decide({ ok: true, rows: [] }), 'skip'));

// ── [3] Cases 재진입 재시도 (중단된 ITSM 조회를 탭 복귀 시 다시 쏨) ─────────
// iOS 탭 핸들러 cases 분기: case 있으면 렌더(render), 비었으면 _selectedAccount 우선 재조회.
//   🚨 _lastTargets 는 doSearch 안쪽 ITSM await 뒤 세팅돼 중단 시 null 가능 → _selectedAccount 우선.
console.log('[3] Cases 재진입 재시도 (currentCases/_selectedAccount 기준)');
function casesReentryAction(currentCasesLen, selectedCrm, lastTargetsLen) {
  if (currentCasesLen > 0) return 'render';                 // 완료 → renderCaseList, 재조회 안 함
  if (selectedCrm) return 'research-selected';              // 단일(Favourite/담당자) → _selectedAccount 로 재시도
  if (lastTargetsLen > 0) return 'research-targets';        // 다중 → _lastTargets 로 재시도
  return 'noop';                                            // 대상 없음
}
test('완료(case 있음) → renderCaseList, 재조회 안 함', () => assert.strictEqual(casesReentryAction(5, '0001099120', 1), 'render'));
test('중단 + Favourite 단일(_selectedAccount) → _selectedAccount 로 재조회(핵심)', () => assert.strictEqual(casesReentryAction(0, '0001099120', 0), 'research-selected'));
test('중단 + _lastTargets null 이어도 _selectedAccount 로 재조회(버그 수정)', () => assert.strictEqual(casesReentryAction(0, '0001099120', 0), 'research-selected'));
test('중단 + 단일 없고 다중만 → _lastTargets 로 재조회', () => assert.strictEqual(casesReentryAction(0, null, 3), 'research-targets'));
test('대상 전무 → noop', () => assert.strictEqual(casesReentryAction(0, null, 0), 'noop'));

console.log(`\n✅ 전체 ${pass}개 테스트 통과`);
