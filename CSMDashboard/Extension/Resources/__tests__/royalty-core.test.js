// royalty-core.test.js — royalty-core.js 순수 로직 + royalty 통합 소스 가드 (iOS Safari)
// claude-scripts one360-cloud-reporting.js SSOT 규칙과 1:1. 실행: node __tests__/royalty-core.test.js
const RC = require('../royalty-core');
const fsmod = require('fs');

let passed = 0, failed = 0;
function assert(name, cond) {
  if (cond) { passed++; console.log(`  ✅ ${name}`); }
  else { failed++; console.log(`  ❌ ${name}`); }
}

console.log('[1] padCrm / monthRangeToDates / num');
assert('padCrm 163611 → 0000163611', RC.padCrm('163611') === '0000163611');
assert('padCrm 0000163611 유지', RC.padCrm('0000163611') === '0000163611');
(function () {
  const now = new Date(2026, 10, 15); // 2026-11
  const r = RC.monthRangeToDates(6, now);
  assert('6개월 dateFrom=20260601', r.dateFrom === '20260601');
  assert('6개월 dateEnd=20261130', r.dateEnd === '20261130');
})();
assert('num "1,234.5" → 1234.5', RC.num('1,234.5') === 1234.5);
assert('num 빈값 → null', RC.num('') === null);

console.log('[2] aggregateRoyalties: NA 제외 / dedupe / 집계');
(function () {
  const items = [
    { yearMonth: '2026-10', serviceName: 'SAP Build', metricName: 'users', material: 'M', servicePlan: 'P', actualUsage: 12, amountEur: 157.2 },
    { yearMonth: '2026-10', serviceName: '', metricName: 'NA', material: '', servicePlan: '', actualUsage: 0, amountEur: 99 },
    { yearMonth: '2026-10', serviceName: 'HANA', metricName: 'cu', material: 'M', servicePlan: 'S', actualUsage: 323, amountEur: 253.85 },
    { yearMonth: '2026-10', serviceName: 'HANA', metricName: 'cu', material: 'M', servicePlan: 'S', actualUsage: 323, amountEur: 253.85 }, // 중복
  ];
  const r = RC.aggregateRoyalties(items);
  assert('NA 1건 제외', r.excluded.na.count === 1);
  assert('중복 1건 제외', r.excluded.duplicate.count === 1);
  assert('집계 rows 2건', r.rows.length === 2);
  assert('총 EUR = 411.05', r.totalEur === 411.05);
})();

console.log('[3] parseRoyaltiesXlsx: XLSX 스텁 주입');
(function () {
  const grid = [
    ['Year Month', 'Service Name', 'Metric Name', 'Amount in EUR', 'Actual Usage'],
    ['2026-10', 'SAP Build', 'users', '157.2', '12'],
    [null, null, null, null, null],
  ];
  const XLSXstub = { read: () => ({ Sheets: { Data: {} } }), utils: { sheet_to_json: () => grid } };
  const items = RC.parseRoyaltiesXlsx(new ArrayBuffer(0), { XLSX: XLSXstub });
  assert('데이터 1행(빈행 스킵)', items.length === 1);
  assert('amountEur num 변환', items[0].amountEur === 157.2);
  let threw = false;
  try { RC.parseRoyaltiesXlsx(new ArrayBuffer(0), {}); } catch (e) { threw = /XLSX_NOT_PROVIDED/.test(e.message); }
  assert('XLSX 미주입 → throw', threw);
})();

console.log('[4] 소스 가드 — royalty 통합 지점');
const html = fsmod.readFileSync(__dirname + '/../popup.html', 'utf8');
assert('popup.html royalty-core.js <script> 로드', /src="royalty-core\.js"/.test(html));
assert('popup.html xlsx.mini.min.js <script> 로드', /src="xlsx\.mini\.min\.js"/.test(html));
const sp = fsmod.readFileSync(__dirname + '/../sidepanel.js', 'utf8');
assert('sidepanel.js one360GetRoyalty 존재', /function one360GetRoyalty/.test(sp));
assert('sidepanel.js appendUsageBasedSection 존재', /function appendUsageBasedSection/.test(sp));
assert('sidepanel.js fmtEur 존재', /function fmtEur/.test(sp));
assert('sidepanel.js reporting.ondemand GET', /reporting\.ondemand\.com\/sap\/crp\/cdo/.test(sp));
assert('sidepanel.js usageBased를 _consumptionAll에', /trendByMetric, usageBased/.test(sp));
assert('sidepanel.js 캐시가드 usageBased===undefined', /usageBased === undefined/.test(sp));
const mf = fsmod.readFileSync(__dirname + '/../manifest.json', 'utf8');
assert('manifest reporting.ondemand.com host_permission', /reporting\.ondemand\.com/.test(mf));

console.log(`\n[최종] Royalty 테스트: ${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
