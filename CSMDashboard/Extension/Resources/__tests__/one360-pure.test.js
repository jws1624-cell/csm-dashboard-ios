'use strict';
// ONE360 포팅 순수 함수 단위 테스트 (DOM 비의존).
// background.js / sidepanel.js에서 그대로 복제한 함수를 Chrome 원본과 동일 동작하는지 검증.
const assert = require('assert');

// ── background.js 포팅분 ──
function makeFilterBlock(values) {
  return [{
    connectionOperator: 'AND', operator: 'AND',
    properties: { immutable: false, showInFrontend: true },
    values: values.map((v, i) => ({
      column: v.column, operator: v.operator || 'IN', values: v.values,
      isFilledFromContext: true, filterBlockId: 'runtimeFilterBlock',
      isDatablockFilter: false, connectionOperator: 'AND',
      isNucleusFilter: true, nucleusFilterId: `nucleus_id_${i}`,
    })),
    filterBlockId: 'runtimeFilterBlock', isFilledFromContext: false,
  }];
}
function makeParams(extras = []) {
  return [
    { parameter: 'RESPONSIBILITY_SCENARIO', values: ['381'], isNucleusParameterValue: true, nucleusParameterId: 'p_rs' },
    { parameter: 'IN_CURRENCY', values: ['EUR'], isNucleusParameterValue: true, nucleusParameterId: 'p_cur' },
    ...extras,
  ];
}
function saBucketOf(saKey) {
  const s = String(saKey || '').toUpperCase();
  if (s.startsWith('SADA') || s.includes('DATA & AI') || s.includes('DATA AND AI') || s.includes('BAIP')) return 'BDC';
  if (s.startsWith('SABTP') || s.includes('BUSINESS TECHNOLOGY') || /\bBTP\b/.test(s)) return 'BTP';
  return 'OTHER';
}

// ── sidepanel.js 포팅분 ──
function selectedSaNamesFrom(comps) {
  return { bdc: comps.includes('BDC'), btp: comps.includes('BTP'), other: comps.includes('OTHER') };
}
function saMatches(saValue, active) {
  const s = String(saValue || '').toUpperCase();
  const isBdc = s.includes('SADA') || s.includes('DATA & AI') || s.includes('DATA AND AI') || s.includes('BAIP');
  const isBtp = s.includes('SABTP') || s.includes('BUSINESS TECHNOLOGY') || s.includes('BTP');
  if (isBdc) return active.bdc;
  if (isBtp) return active.btp;
  return active.other;
}
function bucketMatches(row, active) {
  const bucket = row && row._saBucket;
  if (bucket === 'BDC') return active.bdc;
  if (bucket === 'BTP') return active.btp;
  if (bucket === 'OTHER') return active.other;
  const v = (row && (row.values || row)) || {};
  const l = (row && row.labels) || {};
  const sa = l.Solution_Area_ID || v.Solution_Area_ID || v.Sub_Solution_Area || v.Solution_Area || '';
  return saMatches(sa, active);
}
function latestTrendPoint(entry) {
  if (!entry || !entry.rows || !entry.rows.length) return null;
  const pts = entry.rows.map(r => r.values || r)
    .sort((a, b) => String(a.CalendarMonthYYYYMM).localeCompare(String(b.CalendarMonthYYYYMM)));
  const last = pts[pts.length - 1];
  if (!last) return null;
  return { used: Number(last.No_Utilized_Max_ || 0), sub: Number(last.No_Entitled_Max_ || 0) };
}
function ratioTone(ratio) {
  if (ratio == null) return undefined;
  if (ratio >= 100) return 'warn';
  if (ratio >= 85) return 'warn';
  return 'ok';
}
function fmtMonth(raw) {
  const s = String(raw || '');
  if (/^\d{6}$/.test(s)) return `${s.slice(0, 4)}-${s.slice(4, 6)}`;
  return s.slice(0, 7);
}

let pass = 0;
function test(name, fn) { fn(); pass++; console.log('  ✓', name); }

console.log('saBucketOf:');
test('SADA.2026 → BDC', () => assert.strictEqual(saBucketOf('SADA.2026'), 'BDC'));
test('SABTP.2026 → BTP', () => assert.strictEqual(saBucketOf('SABTP.2026'), 'BTP'));
test('Data & AI → BDC', () => assert.strictEqual(saBucketOf('Data & AI'), 'BDC'));
test('BAIP → BDC', () => assert.strictEqual(saBucketOf('BAIP something'), 'BDC'));
test('Business Technology → BTP', () => assert.strictEqual(saBucketOf('Business Technology Platform'), 'BTP'));
test('BTP 단어 → BTP', () => assert.strictEqual(saBucketOf('X BTP Y'), 'BTP'));
test('SAHXM.2026 → OTHER', () => assert.strictEqual(saBucketOf('SAHXM.2026'), 'OTHER'));
test('빈값 → OTHER', () => assert.strictEqual(saBucketOf(''), 'OTHER'));
test('null → OTHER', () => assert.strictEqual(saBucketOf(null), 'OTHER'));

console.log('makeFilterBlock:');
test('구조/필드 생성', () => {
  const fb = makeFilterBlock([{ column: 'Account_ID', values: ['123'] }]);
  assert.strictEqual(fb[0].connectionOperator, 'AND');
  assert.strictEqual(fb[0].values[0].column, 'Account_ID');
  assert.strictEqual(fb[0].values[0].operator, 'IN');
  assert.deepStrictEqual(fb[0].values[0].values, ['123']);
  assert.strictEqual(fb[0].values[0].nucleusFilterId, 'nucleus_id_0');
});
test('operator override', () => {
  const fb = makeFilterBlock([{ column: 'X', values: ['a'], operator: 'EQ' }]);
  assert.strictEqual(fb[0].values[0].operator, 'EQ');
});

console.log('makeParams:');
test('기본 RS+Currency', () => {
  const p = makeParams();
  assert.strictEqual(p.length, 2);
  assert.strictEqual(p[0].parameter, 'RESPONSIBILITY_SCENARIO');
  assert.deepStrictEqual(p[0].values, ['381']);
  assert.strictEqual(p[1].parameter, 'IN_CURRENCY');
});

console.log('bucketMatches (_saBucket 우선):');
const ALL = selectedSaNamesFrom(['BDC','BTP','OTHER']);
test('_saBucket=BDC, BDC체크 → true', () => assert.strictEqual(bucketMatches({_saBucket:'BDC'}, ALL), true));
test('_saBucket=BDC, BDC해제 → false', () => assert.strictEqual(bucketMatches({_saBucket:'BDC'}, selectedSaNamesFrom(['BTP'])), false));
test('_saBucket 없음 → SA문자열 폴백(SADA)', () => assert.strictEqual(bucketMatches({values:{Solution_Area_ID:'SADA.2026'}}, selectedSaNamesFrom(['BDC'])), true));
test('_saBucket=OTHER, OTHER체크 → true', () => assert.strictEqual(bucketMatches({_saBucket:'OTHER'}, ALL), true));

console.log('fmtMonth:');
test('YYYYMM → YYYY-MM', () => assert.strictEqual(fmtMonth('202601'), '2026-01'));
test('YYYY-MM-DD → YYYY-MM', () => assert.strictEqual(fmtMonth('2026-03-15'), '2026-03'));

console.log('ratioTone:');
test('null → undefined', () => assert.strictEqual(ratioTone(null), undefined));
test('120 → warn', () => assert.strictEqual(ratioTone(120), 'warn'));
test('90 → warn', () => assert.strictEqual(ratioTone(90), 'warn'));
test('50 → ok', () => assert.strictEqual(ratioTone(50), 'ok'));

console.log('latestTrendPoint:');
test('최신월 선택', () => {
  const e = { rows: [
    { values: { CalendarMonthYYYYMM:'202601', No_Utilized_Max_:10, No_Entitled_Max_:100 } },
    { values: { CalendarMonthYYYYMM:'202603', No_Utilized_Max_:30, No_Entitled_Max_:100 } },
    { values: { CalendarMonthYYYYMM:'202602', No_Utilized_Max_:20, No_Entitled_Max_:100 } },
  ]};
  assert.deepStrictEqual(latestTrendPoint(e), { used:30, sub:100 });
});
test('빈 → null', () => assert.strictEqual(latestTrendPoint({rows:[]}), null));

console.log(`\n✅ 전체 ${pass}개 테스트 통과`);
