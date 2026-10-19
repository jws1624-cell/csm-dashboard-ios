'use strict';
// ONE360 accountId 캐시(CRM→accountId, 고객사당 1회) 단위 테스트 (DOM 비의존).
//
// sidepanel.js one360GetAccount 진입부 캐시 로직을 순수화해 복제. 실제 코드와 동일 동작해야 함.
//   - 같은 crmId 반복 호출 → fetcher 1회만 (세 탭 Contract/cACV/Consumption 공유)
//   - crmId 변경 → 재호출 (계열사/다른 고객사)
//   - invalidate(=_accountIdCache=null) 후 → 재호출 (고객사 변경 시 무효화)
const assert = require('assert');

let pass = 0, fail = 0;
function t(name, cond) { if (cond) { pass++; } else { fail++; console.log('  ✗ FAIL:', name); } }

// fetcher 주입형 캐시 — one360GetAccount 진입부 로직과 동일 구조.
function makeAccountCache() {
  let _accountIdCache = null;  // {crmId, account}
  let fetchCount = 0;
  async function getAccount(crmId, fetcher) {
    if (_accountIdCache && _accountIdCache.crmId === crmId) {
      return { ok: true, account: _accountIdCache.account, cached: true };
    }
    fetchCount++;
    const account = await fetcher(crmId); // 실제 one360Fetch 자리
    _accountIdCache = { crmId, account };
    return { ok: true, account, cached: false };
  }
  return {
    getAccount,
    invalidate: () => { _accountIdCache = null; },
    get fetchCount() { return fetchCount; },
  };
}

const fakeFetcher = async (crmId) => ({ accountId: 'ACC_' + crmId, customerName: 'Cust ' + crmId, guAccountId: 'GU_' + crmId });

(async () => {
  console.log('[1] 같은 crmId 3회 → fetcher 1회 (★고객사당 1회)');
  await (async function(){
    const c = makeAccountCache();
    const r1 = await c.getAccount('100', fakeFetcher); // Contract 탭
    const r2 = await c.getAccount('100', fakeFetcher); // cACV 탭
    const r3 = await c.getAccount('100', fakeFetcher); // Consumption 탭
    t('fetcher 정확히 1회 호출', c.fetchCount === 1);
    t('1회차는 조회(cached=false)', r1.cached === false);
    t('2회차는 캐시 히트', r2.cached === true);
    t('3회차는 캐시 히트', r3.cached === true);
    t('반환 accountId 동일', r1.account.accountId === 'ACC_100' && r3.account.accountId === 'ACC_100');
  })();

  console.log('[2] crmId 변경 → 재호출');
  await (async function(){
    const c = makeAccountCache();
    await c.getAccount('100', fakeFetcher);
    const r = await c.getAccount('200', fakeFetcher); // 다른 고객사
    t('다른 crmId면 fetcher 재호출', c.fetchCount === 2);
    t('새 crmId 조회(cached=false)', r.cached === false);
    t('새 accountId 반영', r.account.accountId === 'ACC_200');
    // 다시 100으로 가면(캐시가 200으로 덮인 상태) 또 조회 — 캐시는 1개 슬롯
    const back = await c.getAccount('100', fakeFetcher);
    t('이전 crmId 복귀 시 재조회(단일 슬롯)', c.fetchCount === 3 && back.cached === false);
  })();

  console.log('[3] invalidate(고객사 변경) 후 재호출');
  await (async function(){
    const c = makeAccountCache();
    await c.getAccount('100', fakeFetcher);
    c.invalidate(); // _accountIdCache = null (고객사 바뀜/btnBackMain)
    const r = await c.getAccount('100', fakeFetcher);
    t('invalidate 후 같은 crmId도 재조회', c.fetchCount === 2 && r.cached === false);
  })();

  console.log(`\n[최종] ONE360 accountId 캐시 테스트: ${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})();
