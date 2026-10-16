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

  // 전역 함수로 재연결 요청 노출 - Safari 탭을 ITSM으로 리다이렉트 후 g_ck 유효성 폴링.
  // 로그인 소요 시간이 가변적이므로 고정 대기가 아니라 fetchGck 성공까지 1초 간격 폴링,
  // 시간은 timeout 상한으로만 쓴다. popup은 활성 탭과 별개 WebView라 리다이렉트해도 살아있다.
  window.retriggerSso = async function(callback) {
    console.log('[init] 🔄 SSO 재연결 요청 - Safari를 ITSM으로 리다이렉트');

    // 리다이렉트 전에 먼저 한 번 확인 — 세션이 이미 있으면(쿠키 유효) 리다이렉트 없이 즉시 성공.
    if (await fetchGck()) { console.log('[init] 리다이렉트 불필요 - g_ck 즉시 획득'); if (callback) callback(true); return; }

    try {
      const tabs = await browserAPI.tabs.query({ active: true, currentWindow: true });
      if (tabs.length === 0) { if (callback) callback(false); return; }
      await browserAPI.tabs.update(tabs[0].id, { url: 'https://itsm.services.sap/now/cwf/agent/home/list' });
    } catch (e) {
      console.error('[init] 탭 리다이렉트 실패:', e);
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
