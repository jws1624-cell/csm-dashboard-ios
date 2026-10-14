// iOS Safari Extension 세션 초기화 헬퍼
(function() {
  'use strict';

  const browserAPI = typeof browser !== 'undefined' ? browser : chrome;
  let _ssoInProgress = false;
  let _reconnectCallback = null;

  // g_ck를 전역으로 저장 (background.js 없이 직접 사용)
  window._gck = null;
  window._gckExpiry = 0;

  // 전역 함수로 재연결 요청 노출
  window.retriggerSso = function(callback) {
    console.log('[init] 🔄 SSO 재연결 요청');
    _reconnectCallback = callback;
    _ssoInProgress = true;

    // iframe을 직접 reload
    const iframe = document.getElementById('sso-iframe');
    if (iframe) {
      console.log('[init] iframe.contentWindow.location.reload()');
      try {
        iframe.contentWindow.location.reload();
      } catch (e) {
        console.log('[init] reload 실패, src 재설정:', e.message);
        const originalSrc = iframe.src;
        iframe.src = originalSrc + '?t=' + Date.now();
      }
      console.log('[init] iframe 재로드 완료');
    } else {
      console.error('[init] ❌ sso-iframe을 찾을 수 없음');
      _ssoInProgress = false;
      if (_reconnectCallback) {
        const cb = _reconnectCallback;
        _reconnectCallback = null;
        cb(false);
      }
    }
  };

  // iframe에서 SSO 결과 수신
  window.addEventListener('message', (event) => {
    if (event.data.type === 'SSO_SUCCESS') {
      console.log('[init] ✅ SSO 성공 - g_ck 획득:', event.data.gck.slice(0, 8) + '...');
      _ssoInProgress = false;

      // g_ck를 전역 변수에 저장 (background.js 없음)
      window._gck = event.data.gck;
      window._gckExpiry = Date.now() + 15 * 60 * 1000;
      console.log('[init] g_ck 저장 완료 - API 호출 준비됨');

      // 재연결 콜백이 있으면 실행
      if (_reconnectCallback) {
        const cb = _reconnectCallback;
        _reconnectCallback = null;
        cb(true);
      }

    } else if (event.data.type === 'SSO_FAILED') {
      console.error('[init] ❌ SSO 실패:', event.data.error);
      _ssoInProgress = false;

      // 재연결 콜백이 있으면 실행
      if (_reconnectCallback) {
        const cb = _reconnectCallback;
        _reconnectCallback = null;
        cb(false);
      }

      // 실패 시에만 경고 표시 (iframe이 자동으로 재시도하므로 30초 후)
      setTimeout(() => {
        if (!_ssoInProgress) {
          showSessionError(event.data.error);
        }
      }, 30000);
    }
  });

  function showSessionError(error) {
    let banner = document.getElementById('session-error-banner');
    if (!banner) {
      banner = document.createElement('div');
      banner.id = 'session-error-banner';
      banner.style.cssText = `
        position: fixed;
        top: 0;
        left: 0;
        right: 0;
        background: #f44336;
        color: #fff;
        padding: 12px;
        text-align: center;
        z-index: 9999;
        font-size: 14px;
      `;
      banner.innerHTML = `
        ⚠️ 자동 로그인 실패 - Safari에서 itsm.services.sap를 열어 수동 로그인하세요
        <button onclick="this.parentElement.remove(); location.reload();" style="margin-left: 12px; padding: 4px 12px; background: #fff; color: #000; border: none; border-radius: 4px; cursor: pointer;">재시도</button>
      `;
      document.body.prepend(banner);
    }
  }

  // 초기화: iframe이 자동으로 SSO 처리
  console.log('[init] SSO iframe이 백그라운드에서 세션 획득 중...');
  _ssoInProgress = true;

  // 30초 타임아웃 - 세션 획득 실패 시 자동 재시도
  setTimeout(() => {
    if (_ssoInProgress) {
      console.log('[init] ⏰ 30초 타임아웃 - iframe 재시작');
      window.retriggerSso(() => {
        console.log('[init] 타임아웃 후 재시도 완료');
      });
    }
  }, 30000);

})();
