// extractNoteLinks 번호쌍 추출 단위 테스트 (sidepanel.js 순수 로직 복제 — 실제 코드와 동일해야 함)
//
// iOS Safari 확장 포팅본. Chrome 확장(csm-dashboard-ext) 커밋 de0d596 의 kba-extract.test.js 에 대응.
// extractNoteLinks 는 더 이상 제목을 "문자 파싱"하지 않는다 — 제목은 kb_knowledge API(enrichKbaTitles)가
// KB번호로 정확 조회한다. 이 함수는 표시/링크용 번호 쌍 {noteNum, kbNum} 만 뽑는다.
//
// 왜 문자 파싱을 폐기했나:
//   제목에 특수문자·괄호·날짜꼬리가 붙으면 정규식 경계가 깨져 어떤 KBA는 제목이 뜨고 어떤 건 번호만 떴다.
//   → kb_knowledge(number=KBxxx) 조회로 정확한 short_description 를 받는다.
//     kb_knowledge 엔 Note번호 필드가 없어 KB번호로만 조회 가능. 저널에서 둘은 인접하므로 쌍으로 묶는다.
//
// garbage 제거(임의 10자리 숫자 전수매칭 금지, 6~8자리 제약)는 유지.
const assert = require('assert');

let pass = 0, fail = 0;
function t(name, cond) { if (cond) { pass++; } else { fail++; console.log('  ✗ FAIL:', name); } }

// ── sidepanel.js htmlToText 와 동일 동작(개행→공백, 연속공백 축약) ──
function htmlToText(s) {
  return String(s || '').replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim();
}

// ── 수정 후 extractNoteLinks 복제 (실제 코드와 동일) ──
function extractNoteLinks(rawJournal) {
  const raw = rawJournal || '';
  const byNum = new Map(); // noteNum(정규화) → { noteNum, kbNum }

  function add(num, kbNum) {
    const n = String(num).replace(/^0+/, '') || String(num);
    const existing = byNum.get(n);
    if (existing) {
      if (kbNum && !existing.kbNum) existing.kbNum = kbNum; // kbNum 보충(먼저 찾은 것 유지)
      return;
    }
    byNum.set(n, { noteNum: n, kbNum: kbNum || null });
  }

  // (쌍) redirector [code] 블록: number":"000NNNNNNN" ... >KBxxxxxxx</a> ... attached - N
  const reRedir =
    /number["']?\s*:\s*["']0*(\d{6,8})["'][\s\S]{0,200}?>(KB\d{6,})<\/a>[\s\S]{0,80}?attached\s*-\s*0*(\d{6,8})/gi;
  let m;
  while ((m = reRedir.exec(raw)) !== null) add(m[3] || m[1], m[2]);

  // (A1) me.sap.com/notes anchor 번호 (번호만, 제목 아님)
  const reLink = /<a[^>]+href=["'][^"']*me\.sap\.com\/notes\/0*(\d+)[^"']*["'][^>]*>[\s\S]*?<\/a>/gi;
  while ((m = reLink.exec(raw)) !== null) add(m[1], null);

  // (A2) "Knowledge Article ... attached - <번호>" 문맥의 번호 (쌍에서 놓친 것 보강)
  const plain = htmlToText(raw);
  const reKA = /Knowledge Article[\s\S]{0,200}?attached\s*-\s*0*(\d{6,8})\b/gi;
  while ((m = reKA.exec(plain)) !== null) add(m[1], null);

  return [...byNum.values()];
}

// ── 실측 픽스처: 1382392/2026 (SAML IDP 500) 저널의 KBA 라인 + garbage 숫자 ──
// 실제 저널의 HTML/[code] 구조를 그대로 재현.
//   - 3037572 ↔ KB0155141 (redirector 쌍)
//   - 2280022 ↔ KB0633598 (redirector 쌍)
//   - 3542912 → KB 쌍 없음 (me.sap.com anchor 로만 존재) → kbNum null
//   - garbage: 주문번호 1062511138/1041836516, 0패딩 0000010059, 구독ID 10자리
const JOURNAL =
  `Knowledge Article [code]<a href='/redirector.do?genericParameters={"number":"0003037572"}'>KB0155141</a>[/code] has been attached - 3037572 - How to switch from one custom IdP to another custom IdP in SAP Analytics Cloud (SAC) ` +
  `Knowledge Article [code]<a href='/redirector.do?genericParameters={"number":"0002280022"}'>KB0633598</a>[/code] has been attached - 2280022 - How to collect a HTTP archive (HAR) file and Console Log file in SAP Analytics Cloud ` +
  `See also <a href="https://me.sap.com/notes/0003542912">3542912 - Failed to Verify Account after uploading metadata file when trying to switch IdP</a> ` +
  `Also note <a href="https://me.sap.com/notes/0003037572">0003037572</a> ` +
  `Watch List Subscription 1382392/2026 (0002075129500013823922026) ` +
  `Order 1062511138 and 1041836516 were created. Ref 0000010059.`;

console.log('[1] garbage 숫자 제거 (6~8자리 제약)');
(function(){
  const nums = extractNoteLinks(JOURNAL).map(l => l.noteNum);
  t('garbage 1062511138 제외', !nums.includes('1062511138'));
  t('garbage 1041836516 제외', !nums.includes('1041836516'));
  t('garbage 10059(0000010059) 제외', !nums.includes('10059'));
  t('구독ID(8자리 초과) 제외', !nums.some(n => n.length > 8));
})();

console.log('[2] 유효 KBA 유지');
(function(){
  const nums = extractNoteLinks(JOURNAL).map(l => l.noteNum);
  t('3037572 포함', nums.includes('3037572'));
  t('2280022 포함', nums.includes('2280022'));
  t('3542912 포함', nums.includes('3542912'));
  t('유효 KBA 정확히 3개', nums.length === 3);
})();

console.log('[3] Note↔KB 쌍 매칭 (kb_knowledge 조회 키)');
(function(){
  const by = Object.fromEntries(extractNoteLinks(JOURNAL).map(l => [l.noteNum, l.kbNum]));
  t('3037572 → KB0155141 (redirector 쌍)', by['3037572'] === 'KB0155141');
  t('2280022 → KB0633598 (redirector 쌍)', by['2280022'] === 'KB0633598');
  t('3542912 → null (KB 쌍 없음, 번호만)', by['3542912'] === null);
})();

console.log('[4] redirector 0패딩 ↔ attached 번호 동일 Note 로 병합');
(function(){
  // 0003037572(redirector) 와 3037572(attached) 는 0패딩 제거 후 같은 Note. 쌍 1개로.
  const links = extractNoteLinks(JOURNAL);
  const n3037572 = links.filter(l => l.noteNum === '3037572');
  t('3037572 는 중복 없이 1개', n3037572.length === 1);
  t('병합 후에도 kbNum 유지', n3037572[0] && n3037572[0].kbNum === 'KB0155141');
})();

console.log('[5] 중복 병합 (redirector 쌍 + 나중 me.sap.com anchor)');
(function(){
  // 3037572 는 redirector 쌍(KB0155141)으로도, 뒤의 "Also note" me.sap.com anchor 로도 등장.
  // → 1개로 병합되며 kbNum(먼저 찾은 KB0155141) 유지.
  const dup =
    `Knowledge Article [code]<a href='/x?p={"number":"0003037572"}'>KB0155141</a>[/code] has been attached - 3037572 ` +
    `<a href="https://me.sap.com/notes/0003037572">0003037572</a>`;
  const links = extractNoteLinks(dup);
  t('중복 Note → 1개로 병합', links.length === 1);
  t('병합 시 kbNum(KB0155141) 유지', links[0].kbNum === 'KB0155141');
  t('noteNum 0패딩 제거', links[0].noteNum === '3037572');
})();

console.log('[6] 안전성 (빈 입력 / KB 없는 anchor)');
(function(){
  t('빈 저널 → []', extractNoteLinks('').length === 0);
  t('null 저널 → []', extractNoteLinks(null).length === 0);
  const links = extractNoteLinks(`<a href="https://me.sap.com/notes/0001234567">0001234567</a>`);
  t('KB 쌍 없는 anchor → noteNum 추출', links.length === 1 && links[0].noteNum === '1234567');
  t('KB 쌍 없는 anchor → kbNum null', links.length === 1 && links[0].kbNum === null);
})();

console.log(`\n[최종] KBA 번호쌍 추출 테스트: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
