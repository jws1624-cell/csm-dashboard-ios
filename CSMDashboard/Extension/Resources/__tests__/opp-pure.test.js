// opp-pure.test.js — Opp 탭 이식 소스 가드 (크롬 ai360/downtime 테스트 패턴 미러)
// 실행: node __tests__/opp-pure.test.js
// one360GetOpp의 payload는 in-page fetch라 순수 추출이 어려워, 소스 가드로 핵심 상수/배선을 검증한다.
const fs = require('fs');
const path = require('path');
const assert = require('assert');

const RES = path.join(__dirname, '..');
const js = fs.readFileSync(path.join(RES, 'sidepanel.js'), 'utf8');
const html = fs.readFileSync(path.join(RES, 'popup.html'), 'utf8');
const css = fs.readFileSync(path.join(RES, 'sidepanel.css'), 'utf8');

let failed = 0;
function check(name, cond) {
  if (cond) { console.log('  ✓', name); }
  else { console.error('  ✗', name); failed++; }
}

console.log('[opp-pure] sidepanel.js');
// 함수 정의
check('renderOpp 정의', /function renderOpp\s*\(/.test(js));
check('loadOpp 정의', /async function loadOpp\s*\(/.test(js));
check('one360GetOpp 정의', /async function one360GetOpp\s*\(/.test(js));
check('HARMONY_OPP_URL 상수', /const HARMONY_OPP_URL\s*=/.test(js));
check('_oppAll 상태변수', /let _oppAll\s*=\s*null/.test(js));

// loadOpp은 background sendMessage가 아니라 in-page one360GetOpp를 호출
check('loadOpp → one360GetOpp 호출', /const res = await one360GetOpp\(/.test(js));
check('loadOpp에 ONE360_OPP sendMessage 없음', !/sendMessage\(\s*\{\s*type:\s*['"]ONE360_OPP['"]/.test(js));

// one360GetOpp는 in-page fetch 래퍼(one360Fetch)를 쓴다
check('one360GetOpp → one360Fetch 사용', /one360GetOpp[\s\S]{0,1200}one360Fetch\(/.test(js));
check('one360GetOpp → one360FilterBlock 사용', /one360GetOpp[\s\S]{0,1200}one360FilterBlock\(/.test(js));

// 3개 datablock id
check('Cloud datablock', js.includes('6224a316-00d5-49c5-bc18-9940e4a6da1b'));
check('OnPrem datablock', js.includes('8c6c6bef-a588-4c45-8c9b-390beb27b216'));
check('Service datablock', js.includes('8a8b0794-6edc-4ae7-961d-219e6c6a19ba'));

// version 413 / limit 200 / DRM 4값
check("version '413'", /const OPP_V\s*=\s*['"]413['"]/.test(js));
check('limit 200', /limit:\s*200/.test(js));
check('DRM 4값', /\['Upside',\s*'Committed',\s*'Probable',\s*'Booked\/Won'\]/.test(js));

// Service만 언더스코어 컬럼명 (DRM_Category drmColumn 사용)
check('Service drmColumn DRM_Category', js.includes("'DRM_Category'"));
check('Service 언더스코어 컬럼 Opportunity_ID', js.includes("'Opportunity_ID'"));

// 라우팅 배선
check('탭 클릭 디스패처에 opp→loadOpp', /_accountDetailTab === 'opp'\)\s*loadOpp\(\)/.test(js));
check('applyDetailTabVisibility set oppTab', /set\('oppTab',\s*hasAccount && tab === 'opp'\)/.test(js));
check('캐시 무효화에 _oppAll 포함', /_contractAll = _oppAll = _cacvAll = _consumptionAll[^;]*= null/.test(js));

console.log('[opp-pure] popup.html');
check('data-tab="opp" 버튼', /data-tab="opp"/.test(html));
check('id="oppTab" 패널', /id="oppTab"/.test(html));

console.log('[opp-pure] sidepanel.css');
check('.opp-item 규칙', /\.opp-item\s*\{/.test(css));
check('.opp-list 규칙', /\.opp-list\s*\{/.test(css));
check('.opp-id-link 규칙', /\.opp-id-link\s*\{/.test(css));

console.log(failed === 0 ? '\n[opp-pure] ALL PASS' : `\n[opp-pure] ${failed} FAILED`);
process.exit(failed ? 1 : 0);
