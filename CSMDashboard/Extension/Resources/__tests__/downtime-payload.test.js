// downtime-payload.test.js — Downtime 탭 payload 빌더 + 소스 가드 검증 (iOS Safari 이식본)
// 크롬 downtime.test.js 미러. 단 iOS는 background 메시지 경로가 아니라 in-page fetch(one360Fetch)로 조회하고,
// renderDowntime은 범용 renderCurrentPanel이 아니라 직접 DOM 조립을 사용한다 — 소스 가드는 iOS 실체에 맞춤.
// 실행: node __tests__/downtime-payload.test.js

const P = require('../downtime-payload');
const fsmod = require('fs');

let passed = 0, failed = 0;
function assert(name, cond) {
  if (cond) { passed++; console.log(`  ✅ ${name}`); }
  else { failed++; console.log(`  ❌ ${name}`); }
}

const LG = '0001234020';

console.log('[1] CRM ID 패딩');
assert('1234020 → 0001234020', P.padCrm('1234020') === '0001234020');
assert('0001234020 유지', P.padCrm('0001234020') === '0001234020');
assert('숫자 입력도 패딩', P.padCrm(1234020) === '0001234020');

console.log('[2] 식별자 — datablock cb39593b, version 539');
const req = P.buildDowntimeRequest(LG);
assert('datablockId cb39593b', req.datablockId === 'cb39593b-ac15-4371-9619-daa82bededb0');
assert('version 539', req.version === '539');
assert('limit 500', req.payload.limit === 500);

console.log('[3] 파라미터 — parameter 키(not name), SINGLE_CUSTOMER');
const pv = req.payload.parameterValues;
assert('parameterValues 존재', Array.isArray(pv) && pv.length > 0);
assert('모든 항목이 parameter 키 사용', pv.every(p => 'parameter' in p));
assert('name 키 미사용', pv.every(p => !('name' in p)));
const names = pv.map(p => p.parameter);
assert('IP_ACCOUNT_SELECTION 포함', names.includes('IP_ACCOUNT_SELECTION'));
assert('IP_DASHBOARD_TYPE 포함', names.includes('IP_DASHBOARD_TYPE'));
const dtype = pv.find(p => p.parameter === 'IP_DASHBOARD_TYPE');
assert('IP_DASHBOARD_TYPE = SINGLE_CUSTOMER', dtype.values[0] === 'SINGLE_CUSTOMER');
const acct = pv.find(p => p.parameter === 'IP_ACCOUNT_SELECTION');
assert('IP_ACCOUNT_SELECTION = 패딩된 crmId', acct.values[0] === LG);

console.log('[4] 필터 — SOLUTION_AREA_ID 서버필터 제거 + START_DATE GT_EQ만');
const flat = req.payload.filters[0].values;
const cols = flat.map(v => v.column);
assert('SOLUTION_AREA_ID 서버필터 없음(클라 필터로 이관)', !cols.includes('SOLUTION_AREA_ID'));
assert('START_DATE 필터', cols.includes('START_DATE'));
const sd = flat.find(v => v.column === 'START_DATE');
assert('START_DATE GT_EQ currentDay-1y', sd.operator === 'GT_EQ' && sd.values[0] === '${exp:currentDay-1y}');

console.log('[5] saCodes 인자 무시 — 전체 SA 조회(클라 필터가 BDC/BTP/Other 분류)');
const btpReq = P.buildDowntimeRequest(LG, ['SABTP.2026']);
const btpCols = btpReq.payload.filters[0].values.map(v => v.column);
assert('saCodes 줘도 SOLUTION_AREA_ID 없음', !btpCols.includes('SOLUTION_AREA_ID'));
const spSrc = fsmod.readFileSync(__dirname + '/../sidepanel.js', 'utf8');
assert('downtimeEventBucket(이벤트 SA→버킷) 정의', /function downtimeEventBucket/.test(spSrc));
assert('downtimeRowMatches(Component 클라 필터) 정의', /function downtimeRowMatches/.test(spSrc));
assert('Component 토글 → renderDowntime 재렌더(재조회 X)', /_accountDetailTab === 'downtime' && _downtimeAll\) renderDowntime/.test(spSrc));

console.log('[6] 정렬 — START_TST_GMT DESC');
assert('sortSteps START_TST_GMT DESC', req.payload.sortSteps[0]
  && req.payload.sortSteps[0].column === 'START_TST_GMT'
  && req.payload.sortSteps[0].direction === 'DESC');

console.log('[7] 컬럼 — EVENT_ID 등 이벤트 필드');
assert('cols: EVENT_ID / START_TST_GMT / END_TST_GMT',
  ['EVENT_ID', 'START_TST_GMT', 'END_TST_GMT'].every(c => P.DOWNTIME_COLUMNS.includes(c)));
assert('cols: FORMATTED_EVENT_DURATION / EVENT_STATUS / DOWNTIME_TYPE_CODE',
  ['FORMATTED_EVENT_DURATION', 'EVENT_STATUS', 'DOWNTIME_TYPE_CODE'].every(c => P.DOWNTIME_COLUMNS.includes(c)));
assert('cols: SLA_RELEVANT / DATA_CENTER / COUNT_TENANT',
  ['SLA_RELEVANT', 'DATA_CENTER', 'COUNT_TENANT'].every(c => P.DOWNTIME_COLUMNS.includes(c)));
assert('cols: SOLUTION_AREA / SUB_SOLUTION_AREA / SYSTEM_ROLE (1단계 제품군)',
  ['SOLUTION_AREA', 'SUB_SOLUTION_AREA', 'SYSTEM_ROLE'].every(c => P.DOWNTIME_COLUMNS.includes(c)));

console.log('[8] Event URL 헬퍼 — SPC 공지 딥링크');
assert('spcUrl(EVB123) = notif.spc.ondemand.com/open?evt=EVB123',
  P.spcUrl('EVB123') === 'https://notif.spc.ondemand.com/open?evt=EVB123');
assert('빈 EventID → 빈 문자열', P.spcUrl('') === '');

console.log('[8-T] 테넌트 드릴다운 폐지 — buildTenantsRequest/TENANT_COLUMNS 제거됨');
assert('buildTenantsRequest 미export(제거)', typeof P.buildTenantsRequest === 'undefined');
assert('TENANT_COLUMNS 미export(제거)', typeof P.TENANT_COLUMNS === 'undefined');

console.log('[9] 소스 가드 — sidepanel.js (iOS in-page fetch)');
const sp = fsmod.readFileSync(__dirname + '/../sidepanel.js', 'utf8');
assert("applyDetailTabVisibility: set('downtimeTab'", /set\('downtimeTab'/.test(sp));
assert('loadDowntime 정의', /function loadDowntime/.test(sp));
assert('renderDowntime 정의', /function renderDowntime/.test(sp));
assert('one360GetDowntime 정의', /function one360GetDowntime/.test(sp));
assert('one360GetDowntime이 one360Fetch 호출(in-page, background sendMessage 아님)',
  /one360GetDowntime[\s\S]{0,300}one360Fetch\(/.test(sp));
assert('one360GetDowntime이 DowntimePayload.buildDowntimeRequest 사용',
  /DowntimePayload\.buildDowntimeRequest/.test(sp));
assert('_downtimeAll 상태', /_downtimeAll/.test(sp));
assert('탭 클릭: downtime → loadDowntime', /_accountDetailTab === 'downtime'\) loadDowntime\(\)/.test(sp));
assert('Event URL(SPC 링크) 참조', /notif\.spc\.ondemand\.com/.test(sp));
assert('_downtimeFilter 상태', /_downtimeFilter/.test(sp));
assert('DOWNTIME_FILTERS 정의(요약 클릭 필터)', /DOWNTIME_FILTERS/.test(sp));
assert('downtimeTsv 복사(TSV) 함수', /function downtimeTsv/.test(sp));
assert('Cancelled 제외 필터 존재(EVENT_STATUS 참조)', /EVENT_STATUS/.test(sp) && /cancelled/i.test(sp));
assert('Disruption 집계', /disruption/.test(sp));
assert('복사 버튼 attachCopy 연결', /attachCopy\(copyBtn/.test(sp));
assert('Sub-Solution Area 컬럼 표시', /'Sub-Solution Area'/.test(sp) && /SUB_SOLUTION_AREA/.test(sp));
assert('테넌트 드릴다운 제거(toggleDowntimeTenants 없음)', !/function toggleDowntimeTenants/.test(sp));
assert('one360-table.downtime-table 렌더', /one360-table downtime-table/.test(sp));

console.log('[10] 소스 가드 — popup.html / sidepanel.css / payload 로드');
const html = fsmod.readFileSync(__dirname + '/../popup.html', 'utf8');
assert('data-tab="downtime" 버튼', /data-tab="downtime"/.test(html));
assert('#downtimeTab 컨테이너', /id="downtimeTab"/.test(html));
assert('downtime-payload.js <script> 로드', /src="downtime-payload\.js"/.test(html));
const css = fsmod.readFileSync(__dirname + '/../sidepanel.css', 'utf8');
assert('.downtime-chip CSS 존재', /\.downtime-chip/.test(css));

console.log(`\n[최종] Downtime 테스트: ${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
