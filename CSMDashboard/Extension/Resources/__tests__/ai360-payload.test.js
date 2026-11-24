// ai360-payload.test.js — AI360 탭 payload 빌더 + 소스 가드 검증 (iOS Safari 이식본)
// 크롬 ai360.test.js 미러. 단 iOS는 background 메시지 경로가 아니라 in-page fetch(one360Fetch)로 조회하고,
// renderAI360은 범용 resetRootPanel/renderCurrentPanel(kv/chart/table 섹션)을 사용한다 — 소스 가드는 iOS 실체에 맞춤.
// 실행: node __tests__/ai360-payload.test.js

const P = require('../ai360-payload');
const fsmod = require('fs');
const path = require('path');

let passed = 0, failed = 0;
function assert(name, cond) {
  if (cond) { passed++; console.log(`  ✅ ${name}`); }
  else { failed++; console.log(`  ❌ ${name}`); }
}

const CRM = '207184';
const PADDED = '0000207184';

console.log('[1] CRM ID 패딩');
assert('207184 → 0000207184', P.padCrm('207184') === PADDED);
assert('0000207184 유지', P.padCrm('0000207184') === PADDED);
assert('숫자 입력도 패딩', P.padCrm(207184) === PADDED);

console.log('[2] 6개 datablock version 513');
const WHICH = ['activeAcv', 'consumedAcv', 'usage', 'unitsCharged', 'adoption', 'contracts'];
WHICH.forEach(w => {
  const req = P.buildAI360Request(w, CRM);
  assert(`${w} version 513`, req.version === '513');
  assert(`${w} datablockId 존재`, typeof req.datablockId === 'string' && req.datablockId.length > 10);
  assert(`${w} limit 500`, req.payload.limit === 500);
});

console.log('[3] datablock id 정확값');
assert('activeAcv 99321614', P.AI360_DB.activeAcv === '99321614-2b95-4747-a905-3a2bf6f0a800');
assert('consumedAcv 96a97eb7', P.AI360_DB.consumedAcv === '96a97eb7-8ede-490d-a318-8ff226fcd2cc');
assert('usage 3b8e8494', P.AI360_DB.usage === '3b8e8494-710a-4c28-a9c2-8aaf4df9ee35');
assert('unitsCharged c22ebb88', P.AI360_DB.unitsCharged === 'c22ebb88-7b70-4f82-b813-804add873499');
assert('adoption 40a8136a', P.AI360_DB.adoption === '40a8136a-e484-45e8-be34-795643c9da2b');
assert('contracts 86848a71', P.AI360_DB.contracts === '86848a71-de3d-4dd7-a1a7-78db1244ae9b');

console.log('[4] 파라미터 — parameter 키(not name), SINGLE_CUSTOMER, IP_AUTH_SCENARIO 미포함');
{
  const req = P.buildAI360Request('consumedAcv', CRM);
  const pv = req.payload.parameterValues;
  assert('parameter 키 사용(name 키 없음)', pv.every(p => 'parameter' in p && !('name' in p)));
  const names = pv.map(p => p.parameter);
  assert('IP_ACCOUNT_SELECTION 포함', names.includes('IP_ACCOUNT_SELECTION'));
  assert('IP_DASHBOARD_TYPE 포함', names.includes('IP_DASHBOARD_TYPE'));
  assert('IP_AUTH_SCENARIO 미포함', !names.includes('IP_AUTH_SCENARIO'));
  const acct = pv.find(p => p.parameter === 'IP_ACCOUNT_SELECTION');
  assert('IP_ACCOUNT_SELECTION = 패딩 crmId', acct && acct.values[0] === PADDED);
  const dash = pv.find(p => p.parameter === 'IP_DASHBOARD_TYPE');
  assert('IP_DASHBOARD_TYPE = SINGLE_CUSTOMER', dash && dash.values[0] === 'SINGLE_CUSTOMER');
}

console.log('[5] activeAcv — TARGET_CURRENCY1=EUR, 빈 필터');
{
  const req = P.buildAI360Request('activeAcv', CRM);
  const names = req.payload.parameterValues.map(p => p.parameter);
  assert('TARGET_CURRENCY1 포함', names.includes('TARGET_CURRENCY1'));
  const cur = req.payload.parameterValues.find(p => p.parameter === 'TARGET_CURRENCY1');
  assert('TARGET_CURRENCY1 = EUR', cur && cur.values[0] === 'EUR');
  assert('filters 빈 배열', Array.isArray(req.payload.filters) && req.payload.filters.length === 0);
}

console.log('[6] consumedAcv — 4필터 + month ASC');
{
  const req = P.buildAI360Request('consumedAcv', CRM);
  const flat = JSON.stringify(req.payload.filters);
  assert('SOLUTION_AREA_ID 필터', flat.includes('SOLUTION_AREA_ID') && flat.includes('SADA.2026'));
  assert('month GT_EQ currentMonth-14M', flat.includes('month') && flat.includes('${exp:currentMonth-14M}') && flat.includes('GT_EQ'));
  assert('AI_FLAG 필터', flat.includes('AI_FLAG') && flat.includes('Yes'));
  assert('SCOPE 필터', flat.includes('SCOPE') && flat.includes('Compensation Relevant'));
  const ss = req.payload.sortSteps;
  assert('month ASC 정렬', Array.isArray(ss) && ss.some(s => s.column === 'month' && s.direction === 'ASC'));
}

console.log('[7] unitsCharged — SOLUTION_AREA_ID=SADA.2026');
{
  const req = P.buildAI360Request('unitsCharged', CRM);
  const flat = JSON.stringify(req.payload.filters);
  assert('SOLUTION_AREA_ID=SADA.2026', flat.includes('SOLUTION_AREA_ID') && flat.includes('SADA.2026'));
}

console.log('[8] adoption — params 빈 배열 + 계정 2필터');
{
  const req = P.buildAI360Request('adoption', CRM);
  assert('parameterValues 빈 배열', Array.isArray(req.payload.parameterValues) && req.payload.parameterValues.length === 0);
  const flat = JSON.stringify(req.payload.filters);
  assert('account_reference_crm_account_id 필터', flat.includes('account_reference_crm_account_id'));
  assert('account_reference_sap_top_view_parent_id 필터', flat.includes('account_reference_sap_top_view_parent_id'));
  assert('계정 필터값 = 패딩 crmId', flat.includes(PADDED));
}

console.log('[9] contracts — IP_CURRENCY=EUR + AI_FLAG/DEAL_STATUS');
{
  const req = P.buildAI360Request('contracts', CRM);
  const names = req.payload.parameterValues.map(p => p.parameter);
  assert('IP_CURRENCY 포함', names.includes('IP_CURRENCY'));
  const cur = req.payload.parameterValues.find(p => p.parameter === 'IP_CURRENCY');
  assert('IP_CURRENCY = EUR', cur && cur.values[0] === 'EUR');
  const flat = JSON.stringify(req.payload.filters);
  assert('AI_FLAG=Yes 필터', flat.includes('AI_FLAG') && flat.includes('Yes'));
  assert('DEAL_STATUS NOT_IN Cancelled', flat.includes('DEAL_STATUS') && flat.includes('Cancelled'));
}

console.log('[10] usage — TRAFFIC_STATUS=Traffic');
{
  const req = P.buildAI360Request('usage', CRM);
  const flat = JSON.stringify(req.payload.filters);
  assert('TRAFFIC_STATUS=Traffic 필터', flat.includes('TRAFFIC_STATUS') && flat.includes('Traffic'));
}

console.log('[11] 알 수 없는 which → throw');
{
  let threw = false;
  try { P.buildAI360Request('nope', CRM); } catch (_) { threw = true; }
  assert('미지 datablock throw', threw);
}

// ── 소스 가드 ──────────────────────────────────────────────────────
const RES = path.join(__dirname, '..');
const sp = fsmod.readFileSync(path.join(RES, 'sidepanel.js'), 'utf8');
const html = fsmod.readFileSync(path.join(RES, 'popup.html'), 'utf8');

console.log('[12] sidepanel.js 소스 가드');
assert('loadAI360 정의', /function\s+loadAI360\s*\(/.test(sp));
assert('renderAI360 정의', /function\s+renderAI360\s*\(/.test(sp));
assert('one360GetAI360 정의', /function\s+one360GetAI360\s*\(/.test(sp));
assert('one360GetAI360이 one360Fetch 호출(in-page)', /one360GetAI360[\s\S]{0,300}one360Fetch\(/.test(sp));
assert('AI360용 background sendMessage 미사용', !/ONE360_AI360/.test(sp));
assert('AI360_WHICH 6요소', /AI360_WHICH\s*=\s*\[[^\]]*activeAcv[^\]]*consumedAcv[^\]]*usage[^\]]*unitsCharged[^\]]*adoption[^\]]*contracts/.test(sp));
assert('self.AI360Payload.buildAI360Request 사용', /self\.AI360Payload\.buildAI360Request/.test(sp));
assert("resetRootPanel('ai360' 호출", /resetRootPanel\('ai360'/.test(sp));
// 🚨 renderCurrentPanel이 group==='ai360'을 #ai360Tab 컨테이너로 매핑해야 로딩 메시지가 교체된다.
//    이 분기가 없으면 container=undefined → 로딩 메시지가 안 사라지고 내용도 안 그려짐(v2.5.2 수정).
assert("renderCurrentPanel group==='ai360' 컨테이너 매핑", /group === 'ai360'[\s\S]*?#ai360Tab \.overview-section-body/.test(sp));
assert('aiVal/aiEur 헬퍼 정의', /function\s+aiVal\s*\(/.test(sp) && /function\s+aiEur\s*\(/.test(sp));
assert('탭 클릭 디스패처 ai360→loadAI360', /_accountDetailTab === 'ai360'\)\s*loadAI360\(\)/.test(sp));
assert("applyDetailTabVisibility set('ai360Tab'", /set\('ai360Tab',\s*hasAccount && tab === 'ai360'\)/.test(sp));
assert('캐시 무효화 체인에 _ai360All 포함', /_consumptionAll = _ai360All = null/.test(sp));
assert('_ai360All 상태변수 선언', /let\s+_ai360All\s*=\s*null/.test(sp));

console.log('[13] popup.html 소스 가드');
assert('data-tab="ai360" 버튼', /data-tab="ai360"/.test(html));
assert('id="ai360Tab" 패널', /id="ai360Tab"/.test(html));
assert('ai360-payload.js 스크립트 로드', /<script src="ai360-payload\.js">/.test(html));
assert('ai360-payload.js가 sidepanel.js보다 먼저', html.indexOf('ai360-payload.js') < html.indexOf('"sidepanel.js"'));

console.log(`\n결과: ${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
