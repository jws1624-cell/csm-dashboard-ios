// ai360-payload.js — AI360 Dashboard datablock POST 바디 빌더 (version 513)
// 역공학 근거: skills/user/one360/references/ai360-dashboard-map.md (3·5절),
//            ai360-datablock-catalog.json (전 컬럼 스키마).
//
// ⚠️ 기존 background.js의 makeParams/makeFilterBlock을 쓰지 않는다.
//    그 헬퍼는 RESPONSIBILITY_SCENARIO/IN_CURRENCY를 강제 주입하는데,
//    AI 대시보드는 계열 C 파라미터(IP_ACCOUNT_SELECTION / IP_DASHBOARD_TYPE /
//    IP_AUTH_SCENARIO)를 쓴다. 섞으면 스코프가 깨진다(book-of-business 전체).
//
// 브라우저(background.js, importScripts)와 node(테스트) 양쪽에서 로드된다.

(function (root) {
  'use strict';

  // 6개 AI360 datablock (map 2절, version 513에서 라이브 200 검증 — 2026-11-22 LG Innotek·CJ제일제당).
  var AI360_DB = {
    activeAcv:    '99321614-2b95-4747-a905-3a2bf6f0a800', // Active AI ACV (계열 C + TARGET_CURRENCY1)
    consumedAcv:  '96a97eb7-8ede-490d-a318-8ff226fcd2cc', // AI Consumed ACV (계열 C)
    usage:        '3b8e8494-710a-4c28-a9c2-8aaf4df9ee35', // AI Usage / Traffic (계열 C)
    unitsCharged: 'c22ebb88-7b70-4f82-b813-804add873499', // AI Units Charged (계열 C)
    adoption:     '40a8136a-e484-45e8-be34-795643c9da2b', // AI Adoption (계열 D 예외: params=[] + filters)
    contracts:    '86848a71-de3d-4dd7-a1a7-78db1244ae9b', // AI Contracts (공유 datablock + AI_FLAG=Yes)
  };

  // 각 datablock에서 꺼낼 컬럼 (ai360.har 실측 — 라이브 ONE360 AI 대시보드와 동일).
  var AI360_COLUMNS = {
    // #37: 총 Active AI ACV (고객 + 전체평균)
    activeAcv: ['total-active-acv-selected-customer-1',
                'total-active-average-acv-overall-customer-1', 'TARGET_CURRENCY'],
    // #27: 월별 Active/Consumed ACV + 소비율 추이 (AI scope)
    consumedAcv: ['month', 'active-acv-1', 'consumed-acv-1',
                  'CONSUMPTION_RATIO', 'calendar-month-yyyymm'],
    // 월별·AI_TYPE·feature별 traffic (penultimate 월을 "최신 완료월"로 집계)
    usage: ['SNAPSHOT_MONTH', 'AI_TYPE', 'AI_FEATURE', 'TRAFFIC'],
    // #28: AI Units Consumption - Details (월별 feature별 소진)
    unitsCharged: ['BILL_FROM_DATE', 'SUB_SOLUTION_AREA', 'LOGICAL_PRODUCT_ID',
                   'BILL_METRIC_NAME', 'BILL_USAGE_UNIT_OF_MEASUREMENT', 'BILL_USAGE',
                   'PACKAGE_ENTITLED_REQUESTS', 'CHARGES_UNITS'],
    // #19: AI Roadmap feature 상세 (Image 14)
    adoption: ['ai_roadmap_ai_feature_catalog_items_product_category',
               'ai_roadmap_ai_feature_catalog_items_product',
               'ai_roadmap_ai_feature_catalog_items_name', 'ai_roadmap_feature_status',
               'ai_roadmap_feature_type', 'ai_roadmap_deadline', 'ai_roadmap_responsible',
               'material_identified_name'],
    // #30: AI 계약 목록 (전체 Past/Current/Future)
    contracts: ['ORDER', 'TYPE_SKU', 'ACTIVE_ACV_RESTRICTED', 'DEAL_STATUS',
                'AI_FLAG', 'ITEM_PAST_CURRENT_FUTURE', 'MATERIAL', 'MATERIAL_ID_UNPADDED'],
  };

  var AI360_VERSION = '513';

  // CRM ID 10자리 패딩 ("163611" / "0000163611" → "0000163611").
  function padCrm(crmId) {
    return String(crmId == null ? '' : crmId).replace(/^0+/, '').padStart(10, '0');
  }

  // 계열 C 파라미터 1개 (map 3.1). ★ 키는 `parameter` (not `name`).
  // name으로 보내면 스코프 실패 → book-of-business 전체가 돌아온다.
  function aiParamC(parameter, values) {
    return {
      parameter: parameter,
      values: values,
      properties: { immutable: false },
      isDatablockParameterValues: false,
      isNucleusParameterValue: true,
    };
  }

  // 단일 nucleus 필터 항목 (ai360.har 리터럴). conds = [{column, operator, values}, ...].
  function aiFilterItem(c) {
    return {
      properties: { showInFrontend: true, immutable: false },
      column: c.column,
      operator: c.operator,
      values: c.values,
      cachedLabels: {},
      isDatablockFilter: false,
      connectionOperator: 'AND',
      isNucleusFilter: true,
      filterBlockId: 'runtimeFilterBlock',
      isEntryKeyFilter: false,
      isFilledFromContext: true,
    };
  }

  // 여러 조건을 하나의 AND 필터블록으로 감싼다. conds 비면 [] 반환.
  function aiFilterBlock() {
    var conds = Array.prototype.slice.call(arguments);
    // 배열 하나를 넘긴 경우도 지원
    if (conds.length === 1 && Array.isArray(conds[0])) conds = conds[0];
    if (!conds.length) return [];
    return [{
      connectionOperator: 'AND',
      operator: 'AND',
      properties: { immutable: false, showInFrontend: true },
      values: conds.map(aiFilterItem),
      filterBlockId: 'runtimeFilterBlock',
      isFilledFromContext: false,
    }];
  }

  // 계열 C 공통 파라미터 (ai360.har 실측: IP_ACCOUNT_SELECTION + IP_DASHBOARD_TYPE).
  // ★ IP_AUTH_SCENARIO는 라이브에 없음 — 제거.
  function paramsC(crmId, extras) {
    var padded = padCrm(crmId);
    return (extras || []).concat([
      aiParamC('IP_ACCOUNT_SELECTION', [padded]),
      aiParamC('IP_DASHBOARD_TYPE', ['SINGLE_CUSTOMER']),
    ]);
  }

  function sortStep(column, direction) {
    return { column: column, direction: direction || 'ASC', alwaysApply: false, properties: {}, isDatablockSortStep: false };
  }

  // which('activeAcv'|...) → { datablockId, version, payload } 반환. (ai360.har 기준)
  function buildAI360Request(which, crmId) {
    var dbId = AI360_DB[which];
    if (!dbId) throw new Error('알 수 없는 AI360 datablock: ' + which);
    var columns = AI360_COLUMNS[which];
    var padded = padCrm(crmId);

    var filters = [];
    var sortSteps = [];
    var params;

    if (which === 'activeAcv') {
      // #37: 필터 없음, TARGET_CURRENCY1=EUR
      params = paramsC(crmId, [aiParamC('TARGET_CURRENCY1', ['EUR'])]);
    } else if (which === 'consumedAcv') {
      // #27: SADA.2026 + month>=−14M + AI_FLAG=Yes + SCOPE=Compensation Relevant
      filters = aiFilterBlock([
        { column: 'SOLUTION_AREA_ID', operator: 'IN', values: ['SADA.2026'] },
        { column: 'month', operator: 'GT_EQ', values: ['${exp:currentMonth-14M}'] },
        { column: 'AI_FLAG', operator: 'IN', values: ['Yes'] },
        { column: 'SCOPE', operator: 'IN', values: ['Compensation Relevant'] },
      ]);
      sortSteps = [sortStep('month', 'ASC')];
      params = paramsC(crmId);
    } else if (which === 'usage') {
      // 월별 traffic — TRAFFIC_STATUS=Traffic만 (렌더에서 penultimate 월 집계)
      filters = aiFilterBlock([
        { column: 'TRAFFIC_STATUS', operator: 'IN', values: ['Traffic'] },
      ]);
      params = paramsC(crmId);
    } else if (which === 'unitsCharged') {
      // #28: SADA.2026
      filters = aiFilterBlock([
        { column: 'SOLUTION_AREA_ID', operator: 'IN', values: ['SADA.2026'] },
      ]);
      sortSteps = [sortStep('BILL_FROM_DATE', 'DESC'), sortStep('SUB_SOLUTION_AREA', 'ASC'),
                   sortStep('LOGICAL_PRODUCT', 'ASC'), sortStep('BILL_METRIC_NAME', 'ASC')];
      params = paramsC(crmId);
    } else if (which === 'adoption') {
      // #19: 계정 스코프 2개 (crm_account_id + sap_top_view_parent_id), params 없음
      filters = aiFilterBlock([
        { column: 'account_reference_crm_account_id', operator: 'IN', values: [padded] },
        { column: 'account_reference_sap_top_view_parent_id', operator: 'IN', values: [padded] },
      ]);
      params = [];
    } else if (which === 'contracts') {
      // #30 기반 + AI 계약만: AI_FLAG=Yes, 취소 제외
      filters = aiFilterBlock([
        { column: 'AI_FLAG', operator: 'IN', values: ['Yes'] },
        { column: 'DEAL_STATUS', operator: 'NOT_IN', values: ['Cancelled'] },
      ]);
      params = paramsC(crmId, [aiParamC('IP_CURRENCY', ['EUR'])]);
    } else {
      params = paramsC(crmId);
    }

    return {
      datablockId: dbId,
      version: AI360_VERSION,
      payload: { filters: filters, sortSteps: sortSteps, parameterValues: params, columns: columns, offset: 0, limit: 500 },
    };
  }

  var api = {
    AI360_DB: AI360_DB,
    AI360_COLUMNS: AI360_COLUMNS,
    AI360_VERSION: AI360_VERSION,
    padCrm: padCrm,
    aiParamC: aiParamC,
    aiFilterBlock: aiFilterBlock,
    buildAI360Request: buildAI360Request,
  };

  // node (테스트) + 브라우저(background.js importScripts / sidepanel window) 양쪽 export.
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.AI360Payload = api;
})(typeof self !== 'undefined' ? self : this);
