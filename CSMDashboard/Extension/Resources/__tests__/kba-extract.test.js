// extractNoteLinks 개선 로직 단위 테스트 (sidepanel.js 순수 로직 복제 — 실제 코드와 동일해야 함)
//
// iOS Safari 확장 포팅본. Chrome 확장(csm-dashboard-ext) 커밋 a52f4d5 의 kba-extract.test.js 를
// 그대로 가져옴. iOS sidepanel.js 의 extractNoteLinks 는 Chrome 원본과 문자 단위로 동일하므로
// 아래 복제 로직도 두 플랫폼 공통이다.
//
// 버그(수정 전):
//   1) /\b(\d{10})\b/g 로 저널 평문의 임의 10자리 숫자를 전부 SAP Note 로 오인 → garbage 링크
//      (주문번호·구독ID·0패딩 번호 등). 예: 1062511138, 1041836516, 0000010059(→10059)
//   2) anchor 내부 텍스트만 제목으로 써서, 저널 다른 줄의 "번호 - 제목" 평문과 조인 안 함
//      → 가장 유용한 3037572 가 번호만 뜨고 "How to switch..." 제목이 빠짐
//
// 추가로 드러난 버그(1차 수정 후):
//   3) htmlToText 가 개행을 공백으로 뭉개 저널이 "한 줄"이 되므로, 제목 종료조건 \n 이 안 먹고
//      $(끝)까지 탐욕적으로 빨려 다음 KBA·저널 전체가 제목에 붙음. → 종료 경계를 명시 토큰으로.
const assert = require('assert');

let pass = 0, fail = 0;
function t(name, cond) { if (cond) { pass++; } else { fail++; console.log('  ✗ FAIL:', name); } }

// ── sidepanel.js htmlToText 와 동일 동작(개행→공백, 연속공백 축약) ──
// ⚠️ 실제 htmlToText 는 개행을 공백으로 만든다 → 저널 전체가 한 줄이 됨. 테스트 픽스처도
//    반드시 이 변환을 거친 뒤 검증해야 "줄 끝까지 빨림" 버그를 잡을 수 있다.
function htmlToText(s) {
  return String(s || '').replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim();
}

// 제목 종료 경계: 다음 KBA 번호(\d{6,8} -), "Knowledge Article", "See also", "Also note",
// [code], 문자열 끝. 개행이 공백으로 뭉개진 1줄 텍스트에서 제목이 다음 항목으로 번지지 않게.
const TITLE_STOP = '(?=\\s+0*\\d{6,8}\\s*-|\\s+Knowledge Article\\b|\\s+See also\\b|\\s+Also note\\b|\\s*\\[\\/?code\\]|$)';

// ── 수정 후 extractNoteLinks 복제 (실제 코드와 동일) ──
function extractNoteLinks(rawJournal) {
  const raw = rawJournal || '';
  const byNum = new Map();
  const plain = htmlToText(raw);

  // (B) "번호 - 제목" 평문 매핑. 제목은 TITLE_STOP 경계까지, 최대 120자.
  const titleMap = new Map();
  const reTitle = new RegExp(`\\b0*(\\d{6,8})\\b\\s*-\\s*(.+?)${TITLE_STOP}`, 'gi');
  let tm;
  while ((tm = reTitle.exec(plain)) !== null) {
    const num = tm[1].replace(/^0+/, '') || tm[1];
    const title = tm[2].trim().slice(0, 120).trim();
    if (title && !/^\d+$/.test(title) && !titleMap.has(num)) titleMap.set(num, title);
  }

  function add(num) {
    const n = num.replace(/^0+/, '') || num;
    if (byNum.has(n)) return;
    byNum.set(n, { num: n, title: titleMap.get(n) || n });
  }

  // (A1) me.sap.com/notes anchor 번호. anchor inner(</a> 경계) 제목이 유효하면 우선 신뢰.
  const reLink = /<a[^>]+href=["'][^"']*me\.sap\.com\/notes\/0*(\d+)[^"']*["'][^>]*>([\s\S]*?)<\/a>/gi;
  let m;
  while ((m = reLink.exec(raw)) !== null) {
    const num = m[1];
    add(num);
    const inner = htmlToText(m[2]);
    if (inner && !/^\d+$/.test(inner) && !/^https?:/.test(inner) && !/^KB0/.test(inner)) {
      const n = num.replace(/^0+/, '') || num;
      const cleaned = inner.replace(/^0*\d+\s*-\s*/, '').trim().slice(0, 120).trim();
      if (cleaned) byNum.get(n).title = cleaned;
    }
  }

  // (A2) "Knowledge Article ... attached - <번호>" 문맥의 번호
  const reKA = /Knowledge Article[\s\S]{0,200}?attached\s*-\s*0*(\d{6,8})\b/gi;
  while ((m = reKA.exec(plain)) !== null) add(m[1]);

  return [...byNum.values()].map(({ num, title }) => ({ num, title }));
}

// ── 실측 픽스처: 1382392/2026 (SAML IDP 500) 저널의 KBA 라인 + garbage 숫자 ──
// 실제 저널의 HTML/[code] 구조를 그대로 재현 (여러 KBA 가 이어붙음).
const JOURNAL =
  `Knowledge Article [code]<a href='/redirector.do?genericParameters={"number":"0003037572"}'>KB0155141</a>[/code] has been attached - 3037572 - How to switch from one custom IdP to another custom IdP in SAP Analytics Cloud (SAC) ` +
  `Knowledge Article [code]<a href='/redirector.do?genericParameters={"number":"0002280022"}'>KB0633598</a>[/code] has been attached - 2280022 - How to collect a HTTP archive (HAR) file and Console Log file in SAP Analytics Cloud ` +
  `See also <a href="https://me.sap.com/notes/0003542912">3542912 - Failed to Verify Account after uploading metadata file when trying to switch IdP</a> ` +
  `Also note <a href="https://me.sap.com/notes/0003037572">0003037572</a> ` +
  `Watch List Subscription 1382392/2026 (0002075129500013823922026) ` +
  `Order 1062511138 and 1041836516 were created. Ref 0000010059.`;

console.log('[1] garbage 10자리 숫자 제거');
(function(){
  const nums = extractNoteLinks(JOURNAL).map(l => l.num);
  t('garbage 1062511138 제외', !nums.includes('1062511138'));
  t('garbage 1041836516 제외', !nums.includes('1041836516'));
  t('garbage 10059(0000010059) 제외', !nums.includes('10059'));
  t('구독ID(8자리 초과) 제외', !nums.some(n => n.length > 8));
})();

console.log('[2] 유효 KBA 유지');
(function(){
  const nums = extractNoteLinks(JOURNAL).map(l => l.num);
  t('3037572 포함', nums.includes('3037572'));
  t('2280022 포함', nums.includes('2280022'));
  t('3542912 포함', nums.includes('3542912'));
  t('유효 KBA 정확히 3개', nums.length === 3);
})();

console.log('[3] 제목 조인 + 경계 (다음 항목으로 안 번짐)');
(function(){
  const by = Object.fromEntries(extractNoteLinks(JOURNAL).map(l => [l.num, l.title]));
  t('3037572 에 "How to switch..." 제목', /How to switch/.test(by['3037572']));
  t('3037572 제목이 번호만 아님', by['3037572'] !== '3037572');
  t('3037572 제목에 다음 "Knowledge Article" 안 섞임', !/Knowledge Article/.test(by['3037572']));
  t('2280022 에 "HTTP archive (HAR)" 제목', /HTTP archive/.test(by['2280022']));
  t('2280022 제목에 "See also"/뒤 저널 안 섞임', !/See also|Order|Watch List/.test(by['2280022']));
  t('3542912 에 "Failed to Verify" 제목', /Failed to Verify/.test(by['3542912']));
  t('어떤 제목도 100자 넘지 않음(폭주 방지)', Object.values(by).every(v => v.length <= 100));
})();

console.log('[4] 안전성 (빈 입력/제목 없는 번호)');
(function(){
  t('빈 저널 → []', extractNoteLinks('').length === 0);
  t('null 저널 → []', extractNoteLinks(null).length === 0);
  const links = extractNoteLinks(`<a href="https://me.sap.com/notes/0001234567">0001234567</a>`);
  t('제목 없는 anchor → title=번호', links.length === 1 && links[0].title === '1234567');
})();

console.log(`\n[최종] KBA 추출 테스트: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
