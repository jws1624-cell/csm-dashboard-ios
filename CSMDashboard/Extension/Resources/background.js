'use strict';

// Safari Extension에서는 browser API 사용 (chrome도 호환성으로 지원)
const browserAPI = typeof browser !== 'undefined' ? browser : chrome;

const ITSM_BASE = 'https://itsm.services.sap';
const MCC_CATALOG_SYS_ID = 'fdac23381b5629105f03dcef9b4bcb7f';
const MCC_PORTAL_ID = '712616f01bc6295036ac10e69b4bcb80';

// ── g_ck 캐시 ─────────────────────────────────────────────────────────
let _gck = null;
let _gckExpiry = 0;

// 세션 확보 단계별 경과시간 로그 (어디서 지연되는지 파악용)
let _stageT0 = 0;
function stageStart() { _stageT0 = Date.now(); }
function tlog(msg) {
  const dt = _stageT0 ? `+${((Date.now() - _stageT0) / 1000).toFixed(1)}s` : '';
  console.log(`[bg ${dt}] ${msg}`);
}

async function getGck() {
  if (_gck && Date.now() < _gckExpiry) { tlog('g_ck 캐시 히트'); return _gck; }
  tlog('① login.do 요청 시작');
  let r;
  const t = Date.now();
  try {
    r = await fetch(`${ITSM_BASE}/login.do`, { credentials: 'include' });
  } catch (e) {
    throw new Error(`login.do fetch 실패: ${e.message}`);
  }
  tlog(`② login.do 응답 ${r.status} (${Date.now() - t}ms) ${r.url.slice(0, 50)}`);
  const html = await r.text();
  const m = html.match(/g_ck\s*=\s*['"]([^'"]+)['"]/);
  if (!m) {
    // 로그인 페이지로 리다이렉트된 경우
    const isLoginPage = html.includes('login') && html.includes('password');
    tlog(`③ g_ck 추출 실패 (로그인페이지=${isLoginPage})`);
    throw new Error(
      isLoginPage
        ? 'ITSM 세션 없음 — Safari에서 itsm.services.sap 탭을 열어 SSO 로그인 후 다시 시도하세요.'
        : `g_ck 추출 실패 (응답 ${r.status}, URL: ${r.url})`
    );
  }
  _gck = m[1];
  _gckExpiry = Date.now() + 15 * 60 * 1000;
  tlog('③ g_ck 획득 완료');
  return _gck;
}

// ── ITSM 세션 부트스트랩 ──────────────────────────────────────────────
let _bootstrapping = null;

function pushStatus(step) {
  browserAPI.runtime.sendMessage({ type: 'BOOTSTRAP_STATUS', step }).catch(() => {});
}

function bootstrapSession() {
  if (_bootstrapping) return _bootstrapping;
  _bootstrapping = new Promise(async (resolve) => {
    tlog('④ SSO 부트스트랩 시작');
    pushStatus('sso_start');

    // iOS Safari Extension은 탭 생성 불가 → 단순히 fetch로 재시도
    // Extension의 popup이 ITSM 도메인에서 실행되면 쿠키가 공유됨
    tlog('⑤ ITSM 세션 재확인 (fetch 재시도)');

    await new Promise(res => setTimeout(res, 1000)); // 1초 대기

    try {
      const r = await fetch(`${ITSM_BASE}/login.do`, { credentials: 'include' });
      const html = await r.text();
      const m = html.match(/g_ck\s*=\s*['"]([^'"]+)['"]/);

      if (m) {
        _gck = m[1];
        _gckExpiry = Date.now() + 15 * 60 * 1000;
        tlog('⑥ 부트스트랩 성공 — g_ck 획득');
        _bootstrapping = null;
        resolve(true);
        return;
      }
    } catch (e) {
      tlog(`⑥ 부트스트랩 실패: ${e.message}`);
    }

    tlog('⑥ 부트스트랩 실패 — 사용자가 Safari에서 ITSM에 로그인해야 함');
    _bootstrapping = null;
    resolve(false);
  });
  return _bootstrapping;
}

// ── ITSM GET ──────────────────────────────────────────────────────────
async function itsmGet(path, _retried = false) {
  if (!_retried) stageStart();
  let gck;
  try {
    gck = await getGck();
  } catch (e) {
    if (!_retried) {
      tlog(`g_ck 실패(${e.message.slice(0, 40)}) → 부트스트랩`);
      const ok = await bootstrapSession();
      if (ok) { await new Promise(res => setTimeout(res, 400)); return itsmGet(path, true); }
    }
    throw new Error('ITSM 세션 확보 실패 — Safari에서 SAP SSO 로그인 상태를 확인하세요.');
  }
  const t = Date.now();
  let r;
  try {
    r = await fetch(ITSM_BASE + path, {
      credentials: 'include',
      headers: { Accept: 'application/json', 'X-UserToken': gck }
    });
  } catch (e) {
    throw new Error(`ITSM fetch 네트워크 오류: ${e.message}`);
  }
  tlog(`REST ${r.status} (${Date.now() - t}ms) redirected=${r.redirected} type=${r.type} final=${(r.url || '').slice(0, 70)} req=${path.slice(0, 40)}`);
  if (r.status === 401) {
    _gck = null;
    if (!_retried) {
      tlog('REST 401 — SSO 부트스트랩 후 재시도');
      const ok = await bootstrapSession();
      if (ok) {
        await new Promise(res => setTimeout(res, 400));
        return itsmGet(path, true);
      }
    }
    throw new Error('ITSM 세션 확보 실패 — Safari에서 SAP SSO 로그인 상태를 확인하세요.');
  }
  if (r.status === 403) throw new Error('ITSM 403 — 권한 없음. ACL 확인 필요.');
  if (!r.ok) {
    const body = await r.text().catch(() => '');
    throw new Error(`ITSM ${r.status}: ${body.slice(0, 200)}`);
  }
  return r.json();
}

// ── ITSM PATCH ────────────────────────────────────────────────────────
async function itsmPatch(path, body) {
  const gck = await getGck();
  const r = await fetch(ITSM_BASE + path, {
    method: 'PATCH',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json', 'X-UserToken': gck },
    body: JSON.stringify(body)
  });
  if (r.status === 401) { _gck = null; throw new Error('ITSM 세션 만료'); }
  if (!r.ok) throw new Error(`ITSM PATCH ${r.status}`);
  return r.json();
}

// ── ITSM POST ─────────────────────────────────────────────────────────
async function itsmPost(path, body) {
  const gck = await getGck();
  const r = await fetch(ITSM_BASE + path, {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json', 'X-UserToken': gck },
    body: JSON.stringify(body)
  });
  if (r.status === 401) { _gck = null; throw new Error('ITSM 세션 만료'); }
  if (!r.ok) throw new Error(`ITSM POST ${r.status}`);
  return r.json();
}

// ── GlideAjax ─────────────────────────────────────────────────────────
async function glideAjax(params) {
  const gck = await getGck();
  const qs = new URLSearchParams({ ...params, sysparm_exclude_reference_link: 'true' });
  const r = await fetch(`${ITSM_BASE}/xmlhttp.do?${qs}`, {
    credentials: 'include',
    headers: { Accept: 'application/json', 'X-UserToken': gck }
  });
  if (!r.ok) throw new Error(`GlideAjax ${r.status}`);
  const text = await r.text();
  try { return JSON.parse(text); } catch { return text; }
}

// ── MCC 제출 ─────────────────────────────────────────────────────────
async function submitMccEscalation(caseSysId, caseNumber, fields, speedup, veryHigh, assignProcessor, accountSysId, priority) {
  const gck = await getGck();

  console.log('[bg] submitMccEscalation 호출 - accountSysId 전달값:', accountSysId, 'priority:', priority);

  let accSysId = accountSysId;
  if (!accSysId) {
    try {
      const r = await itsmGet(
        `/api/now/table/sn_customerservice_case?sysparm_query=number=${encodeURIComponent(caseNumber)}&sysparm_fields=account&sysparm_limit=1&sysparm_display_value=false`
      );
      const link = r?.result?.[0]?.account?.link || '';
      accSysId = link.split('/').pop() || '';
    } catch (e) {
      console.warn('[bg] accountSysId 조회 실패 (계속 진행):', e.message);
    }
  }

  try {
    const validation = await glideAjax({
      sysparm_processor: 'SAP_MCC_SOS_RP_Utils',
      sysparm_scope: 'x_sapda_mccsos_app',
      sysparm_name: 'validateFormOnSubmission',
      sysparm_account_id: accSysId || '',
      sysparm_escalation_type: 'CIM_TBE_Request',
      sysparm_u_escalation_solution_area: '1',
      sysparm_case: caseSysId,
      sysparm_cases: '',
      sysparm_is_this_a_business_down_situation: 'false',
    });
    console.log('[bg] MCC 검증 결과:', validation);
  } catch (e) {
    console.warn('[bg] MCC 검증 실패 (계속 진행):', e.message);
  }

  const itemGuid = crypto.randomUUID();
  const casePriority = (priority || '3').toString().charAt(0);
  const body = {
    sysparm_item_guid: itemGuid,
    variables: {
      u_escalation_type: 'CIM_TBE_Request',
      case_s: caseSysId,
      u_customer_3: accSysId || '',
      case_priority: casePriority,
      u_escalation_solution_area: '1',
      speed_up: speedup ? 'true' : 'false',
      assign_processor: assignProcessor ? 'true' : 'false',
      raise_priority_to_very_high: veryHigh ? 'true' : 'false',
      is_this_a_business_down_situation: 'false',
      expected_action: 'false',
      role_allowed: 'Yes',
      type_helper: '',
      case_list: '',
      request_description: '',
      for_more_information: '<p></p>\n<p></p>',
      affected_business_solution_and_system_landscape_of_customer: '',
      u_install_base_items: '',
      u_go_live_date: '',
      u_planned_close_date: '',
      u_planned_service_start_date: '',
      license_contract_subscription_volume_per_year: '',
      request_title: fields.title,
      business_impact: fields.businessImpact,
      affected_business_process: fields.affectedProcess,
      how_they_are_affected: fields.howAffected,
      upcoming: fields.dueDates,
      strategic_involvement: fields.strategicInvolvement,
      already_involved_parties: fields.involvedParties,
    },
    get_portal_messages: 'true',
    sysparm_no_validation: 'true',
    engagement_channel: 'sp',
    referrer: null
  };

  console.log('[bg] MCC 제출 페이로드:', JSON.stringify(body, null, 2));

  const r = await fetch(`${ITSM_BASE}/api/sn_sc/v1/servicecatalog/items/${MCC_CATALOG_SYS_ID}/submit_producer`, {
    method: 'POST',
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
      'X-UserToken': gck,
      'X-Transaction-Source': `Interface=Web,Interface-Name=MCCSOS,Interface-Type=Service Portal,Interface-SysID=${MCC_PORTAL_ID}`
    },
    body: JSON.stringify(body)
  });
  if (r.status === 401) { _gck = null; throw new Error('ITSM 세션 만료'); }
  if (!r.ok) {
    const txt = await r.text().catch(() => '');
    throw new Error(`MCC 제출 ${r.status}: ${txt.slice(0, 200)}`);
  }
  const result = await r.json();
  console.log('[bg] MCC 제출 응답:', JSON.stringify(result, null, 2));
  const ritm = result?.result?.number || result?.result?.sys_id || '';
  if (!ritm || ritm === '-1') {
    throw new Error(`MCC 제출 응답에 유효한 RITM 번호 없음: ${JSON.stringify(result)}`);
  }
  return ritm;
}

// ── 메시지 핸들러 ─────────────────────────────────────────────────────
browserAPI.runtime.onMessage.addListener((msg, _sender, sendResponse) => {

  // iframe SSO에서 g_ck 받아서 캐시에 저장
  if (msg.type === 'SET_GCK') {
    _gck = msg.gck;
    _gckExpiry = Date.now() + 15 * 60 * 1000;
    tlog(`[SET_GCK] iframe으로부터 g_ck 수신: ${_gck.slice(0, 8)}...`);
    sendResponse({ ok: true });
    return false;
  }

  // sidepanel에서 세션 무효화 요청 (재인증 트리거)
  if (msg.type === 'INVALIDATE_SESSION') {
    tlog('[INVALIDATE_SESSION] g_ck 캐시 무효화');
    _gck = null;
    _gckExpiry = 0;
    _bootstrapping = null;
    sendResponse({ ok: true });
    return false;
  }

  if (msg.type === 'ITSM_QUERY') {
    const { path } = msg;
    const patchIdx = path.indexOf('__PATCH__');
    if (patchIdx >= 0) {
      const apiPath = path.slice(0, patchIdx);
      const bodyStr = path.slice(patchIdx + 9);
      itsmPatch(apiPath, JSON.parse(bodyStr))
        .then(data => sendResponse({ ok: true, data }))
        .catch(e => { console.error('[bg] PATCH 오류:', e); sendResponse({ ok: false, error: e.message }); });
    } else {
      itsmGet(path)
        .then(data => sendResponse({ ok: true, data }))
        .catch(e => { console.error('[bg] GET 오류:', e); sendResponse({ ok: false, error: e.message }); });
    }
    return true;
  }

  if (msg.type === 'MCC_SUBMIT') {
    const { caseSysId, caseNumber, fields, speedup, veryHigh, assignProcessor, accountSysId, priority } = msg;
    submitMccEscalation(caseSysId, caseNumber, fields, speedup, veryHigh, assignProcessor, accountSysId, priority)
      .then(ritm => sendResponse({ ok: true, ritm }))
      .catch(e => { console.error('[bg] MCC 오류:', e); sendResponse({ ok: false, error: e.message }); });
    return true;
  }

  if (msg.type === 'ITSM_UPLOAD') {
    const { sysId, fileName, contentType, base64 } = msg;
    (async () => {
      const gck = await getGck();
      const binary = atob(base64);
      const bytes = new Uint8Array(binary.length);
      for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
      const blob = new Blob([bytes], { type: contentType });
      const form = new FormData();
      form.append('table_name', 'sn_customerservice_case');
      form.append('table_sys_id', sysId);
      form.append('uploadFile', blob, fileName);
      const r = await fetch(`${ITSM_BASE}/api/now/attachment/upload`, {
        method: 'POST',
        credentials: 'include',
        headers: { Accept: 'application/json', 'X-UserToken': gck },
        body: form
      });
      if (r.status === 401) { _gck = null; throw new Error('ITSM 세션 만료'); }
      if (!r.ok) { const t = await r.text().catch(() => ''); throw new Error(`업로드 ${r.status}: ${t.slice(0,200)}`); }
      return r.json();
    })()
      .then(data => sendResponse({ ok: true, data }))
      .catch(e => { console.error('[bg] 업로드 오류:', e); sendResponse({ ok: false, error: e.message }); });
    return true;
  }

  if (msg.type === 'PING') {
    sendResponse({ ok: true });
    return false;
  }

  if (msg.type === 'DIAG') {
    (async () => {
      try {
        const body = await itsmGet('/api/now/table/sn_customerservice_case?sysparm_limit=1&sysparm_fields=number');
        sendResponse({
          ok: true,
          gck: (_gck ? _gck.slice(0, 8) + '…' : '(재추출)'),
          sample: body?.result?.[0]?.number || '(없음)'
        });
      } catch (e) {
        sendResponse({ ok: false, error: e.message });
      }
    })();
    return true;
  }
});
