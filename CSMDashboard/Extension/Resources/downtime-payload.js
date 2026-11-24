// downtime-payload.js — Downtime Events datablock POST 바디 빌더 (version 539)
// 역공학 근거: 다운타임이벤트.har (2026-11-22 라이브 캡처) — ONE360 Cloud Availability 탭
//            하단 downtime event 테이블 요청. datablock cb39593b, LG Innotek 254행 200 검증.
//
// ⚠️ ai360-payload.js와 동일 패턴: 계열 C 파라미터(IP_ACCOUNT_SELECTION / IP_DASHBOARD_TYPE),
//    키는 `parameter`(not name). background.js의 makeParams/makeFilterBlock과 섞지 않는다.
//
// Solution Area 필터는 buildDowntimeRequest(crmId, saCodes)의 saCodes로 교체 가능.
//   상단 Component 필터(BDC→SADA.YYYY, BTP→SABTP.YYYY)와 연동하기 위함. 미지정 시 ['SADA.2026'].
//
// 브라우저(background.js, importScripts)와 node(테스트) 양쪽에서 로드된다.

(function (root) {
  'use strict';

  var DOWNTIME_DB = 'cb39593b-ac15-4371-9619-daa82bededb0';
  var DOWNTIME_VERSION = '539';

  // 테이블 호출 columns. CUSTOMER_ID는 스코프 라벨용(테이블 미노출).
  // 🚀 1단계 조회: 이벤트 레벨 SOLUTION_AREA/SUB_SOLUTION_AREA/SYSTEM_ROLE 포함 → 테넌트 드릴다운 불필요.
  //    SUB_SOLUTION_AREA(제품군)를 하단 테이블 핵심 컬럼으로 표시(SA는 상단 Component 필터).
  var DOWNTIME_COLUMNS = [
    'EVENT_ID', 'EVENT_TYPE_CONS', 'EVENT_PHASE', 'START_TST_GMT', 'END_TST_GMT',
    'FORMATTED_EVENT_DURATION', 'EVENT_STATUS', 'DOWNTIME_TYPE_CODE', 'SLA_RELEVANT',
    'DATA_CENTER', 'COUNT_TENANT', 'CUSTOMER_ID',
    'SOLUTION_AREA', 'SUB_SOLUTION_AREA', 'SYSTEM_ROLE',
  ];

  // CRM ID 10자리 패딩.
  function padCrm(crmId) {
    return String(crmId == null ? '' : crmId).replace(/^0+/, '').padStart(10, '0');
  }

  // Event ID → SPC 공지 상세 딥링크 (har 원문 돋보기 링크 형식, SPC 인증 필요).
  function spcUrl(eventId) {
    return eventId ? 'https://notif.spc.ondemand.com/open?evt=' + encodeURIComponent(eventId) : '';
  }

  // 계열 C 파라미터 1개. ★ 키는 `parameter` (not `name`).
  function dtParam(parameter, values, idx) {
    return {
      parameter: parameter,
      values: values,
      properties: { immutable: false },
      isDatablockParameterValues: false,
      isNucleusParameterValue: true,
      nucleusParameterId: 'p_downtime_' + idx,
    };
  }

  // 단일 nucleus 필터 항목.
  function dtFilterItem(c) {
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

  function dtFilterBlock(conds) {
    if (!conds || !conds.length) return [];
    return [{
      connectionOperator: 'AND',
      operator: 'AND',
      properties: { immutable: false, showInFrontend: true },
      values: conds.map(dtFilterItem),
      filterBlockId: 'runtimeFilterBlock',
      isFilledFromContext: false,
    }];
  }

  function sortStep(column, direction) {
    return { column: column, direction: direction || 'ASC', alwaysApply: true, properties: {}, isDatablockSortStep: false };
  }

  // buildDowntimeRequest(crmId) → { datablockId, version, payload }.
  // 🚀 SOLUTION_AREA_ID 서버 필터 제거: 전체 SA(BDC+BTP+Other)를 1회 조회 후
  //    Component(BDC/BTP/Other) 토글은 클라이언트 필터(이벤트 SOLUTION_AREA 기준)로 처리.
  //    다른 ONE360 탭(Contract/Consumption)과 동일한 '1회 로드 + 클라 필터' 패턴 — SA 토글 즉각 반응, 재조회 0.
  //    (saCodes 인자는 하위호환으로 받되 무시)
  function buildDowntimeRequest(crmId, saCodes) { // eslint-disable-line no-unused-vars
    var padded = padCrm(crmId);
    return {
      datablockId: DOWNTIME_DB,
      version: DOWNTIME_VERSION,
      payload: {
        filters: dtFilterBlock([
          { column: 'START_DATE', operator: 'GT_EQ', values: ['${exp:currentDay-1y}'] },
        ]),
        sortSteps: [sortStep('START_TST_GMT', 'DESC')],
        parameterValues: [
          dtParam('IP_ACCOUNT_SELECTION', [padded], 'acct'),
          dtParam('IP_DASHBOARD_TYPE', ['SINGLE_CUSTOMER'], 'type'),
        ],
        columns: DOWNTIME_COLUMNS,
        offset: 0,
        limit: 500,
      },
    };
  }

  // 🚀 테넌트 드릴다운 폐지: 제품군은 1단계 조회의 SUB_SOLUTION_AREA/SYSTEM_ROLE로 충분.
  //    (buildTenantsRequest / TENANT_COLUMNS 제거 — 과거 2단계 Impacted Tenants 조회용이었음)

  var api = {
    DOWNTIME_DB: DOWNTIME_DB,
    DOWNTIME_VERSION: DOWNTIME_VERSION,
    DOWNTIME_COLUMNS: DOWNTIME_COLUMNS,
    padCrm: padCrm,
    spcUrl: spcUrl,
    buildDowntimeRequest: buildDowntimeRequest,
  };

  // node (테스트) + 브라우저(background.js importScripts / sidepanel window) 양쪽 export.
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.DowntimePayload = api;
})(typeof self !== 'undefined' ? self : this);
