// royalty-core.js — ONE360 Cloud Reporting royalty(CPEA/BTPEA/PAYGO) 파싱·집계 순수 로직
//
// ⚠️ SSOT는 /Users/woosuk/claude-scripts/one360-cloud-reporting.js.
//    이 파일은 그 SSOT의 순수 함수(parseRoyaltiesXlsx / aggregateRoyalties /
//    monthRangeToDates / padCrm / COLS / num)를 확장(MV3)용으로 포팅한 것이다.
//    로직 변경 금지 — SSOT 규칙과 1:1로 유지한다. SSOT 수정 시 이 파일도 함께 갱신.
//
// 포팅 차이점(SSOT 대비):
//   - require('xlsx') 제거 → deps.XLSX 주입 전용. background SW는 self.XLSX 주입.
//   - XLSX.read는 {type:'array'} 고정 — SW fetch의 arrayBuffer()는 ArrayBuffer이다
//     (SSOT는 Node Buffer라 {type:'buffer'}). parseRoyaltiesXlsx는 ArrayBuffer/Uint8Array를 받는다.
//   - 네트워크(fetchCloudReportingRoyalties)·쿠키(getReportingCookie) 함수는 가져오지 않는다.
//     reporting fetch는 background.js의 ONE360_ROYALTY 핸들러가 직접 수행한다.
//
// 브라우저(background.js importScripts → self.RoyaltyCore)와 node(테스트 require) 양쪽에서 로드된다.

(function (root) {
  'use strict';

  // XLSX 'Data' 시트 헤더 라벨 → 출력 키 매핑 (핵심 컬럼만). SSOT COLS와 동일.
  var COLS = {
    yearMonth:           'Year Month',
    paymentModel:        'Payment Model',
    billingPaymentModel: 'Billing Payment Model',
    logicalProduct:      'Logical Product',
    logicalProductName:  'Logical Product Name',
    serviceId:           'Service ID',
    serviceName:         'Service Name',
    servicePlan:         'Service Plan',
    material:            'Material',
    materialDescription: 'Material Description',
    metricName:          'Metric Name',
    billed:              'Billed',
    chargedUsage:        'Charged Usage',
    currency:            'Currency',
    amountLocal:         'Amount in local curr.',
    amountEur:           'Amount in EUR',
    actualUsage:         'Actual Usage',
    totalUsage:          'Total Usage',
    erpContractId:       'ERP Contract ID',
    contractSku:         'Contract SKU',
  };

  // 숫자형 컬럼 (num() 변환 대상). SSOT NUMERIC_KEYS와 동일.
  var NUMERIC_KEYS = new Set([
    'billed', 'chargedUsage', 'amountLocal', 'amountEur', 'actualUsage', 'totalUsage',
  ]);

  // 숫자 변환: 변환 가능하면 Number, 아니면 원값 유지(빈값은 null).
  function num(v) {
    if (v == null || v === '') return null;
    var n = Number(String(v).replace(/,/g, ''));
    return Number.isFinite(n) ? n : v;
  }

  // CRM ID → 10자리 zero-pad (앞 0 제거 후 재패딩).
  function padCrm(crmId) {
    return String(crmId).replace(/^0+/, '').padStart(10, '0');
  }

  // Date → YYYYMMDD
  function ymd(d) {
    var y = d.getFullYear();
    var m = String(d.getMonth() + 1).padStart(2, '0');
    var day = String(d.getDate()).padStart(2, '0');
    return '' + y + m + day;
  }

  // --months N → { dateFrom, dateEnd } (YYYYMMDD).
  // dateFrom = (N-1)개월 전의 1일, dateEnd = 이번 달 말일.
  function monthRangeToDates(months, now) {
    if (months === undefined) months = 6;
    now = now || new Date();
    var n = Math.max(1, parseInt(months, 10) || 1);
    var from = new Date(now.getFullYear(), now.getMonth() - (n - 1), 1);
    var end = new Date(now.getFullYear(), now.getMonth() + 1, 0); // 이번 달 말일
    return { dateFrom: ymd(from), dateEnd: ymd(end) };
  }

  // XLSX 버퍼(ArrayBuffer/Uint8Array) → 라인아이템 배열 (순수 함수, 네트워크 없음).
  //   deps.XLSX 필수(SW는 self.XLSX, 테스트는 스텁 주입).
  function parseRoyaltiesXlsx(buffer, deps) {
    deps = deps || {};
    var XLSX = deps.XLSX;
    if (!XLSX) throw new Error('XLSX_NOT_PROVIDED');
    var wb = XLSX.read(buffer, { type: 'array' }); // 브라우저 ArrayBuffer
    var ws = wb.Sheets['Data'];
    if (!ws) return [];
    var rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: null });
    if (!rows.length) return [];
    var header = rows[0].map(function (h) { return String(h == null ? '' : h).trim(); });
    var idx = {};
    Object.keys(COLS).forEach(function (key) { idx[key] = header.indexOf(COLS[key]); });
    var out = [];
    for (var r = 1; r < rows.length; r++) {
      var row = rows[r];
      if (!row || !row.some(function (c) { return c != null && c !== ''; })) continue; // 빈 행 스킵
      var item = {};
      Object.keys(COLS).forEach(function (key) {
        var ci = idx[key];
        var raw = ci >= 0 ? row[ci] : null;
        item[key] = NUMERIC_KEYS.has(key) ? num(raw) : (raw == null ? null : raw);
      });
      out.push(item);
    }
    return out;
  }

  // 라인아이템 → 소비 현황 집계 (순수 함수). SSOT aggregateRoyalties 규칙 1:1.
  //   - Metric='NA' 또는 Service Name 공백 라인 제외(계약 레벨 비-소비 금액).
  //   - dedupe: (월,service,metric,material,servicePlan,actualUsage,amountEur) 동일하면 1건.
  //     🚨 Billed 값으로 거르지 않는다(최근월은 전부 Billed 공백이지만 유효).
  //   - Service×Metric×월 집계, 월 desc → EUR desc.
  function aggregateRoyalties(lineItems) {
    lineItems = lineItems || [];
    var excluded = { duplicate: { count: 0, amountEur: 0 }, na: { count: 0, amountEur: 0 } };
    var numOr0 = function (v) { return (typeof v === 'number' && Number.isFinite(v)) ? v : 0; };

    // 1) NA 제외 + 동일 수치 중복 제거
    var seen = new Set();
    var kept = [];
    for (var i = 0; i < lineItems.length; i++) {
      var it = lineItems[i];
      var svc = it.serviceName == null ? '' : String(it.serviceName).trim();
      var met = it.metricName == null ? '' : String(it.metricName).trim();
      if (!svc || met === 'NA') {
        excluded.na.count += 1;
        excluded.na.amountEur += numOr0(it.amountEur);
        continue;
      }
      var dk = [it.yearMonth, svc, met, it.material == null ? '' : it.material,
        it.servicePlan == null ? '' : it.servicePlan,
        numOr0(it.actualUsage), numOr0(it.amountEur)].join('\u0000');
      if (seen.has(dk)) {
        excluded.duplicate.count += 1;
        excluded.duplicate.amountEur += numOr0(it.amountEur);
        continue;
      }
      seen.add(dk);
      kept.push(it);
    }

    // 2) Service×Metric×월 집계
    var groups = new Map();
    for (var j = 0; j < kept.length; j++) {
      var k = kept[j];
      var s = String(k.serviceName).trim();
      var m = String(k.metricName).trim();
      var key = k.yearMonth + '\u0000' + s + '\u0000' + m;
      var g = groups.get(key) || {
        yearMonth: k.yearMonth, serviceName: s, metricName: m,
        paymentModel: k.paymentModel || '', actualUsage: 0, amountEur: 0, count: 0,
      };
      g.actualUsage += numOr0(k.actualUsage);
      g.amountEur += numOr0(k.amountEur);
      g.count += 1;
      groups.set(key, g);
    }

    var rows = Array.from(groups.values());
    rows.sort(function (a, b) {
      return (b.yearMonth || '').localeCompare(a.yearMonth || '') || (b.amountEur - a.amountEur);
    });
    var round2 = function (n) { return Math.round(n * 100) / 100; };
    rows.forEach(function (r) { r.amountEur = round2(r.amountEur); });
    excluded.duplicate.amountEur = round2(excluded.duplicate.amountEur);
    excluded.na.amountEur = round2(excluded.na.amountEur);
    var totalEur = round2(rows.reduce(function (acc, r) { return acc + r.amountEur; }, 0));
    return { rows: rows, excluded: excluded, totalEur: totalEur };
  }

  var api = {
    COLS: COLS,
    NUMERIC_KEYS: NUMERIC_KEYS,
    num: num,
    padCrm: padCrm,
    monthRangeToDates: monthRangeToDates,
    parseRoyaltiesXlsx: parseRoyaltiesXlsx,
    aggregateRoyalties: aggregateRoyalties,
  };

  // node (테스트) + 브라우저(background.js importScripts / sidepanel window) 양쪽 export.
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.RoyaltyCore = api;
})(typeof self !== 'undefined' ? self : this);
