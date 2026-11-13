'use strict';
// searchUnified 고객사 매칭 소스 통일(ITSM nameCONTAINS + 로컬 dedup 병합) + 케이스 IN절 조회
// 순수 함수 테스트 (크롬 v1.38.52 이식). sidepanel.js searchUnified 의 순수 로직을 복제해 검증한다.
// (실제 코드와 동일해야 함 — 수정 시 양쪽을 함께 바꾼다.) DOM 비의존, `node __tests__/xxx.test.js`.
//
// 배경(2026-11-13): 자동완성 드롭다운은 ITSM customer_account 를 nameCONTAINS 로 전역 다건 조회하는데
//   통합검색(searchUnified)은 로컬 korea-accounts.json 서브셋만 includes 필터해, 드롭다운엔 여러
//   후보가 뜨는데 조회 리스트엔 로컬에 있는 1건만 나오는 불일치가 있었다(예: "sk innovation").
//   iOS 는 추가로 케이스 조회가 느린 short_descriptionLIKE 였어서 account IN 절로 함께 교체.
const assert = require('assert');

let pass = 0;
function test(name, fn) { fn(); pass++; console.log('  ✓', name); }

// ── [1] 고객사 매칭 ITSM+로컬 병합 (crmId dedup) ──────────────────────────
function mergeAccountHits(localHits, itsmHits) {
  const byCrm = new Map();
  for (const a of [...localHits, ...itsmHits]) {
    const key = String(a.crmId).replace(/^0+/, '');
    if (!key) continue;
    if (!byCrm.has(key)) byCrm.set(key, a);
  }
  return [...byCrm.values()];
}
console.log('[1] 고객사 매칭 ITSM+로컬 병합 (crmId dedup)');
test('ITSM 다건이 조회 결과에 포함 (불일치 해소, 핵심)', () => {
  const local = [{ crmId: '0001170176', name: 'SK Innovation E&S' }];
  const itsm = [
    { crmId: '0012817703', name: 'SK Innovation' },
    { crmId: '0009337528', name: 'SK Innovation Co., Ltd.' },
    { crmId: '0003202642', name: 'TSK Innovations Inc.' },
    { crmId: '0001170176', name: 'SK Innovation E&S' },
  ];
  assert.strictEqual(mergeAccountHits(local, itsm).length, 4);
});
test('crmId dedup — 중복 제거', () => {
  const local = [{ crmId: '0001170176', name: 'E&S' }];
  const itsm = [{ crmId: '0001170176', name: 'E&S' }];
  assert.strictEqual(mergeAccountHits(local, itsm).length, 1);
});
test('로컬 우선 — 같은 crmId 는 로컬 항목 유지(메타 보강)', () => {
  const local = [{ crmId: '0001170176', name: 'E&S', owner: 'WooSuk' }];
  const itsm = [{ crmId: '0001170176', name: 'E&S' }];
  assert.strictEqual(mergeAccountHits(local, itsm)[0].owner, 'WooSuk');
});
test('선행 0 달라도 같은 crmId 로 dedup', () => {
  assert.strictEqual(mergeAccountHits([{ crmId: '1170176', name: 'X' }], [{ crmId: '0001170176', name: 'Y' }]).length, 1);
});
test('ITSM 실패 시 로컬만으로 degrade', () => {
  assert.strictEqual(mergeAccountHits([{ crmId: '0001170176', name: 'E&S' }], []).length, 1);
});
test('양쪽 빈 → 빈 배열', () => assert.strictEqual(mergeAccountHits([], []).length, 0));
test('crmId 없는 항목 스킵', () => assert.strictEqual(mergeAccountHits([], [{ crmId: '', name: 'bad' }]).length, 0));

// ── [2] 케이스 조회 IN 절 (고객사 다건 → account.u_sap_crm_bp_numberIN) ────
function accountCaseQuery(crmIds) {
  const ids = (Array.isArray(crmIds) ? crmIds : [crmIds]).slice(0, 20).map(id => String(id)).filter(Boolean);
  const inClause = ids.map(id => encodeURIComponent(id)).join(',');
  return `account.u_sap_crm_bp_numberIN${inClause}^ORDERBYDESCsys_updated_on`;
}
console.log('[2] 케이스 조회 IN 절');
test('단건 → IN 절', () => assert.strictEqual(accountCaseQuery(['0001128327']), 'account.u_sap_crm_bp_numberIN0001128327^ORDERBYDESCsys_updated_on'));
test('다건 → IN 콤마결합(여러 고객사 케이스 한 번에)', () => assert.strictEqual(accountCaseQuery(['0001128327', '0009337528']), 'account.u_sap_crm_bp_numberIN0001128327,0009337528^ORDERBYDESCsys_updated_on'));
test('고객사 매칭 시 short_descriptionLIKE 안 씀(느린 쿼리 회피)', () => {
  const q = accountCaseQuery(['0001170176']);
  assert.ok(!/short_descriptionLIKE/.test(q));
});

// ── [3] 소스 drift 가드 — 실제 sidepanel.js 가 ITSM 조회 + IN 절을 쓰는지 ──
console.log('[3] 소스 drift 가드');
test('searchUnified 가 customer_account nameCONTAINS 조회(자동완성과 동일 소스)', () => {
  const fs = require('fs');
  const path = require('path');
  const src = fs.readFileSync(path.join(__dirname, '..', 'sidepanel.js'), 'utf8');
  const s = src.indexOf('async function searchUnified');
  const body = s >= 0 ? src.slice(s, src.indexOf('\nasync function ', s + 10)) : '';
  assert.ok(/customer_account\?sysparm_query=nameCONTAINS/.test(body), 'ITSM nameCONTAINS 조회 없음');
  assert.ok(/account\.u_sap_crm_bp_numberIN/.test(body), 'account IN 절 케이스 조회 없음');
});

console.log(`\n✅ 전체 ${pass}개 테스트 통과`);
