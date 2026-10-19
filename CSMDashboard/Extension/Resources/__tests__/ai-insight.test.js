// parseAiStructured 평탄화 로직 단위 테스트 (sidepanel.js 순수 로직 복제 — 실제 코드와 동일해야 함)
//
// iOS Safari 확장 포팅본. Chrome 확장(csm-dashboard-ext) 커밋 4201f3b 의 ai-insight.test.js 를
// 그대로 가져옴. iOS sidepanel.js 의 parseAiStructured 는 Chrome 원본과 동일하게 포팅됨.
//
// 버그: BTP /api/ai/insight 가 전체 insight 를 한 문자열 필드(주로 current_state)에
//   JSON.stringify 로 통째로 재래핑해 반환하는 경우(1228483/2026 재현)가 있다.
//   기존 parseAiStructured 는 그 필드를 "객체로 파싱"만 하고 바깥 필드로 재분배(평탄화)
//   하지 않아, 렌더러가 그 객체를 JSON.stringify 로 다시 찍어 화면에 JSON 덩어리가 노출됐다.
//   (customer_inquiry/required_action 은 빈칸.)
// 수정: 서버 normalizeInsight 와 동일하게, 문자열 필드가 insight 스키마를 가진 JSON 이면
//   그 객체로 바깥을 승격(평탄화). 중첩 대비 반복. 평문은 건드리지 않음(오탐 방지).
const assert = require('assert');

let pass = 0, fail = 0;
function t(name, cond) { if (cond) { pass++; } else { fail++; console.log('  ✗ FAIL:', name); } }

// ── 수정 후 parseAiStructured 복제 (실제 sidepanel.js 와 동일해야 함) ──
const _INSIGHT_STRING_KEYS = ['customer_inquiry', 'current_state', 'required_action'];
function _looksLikeInsight(o) {
  if (!o || typeof o !== 'object' || Array.isArray(o)) return false;
  const keys = ['customer_inquiry', 'current_state', 'required_action', 'timeline', 'source_entry'];
  return keys.filter(k => k in o).length >= 2;
}
function parseAiStructured(insight) {
  // insight 전체가 JSON 문자열이면 객체화
  if (typeof insight === 'string') {
    const s = insight.trim();
    if (s.startsWith('{')) { try { insight = JSON.parse(s); } catch { insight = {}; } }
    else return { customer_inquiry: '', current_state: String(insight || ''), required_action: '', source_entry: null, timeline: [] };
  }
  if (!insight || typeof insight !== 'object' || Array.isArray(insight)) insight = {};

  // 문자열 필드가 재래핑된 insight 면 바깥을 그 객체로 교체. 중첩 대비 최대 4회.
  for (let i = 0; i < 4; i++) {
    let promoted = false;
    for (const k of _INSIGHT_STRING_KEYS) {
      const v = insight[k];
      if (typeof v !== 'string') continue;
      const trimmed = v.trim();
      if (!trimmed.startsWith('{')) continue;
      let parsed;
      try { parsed = JSON.parse(trimmed); } catch { continue; }
      if (_looksLikeInsight(parsed)) { insight = parsed; promoted = true; break; }
    }
    if (!promoted) break;
  }

  const str = (x) => (typeof x === 'string' ? x : (x == null ? '' : String(x)));
  return {
    customer_inquiry: str(insight.customer_inquiry),
    current_state: str(insight.current_state),
    required_action: str(insight.required_action),
    source_entry: (insight.source_entry && insight.source_entry.text) ? insight.source_entry : null,
    timeline: Array.isArray(insight.timeline) ? insight.timeline : [],
  };
}

// ── 깨진 응답 재현 (1228483/2026, Samsung) ──
const INNER = {
  customer_inquiry: 'Samsung 이 SAML IDP 변경 중 500 에러를 보고',
  current_state: '담당자가 메타데이터 등록 오류를 분석 중',
  required_action: 'SAP: 재현 후 수정 / 고객: 테스트 창 공유',
  source_entry: { time: '2026-10-19', author: 'Peter Han', type: 'External', text: '...' },
  timeline: [{ date: '2026-10-19', summary: '500 에러 보고', actor: '고객' }],
};
const BROKEN = { customer_inquiry: '', current_state: JSON.stringify(INNER), required_action: '', timeline: INNER.timeline };

console.log('[1] 깨진 응답(current_state 재래핑) 평탄화');
(function(){
  const r = parseAiStructured(BROKEN);
  t('customer_inquiry 복원', r.customer_inquiry === INNER.customer_inquiry);
  t('required_action 복원', r.required_action === INNER.required_action);
  t('current_state 평탄화', r.current_state === INNER.current_state);
  t('current_state 가 문자열(객체 아님)', typeof r.current_state === 'string');
  t('current_state 에 JSON 잔존 안 함', !r.current_state.trim().startsWith('{') && !r.current_state.includes('"customer_inquiry"'));
  t('source_entry 복원', r.source_entry && r.source_entry.author === 'Peter Han');
  t('timeline 유지', Array.isArray(r.timeline) && r.timeline.length === 1);
})();

console.log('[2] 정상 응답 보존(오탐 없음)');
(function(){
  const r = parseAiStructured(INNER);
  t('정상 current_state 그대로', r.current_state === INNER.current_state);
  t('정상 customer_inquiry 그대로', r.customer_inquiry === INNER.customer_inquiry);
})();

console.log('[3] 진짜 평문 보존');
(function(){
  const r = parseAiStructured({ customer_inquiry: '', current_state: '분석 중입니다. { 포함 가능.', required_action: '', timeline: [] });
  t('평문 current_state 훼손 안 됨', r.current_state === '분석 중입니다. { 포함 가능.');
})();

console.log('[4] 중첩 재래핑 / 문자열 insight / null');
(function(){
  const twice = { customer_inquiry: '', current_state: JSON.stringify(INNER), required_action: '', timeline: INNER.timeline };
  const outer = { customer_inquiry: '', current_state: JSON.stringify(twice), required_action: '', timeline: INNER.timeline };
  t('중첩 평탄화', parseAiStructured(outer).customer_inquiry === INNER.customer_inquiry);
  t('insight 전체가 JSON 문자열', parseAiStructured(JSON.stringify(INNER)).customer_inquiry === INNER.customer_inquiry);
  const n = parseAiStructured(null);
  t('null 안전', n.customer_inquiry === '' && Array.isArray(n.timeline));
  // 순수 평문 문자열(JSON 아님)은 current_state 로
  t('평문 문자열 insight → current_state', parseAiStructured('그냥 요약 텍스트').current_state === '그냥 요약 텍스트');
})();

console.log('[5] 렌더 시 JSON 원문 노출 안 함 (렌더러 displayValue 복제)');
(function(){
  const r = parseAiStructured(BROKEN);
  // renderAiStructured 의 displayValue 로직: 객체면 stringify, 아니면 그대로
  const display = (v) => (v && typeof v === 'object') ? JSON.stringify(v, null, 2) : (v || '—');
  const cs = display(r.current_state);
  t('current_state 렌더값에 JSON 키 없음', !cs.includes('"customer_inquiry"'));
  t('current_state 렌더값이 실제 요약', cs.includes('메타데이터 등록 오류'));
})();

console.log(`\n[최종] parseAiStructured 테스트: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
