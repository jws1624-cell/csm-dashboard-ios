// iOS Safari Extension 세션 초기화 헬퍼 (iframe 없이 직접 fetch)
(function() {
  'use strict';

  // g_ck를 전역으로 저장
  window._gck = null;
  window._gckExpiry = 0;

  const browserAPI = typeof browser !== 'undefined' ? browser : chrome;

  // SSO 실행 (Safari의 실제 쿠키 사용)
  async function fetchGck() {
    console.log('[init] ITSM 세션 확인 시작 (Safari 쿠키 사용)');

    // 먼저 Safari의 ITSM 쿠키 확인
    try {
      const cookies = await browserAPI.cookies.getAll({ domain: '.services.sap' });
      console.log('[init] Safari 쿠키 개수:', cookies.length);

      // JSESSIONID 또는 관련 쿠키 확인
      const sessionCookie = cookies.find(c => c.name.includes('JSESSIONID') || c.name.includes('session'));
      if (sessionCookie) {
        console.log('[init] Safari 세션 쿠키 발견:', sessionCookie.name);
      }
    } catch (e) {
      console.log('[init] 쿠키 조회 실패:', e);
    }

    try {
      const response = await fetch('https://itsm.services.sap/login.do', {
        credentials: 'include',
        redirect: 'follow'
      });

      const html = await response.text();
      const match = html.match(/g_ck\s*=\s*['"]([^'"]+)['"]/);

      if (!match) {
        console.log('[init] ⚠️ g_ck 추출 실패 - 로그인 필요');
        window._gck = null; window._gckExpiry = 0;
        return false;
      }

      // ⚠️ g_ck는 "로그인 안 된 상태의 login.do(SSO 랜딩 페이지)"에도 익명 토큰으로 들어있다.
      // 그래서 g_ck 추출만으로 "세션 있음"을 판정하면 미로그인인데도 true가 되어버린다.
      // → 추출한 g_ck로 가벼운 보호 API를 1회 프로브해서 200일 때만 "진짜 로그인 세션"으로 인정한다.
      // (sap-fetch가 쓰는 sys_user?limit=1 프로브, ONE360의 "fetch 200 = 세션 유효" 판정과 동일 원칙)
      const gckCandidate = match[1];
      let probe;
      try {
        probe = await fetch('https://itsm.services.sap/api/now/table/sys_user?sysparm_limit=1&sysparm_fields=sys_id', {
          credentials: 'include',
          headers: { Accept: 'application/json', 'X-UserToken': gckCandidate }
        });
      } catch (e) {
        console.log('[init] 세션 프로브 네트워크 오류 - 세션 없음 처리:', e.message);
        window._gck = null; window._gckExpiry = 0;
        return false;
      }

      if (probe.ok) {
        window._gck = gckCandidate;
        window._gckExpiry = Date.now() + 15 * 60 * 1000;
        console.log('[init] ✅ 세션 유효(프로브 200) - g_ck 확정:', gckCandidate.slice(0, 8) + '...');
        return true;
      }

      // 401/403 → 익명/미로그인 g_ck. 세션 없음으로 간주 → 호출부(retriggerSso)가 ITSM 로그인 유도.
      console.log('[init] ⚠️ 세션 미유효(프로브', probe.status, ') - 로그인 유도 필요');
      window._gck = null; window._gckExpiry = 0;
      return false;
    } catch (e) {
      console.error('[init] ❌ fetch 오류:', e);
      window._gck = null; window._gckExpiry = 0;
      return false;
    }
  }

  // 활성 탭이 이미 ITSM 또는 SAP SSO IdP 도메인이면 "로그인 진행 중"으로 보고 redirect를 생략한다.
  // (진행 중인 SSO 탭을 다시 redirect하면 로그인 체인이 끊긴다 — 사용자 핵심 요구사항)
  // accounts.sap.com = SAP ID Service, *.accounts.ondemand.com = IAS, *.authentication.*.hana.ondemand.com = XSUAA.
  function isSsoInProgressUrl(url) {
    if (!url) return false;
    return /:\/\/(itsm\.services\.sap|accounts\.sap\.com|[^/]*\.accounts\.ondemand\.com|[^/]*\.authentication\.[^/]*\.hana\.ondemand\.com)\b/i.test(url);
  }

  // 전역 함수로 재연결 요청 노출 - Safari 탭을 ITSM으로 리다이렉트 후 g_ck 유효성 폴링.
  // 로그인 소요 시간이 가변적이므로 고정 대기가 아니라 fetchGck 성공까지 1초 간격 폴링,
  // 시간은 timeout 상한으로만 쓴다. popup은 활성 탭과 별개 WebView라 리다이렉트해도 살아있다.
  window.retriggerSso = async function(callback) {
    console.log('[init] 🔄 SSO 재연결 요청');

    // 리다이렉트 전에 먼저 한 번 확인 — 세션이 이미 있으면(쿠키 유효) 리다이렉트 없이 즉시 성공.
    if (await fetchGck()) { console.log('[init] 리다이렉트 불필요 - g_ck 즉시 획득'); if (callback) callback(true); return; }

    // 활성 탭이 이미 ITSM/IdP면 SSO 진행 중 → redirect 생략, 폴링만(진행 중 로그인을 끊지 않음).
    try {
      const tabs = await browserAPI.tabs.query({ active: true, currentWindow: true });
      if (tabs.length === 0) { if (callback) callback(false); return; }
      if (isSsoInProgressUrl(tabs[0].url)) {
        console.log('[init] SSO 진행 중 감지 - redirect 생략, 폴링만:', (tabs[0].url || '').slice(0, 60));
      } else {
        await browserAPI.tabs.update(tabs[0].id, { url: 'https://itsm.services.sap/now/cwf/agent/home/list' });
      }
    } catch (e) {
      console.error('[init] 탭 조회/리다이렉트 실패:', e);
      if (callback) callback(false);
      return;
    }

    // g_ck 재획득을 1초 간격 폴링(최대 90초). 로그인 완료되는 즉시 성공.
    const deadline = Date.now() + 90000;
    const poll = async () => {
      if (await fetchGck()) { console.log('[init] g_ck 획득 완료'); if (callback) callback(true); return; }
      if (Date.now() >= deadline) { console.log('[init] g_ck 폴링 타임아웃'); if (callback) callback(false); return; }
      setTimeout(poll, 1000);
    };
    setTimeout(poll, 1000);
  };

  // 페이지 로드 시 자동 실행
  fetchGck();

})();
