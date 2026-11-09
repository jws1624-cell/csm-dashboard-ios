// pickSourceEntry 단위 테스트 (sidepanel.js 순수 로직 복제 — 실제 코드와 동일해야 함)
//
// 버그: Overview AI Insight "원문" 박스가 저널 최신 1건이 아니라 서버 AI 가 고른
//   source_entry 를 그대로 보여줘, 방금 온 최신 고객 회신 대신 "내용 풍부한" 과거
//   SAP 기술답변(예: 11/3 Pierre)이 원문으로 노출되는 오독이 발생(CS20260013611928).
// 수정: parseJournal(newest-first) 의 [0] = 저널 최신 1건을 결정적으로 원문으로 고정.
//   저널 없거나 파싱 실패 시 AI source_entry(fallback) 로.
const assert = require('assert');

let pass = 0, fail = 0;
function t(name, cond) { if (cond) { pass++; } else { fail++; console.log('  ✗ FAIL:', name); } }

// ── sidepanel.js 의 parseJournal + pickSourceEntry 복제 (실제 코드와 동일해야 함) ──
function htmlToText(h) { return String(h || '').replace(/<[^>]+>/g, '').trim(); }

function parseJournal(raw) {
  if (!raw) return [];
  const headerRe = /^(\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}) - (.+?) \(([^()]+)\)\s*(?:\(([^()]+)\))?\s*$/;
  const lines = String(raw).split('\n');
  const entries = [];
  let cur = null;
  for (const line of lines) {
    const m = line.match(headerRe);
    if (m) {
      if (cur) entries.push(cur);
      const author = m[2].trim();
      const type = m[4] ? m[4].trim() : m[3].trim();
      cur = { time: m[1], author, type, bodyLines: [] };
    } else if (cur) {
      cur.bodyLines.push(line);
    }
  }
  if (cur) entries.push(cur);
  return entries.map(e => ({
    time: e.time,
    author: e.author,
    type: e.type,
    html: e.bodyLines.join('\n'),
    text: htmlToText(e.bodyLines.join('\n'))
  }));
}

// ── isNoiseEntry + pickSourceEntry 복제 (sidepanel.js 와 동일해야 함) ──
const NOISE_TEXT_PATTERNS = [
  /\bEscalation\s+ESC\d+\s+has\s+(updated|been\s+closed|been\s+created)/i,
  /\bEscalation\s+ESC\d+\s+has\b/i,
  /^(De-)?Escalation\s+justification\s*:/i,
  /\bhas\s+approved\s+escalation\b/i,
  /\bhas\s+requested\s+to\s+escalate\s+this\s+Case\b/i,
  /\bPriority\s+updated\s+to\s*:/i,
  /\bBusiness\s+Impact\s+updated\s+to\s*:/i,
  /\bThe\s+priority\s+of\s+your\s+case\s+was\s+raised\b/i,
  /\bYou\s+will\s+receive\s+an\s+update\s+about\s+this\s+incident\b/i,
  /\bautomatically\s+generated\s+update\b/i,
  /\bautomatically\s+rerouted\b/i,
  /\bsystem-generated\b/i,
  /\bBot\s+on\s+behalf\s+of\b/i,
  /\bKnowledge\s+Article\b.*\bhas\s+been\s+attached\b/i,
  /^Attached\s+Result\b/i,
  /^Attachment\s+uploaded\b/i,
  /\bCode\s+Correction\b.*\bhas\s+been\s+(updated|created)\b/i,
  /\bCode\s+Correction\s+record\b.*\bhas\s+been\s+created\b/i,
  /\bCase\s+has\s+been\s+created\s+and\s+System\s+Access\s+Required\b/i,
];
const NOISE_AUTHOR_PATTERNS = [/^System$/i, /ServiceNow\s+Integration\s+User/i, /\bINT_LP_SN\b/i];
function isNoiseEntry(entry) {
  if (!entry) return true;
  const text = String(entry.text == null ? '' : entry.text).trim();
  if (!text) return true;
  const author = String(entry.author == null ? '' : entry.author).trim();
  for (const re of NOISE_AUTHOR_PATTERNS) { if (re.test(author)) return true; }
  for (const re of NOISE_TEXT_PATTERNS) { if (re.test(text)) return true; }
  return false;
}

function pickSourceEntry(journal, fallback) {
  try {
    const entries = journal ? parseJournal(journal) : [];
    for (const e of entries) {
      if (!isNoiseEntry(e) && (e.text || e.time)) return e;
    }
    if (entries.length && (entries[0].text || entries[0].time)) return entries[0];
  } catch (_) { /* noop */ }
  return (fallback && (fallback.text || fallback.time)) ? fallback : null;
}

// ── fixtures ──────────────────────────────────────────────────────────
// ServiceNow comments_and_work_notes 는 newest-first: 최신(11/9)이 맨 위.
const JOURNAL = [
  '2026-11-09 09:06:00 - Pierre BOURNAVEAS (I052688) (External Info)',
  'Hello, thanks for the update. We will test it. (customer reply)',
  '2026-11-03 00:01:16 - Pierre BOURNAVEAS (I052688) (External Info)',
  'The Scheduling for Data Analyzer is limited for dynamic variables, we only support what was persisted in the Insight. (long SAP technical answer)'
].join('\n');

// AI 가 "내용 풍부한" 과거 11/3 항목을 source 로 집은 상태
const AI_SOURCE_ENTRY = {
  time: '2026-11-03 00:01:16',
  author: 'Pierre BOURNAVEAS',
  type: 'External Info',
  text: 'The Scheduling for Data Analyzer is limited for dynamic variables...'
};

// ── 테스트 ────────────────────────────────────────────────────────────
console.log('── pickSourceEntry 테스트 ──');

// 1. 저널 있으면 최신 1건(11/9)을 고른다 — AI 가 과거 11/3 을 줘도 무시
{
  const e = pickSourceEntry(JOURNAL, AI_SOURCE_ENTRY);
  t('저널 최신(11/9) 선택', e && e.time === '2026-11-09 09:06:00');
  t('과거 11/3 제외', e && e.time !== '2026-11-03 00:01:16');
  t('최신 본문 포함', e && /customer reply/.test(e.text));
  t('과거 본문 제외', e && !/long SAP technical answer/.test(e.text));
}

// 2. 저널 없으면 AI source_entry(fallback) 사용 — 하위호환
{
  const e = pickSourceEntry('', AI_SOURCE_ENTRY);
  t('저널 없음 → fallback 사용', e && e.time === '2026-11-03 00:01:16');
}

// 3. 저널·fallback 둘 다 없으면 null (원문 박스 생략, 크래시 없음)
{
  const e = pickSourceEntry('', null);
  t('둘 다 없음 → null', e === null);
  const e2 = pickSourceEntry(null, undefined);
  t('null/undefined → null', e2 === null);
}

// 4. fallback 이 빈 객체({})면 무효 처리 → null
{
  const e = pickSourceEntry('', {});
  t('빈 fallback({}) → null', e === null);
}

// 5. 저널이 파싱 불가(헤더 없는 평문)면 fallback 으로
{
  const e = pickSourceEntry('그냥 평문, 헤더 라인 없음', AI_SOURCE_ENTRY);
  t('파싱 불가 저널 → fallback', e && e.time === '2026-11-03 00:01:16');
}

// 6. 단일 엔트리 저널도 그 1건을 그대로
{
  const single = '2026-11-09 09:06:00 - Kim (I000001) (Customer comments)\n단건 회신';
  const e = pickSourceEntry(single, null);
  t('단일 엔트리 선택', e && e.author === 'Kim' && /단건 회신/.test(e.text));
}

// 7. 최신이 시스템 자동 노이즈(Escalation 업데이트)면 건너뛰고 의미있는 최신 코멘트를 고른다
//    (실측 1382392/2026: Escalation 노이즈 3건 + 고객 자동 Priority변경 → 그 아래 사람 코멘트)
{
  const noisyJournal = [
    '2026-11-09 12:21:39 - Calvin Liu (I039369) (Internal Info)',
    'Escalation ESC1619724 has updated:',
    '2026-11-09 12:21:38 - Calvin Liu (I039369) (Internal Info)',
    'Escalation ESC1619724 has been closed.',
    '2026-11-09 10:41:07 - SAC Next ERP (S0024220687) (External Info from Customer)',
    'Priority updated to: Medium Business Impact updated to: Moderately affected',
    '2026-11-08 03:40:57 - Woosuk Jung (I070866) (Internal Info)',
    'Customer fixed Group attr in custom idp. Will perform final test next week then case can be closed.',
  ].join('\n');
  const e = pickSourceEntry(noisyJournal, null);
  t('노이즈(Escalation) 최신 건너뜀', e && !/Escalation ESC1619724/.test(e.text));
  t('노이즈(자동 Priority변경) 건너뜀', e && !/Priority updated to/.test(e.text));
  t('의미있는 최신 코멘트 선택', e && /Customer fixed Group attr/.test(e.text));
  t('선택 항목 시각=11/08', e && e.time === '2026-11-08 03:40:57');
}

// 8. isNoiseEntry: 이름 아닌 패턴 기반 — 같은 저자라도 실제 내용이면 의미있음
{
  t('Escalation 라인 노이즈', isNoiseEntry({ author: 'Calvin Liu', text: 'Escalation ESC123 has updated:' }) === true);
  t('같은 저자 실제코멘트 의미있음', isNoiseEntry({ author: 'Calvin Liu', text: 'I found the root cause in backend logs.' }) === false);
  t('System 저자 노이즈', isNoiseEntry({ author: 'System', text: 'The priority of your case was raised.' }) === true);
  t('빈 본문 노이즈', isNoiseEntry({ author: 'X', text: '' }) === true);
  t('Attachment uploaded 노이즈', isNoiseEntry({ author: 'Cust', text: 'Attachment uploaded' }) === true);
}

// 9. 전부 노이즈면 raw 최신(빈 화면 방지) — 익스텐션은 표시용이므로 최소 1건은 보여줌
{
  const allNoise = [
    '2026-11-09 12:21:39 - Calvin Liu (I039369) (Internal Info)',
    'Escalation ESC1619724 has updated:',
    '2026-11-09 12:21:38 - Calvin Liu (I039369) (Internal Info)',
    'Escalation ESC1619724 has been closed.',
  ].join('\n');
  const e = pickSourceEntry(allNoise, null);
  t('전부 노이즈 → raw 최신 폴백(빈화면 방지)', e && e.time === '2026-11-09 12:21:39');
}

console.log(`\n결과: ${pass} pass, ${fail} fail`);
process.exit(fail ? 1 : 0);
