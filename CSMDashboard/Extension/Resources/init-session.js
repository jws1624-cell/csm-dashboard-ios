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

      if (match) {
        window._gck = match[1];
        window._gckExpiry = Date.now() + 15 * 60 * 1000;
        console.log('[init] ✅ g_ck 획득 성공:', window._gck.slice(0, 8) + '...');
        return true;
      } else {
        console.log('[init] ⚠️ g_ck 추출 실패 - 로그인 필요할 수 있음');
        return false;
      }
    } catch (e) {
      console.error('[init] ❌ fetch 오류:', e);
      return false;
    }
  }

  // 전역 함수로 재연결 요청 노출 - Safari 탭을 ITSM으로 리다이렉트
  window.retriggerSso = async function(callback) {
    console.log('[init] 🔄 SSO 재연결 요청 - Safari를 ITSM으로 리다이렉트');

    try {
      // 현재 탭을 ITSM으로 리다이렉트
      const tabs = await browserAPI.tabs.query({ active: true, currentWindow: true });
      if (tabs.length > 0) {
        const tab = tabs[0];
        console.log('[init] 현재 탭을 ITSM으로 리다이렉트:', tab.url);

        // ITSM으로 이동 (SSO가 제대로 동작하는 URL)
        await browserAPI.tabs.update(tab.id, { url: 'https://itsm.services.sap/now/cwf/agent/home/list' });

        // 3초 대기 후 g_ck 재시도
        setTimeout(async () => {
          console.log('[init] SSO 완료 대기 후 g_ck 재획득');
          const success = await fetchGck();
          console.log('[init] g_ck 재획득 결과:', success);
          if (callback) callback(success);
        }, 3000);
      } else {
        console.error('[init] 활성 탭을 찾을 수 없음');
        if (callback) callback(false);
      }
    } catch (e) {
      console.error('[init] 탭 리다이렉트 실패:', e);
      if (callback) callback(false);
    }
  };

  // 페이지 로드 시 자동 실행
  fetchGck();

})();
