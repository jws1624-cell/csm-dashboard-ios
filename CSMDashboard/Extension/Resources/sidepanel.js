'use strict';

console.log('🔵 sidepanel.js 로드됨 - 버전: 2026-10-14-v8-auto');

// 로드 시 선제 ITSM 세션 체크는 하지 않는다. ONE360로 시작했는데도 current_user를
// 때려 ensureSession('itsm')→500ms×90초 폴링(sys_user 401 난사)에 빠지던 원인이었다.
// ITSM 세션은 사용자가 실제 ITSM 조회(doSearch→Case)를 할 때 itsmFetch가 lazy 확보한다.

// Safari Extension 호환성 레이어
const browserAPI = typeof browser !== 'undefined' ? browser : chrome;

// ── 상수 ─────────────────────────────────────────────────────────────
const ITSM_BASE = 'https://itsm.services.sap';
const DEFAULT_AI_BASE = 'https://csm-case-dashboard.cfapps.ap12.hana.ondemand.com';
const MCC_CATALOG_SYS_ID = 'fdac23381b5629105f03dcef9b4bcb7f';
const MCC_PORTAL_ID = '712616f01bc6295036ac10e69b4bcb80';

const COMPONENTS = {
  BDC: ['BDC-', 'DS-', 'LOD-ANA', 'HAN-CLS', 'CA-ML-AIC', 'CA-ML-AILP'],
  BTP: ['BC-CP', 'BC-AI', 'CA-BAS', 'EP-WZ', 'CA-LCA', 'BPI-PA', 'BPI-SIG',
        'MOB-CLD', 'MOB-MBT', 'MOB-SDK-IOS', 'MOB-SDK-ADR', 'CA-ML-IPA', 'CA-JOULE']
};

const DEFAULT_OWNERS = [
  { key: 'musig',    name: 'Musig Kim',     ids: ['1132804','50252316','1160926','7159632','1111210','1204702'] },
  { key: 'lena',     name: 'Lena Kim',      ids: ['163611','1246058','12893127','1165964','1099120'] },
  { key: 'woosuk',   name: 'WooSuk Jung',   ids: ['163611','1219179','1099120','50031003','1234020','1204702','50503273','1225691'] },
  { key: 'minju',    name: 'Minju Kim',     ids: ['50252316','1233326','1132266','207184','1118974'] },
  { key: 'jeongkyu', name: 'Jeongkyu Choi', ids: ['1132804','164813','1165964','17753797'] }
];

// ── 런타임 설정 (browserAPI.storage에서 로드, 없으면 기본값) ──────────────
let _owners = DEFAULT_OWNERS;
let _aiBase = DEFAULT_AI_BASE;

function getAiInsightUrl() { return `${_aiBase}/api/ai/insight`; }
function getMccGenerateUrl() { return `${_aiBase}/api/mcc/generate`; }
function getRetrieveCaseUrl() { return `${_aiBase}/api/itsm/retrieve-case`; }

// ── i18n ─────────────────────────────────────────────────────────────
const STRINGS = {
  ko: {
    searchPlaceholder: '고객사 / 케이스 번호 검색…',
    period1m: '1개월', period3m: '3개월', period6m: '6개월',
    search: '조회', tabAll: '전체', tabNotifications: '🔔 Notifications',
    settingsLanguage: '언어', settingsTheme: '테마',
    settingsStartTab: '시작 탭', settingsFavBackup: 'Favourite 백업',
    favExport: '⬆ 내보내기', favImport: '⬇ 불러오기',
    noCases: '케이스가 없습니다.', noAccounts: '고객사가 없습니다.',
    account: '고객사', assignedTo: '담당자', createdOn: '생성일',
    relatedLinks: '관련 링크', noRelatedLinks: '관련 Jira/INC 없음',
    aiAnalyze: '✨ AI 분석', aiAnalyzing: '분석 중…',
    aiAutoRun: '케이스를 선택하면 AI 분석이 자동 실행됩니다.',
    aiCustomerInquiry: '고객 질의', aiCurrentState: '현재 상황·진행', aiRequiredAction: '필요 액션',
    copyForEmail: ' 전체 복사 (고객 메일용)',
    copyTimeline: ' 타임라인 복사',
    addMemo: '메모 추가', add: '추가',
    memoInternal: 'Internal memo — ITSM 내부에만 표시 (고객 미공개)',
    memoExternal: 'External memo — 고객에게 공개됩니다.',
    memoPlaceholder: '메모 내용을 입력하세요…',
    timelineLoading: '타임라인 로드 중…',
    timelineEmpty: 'AI 분석을 실행하면 진행 타임라인이 표시됩니다.',
    selectFile: '파일 선택', upload: '업로드',
    watchNoOne: 'Watch 중인 사람이 없습니다.',
    watchAdding: '+ 추가', watchViewing: '👁 보는 중',
    watchSearch: '이름 또는 이메일 검색…',
    noAccount: '고객사를 찾을 수 없습니다',
    noMappedAccount: '매핑된 고객사가 없습니다. korea-accounts.json을 확인하세요.',
    selectStatus: 'Status를 하나 이상 선택하세요.',
    aiError: 'AI 분석 실패', copied: '클립보드에 복사되었습니다.',
    memoAdded: '메모가 추가되었습니다.',
    memoFailed: '메모 저장 실패',
    mccAlreadyEscalated: '은(는) 이미 MCC 에스컬레이션이 등록되어 있습니다.',
    mccGenerating: 'AI가 에스컬레이션 내용을 생성 중…',
    mccExpectedAction: 'Expected Action',
    mccCancel: '취소', mccSubmit: '⚡ 제출', mccSubmitting: '제출 중…',
    mccSuccess: 'MCC Escalation 제출 완료', mccFailed: '제출 실패',
    mccUnknownError: '알 수 없는 오류',
    watchMe: '나', tlViewFull: '전체 원문은 ServiceNow에서 보기 →',
    sourceEntryLabel: '최근 회신 원문',
    watchAdding2: '추가 중…', watchFailed: '검색 실패',
    favEmpty: '즐겨찾기가 없습니다.', favEmptyHint: '고객사 또는 케이스의 ⭐ 버튼을 눌러 추가하세요.',
    favSectionAccount: '고객사', favSectionCase: '케이스',
    favRemove: 'Favourite 해제', favAdd: 'Favourite 추가',
    favUndo: '다시 클릭하면 취소',
    watchUpdateFailed: 'Watch list 업데이트 실패',
    loginError: 'ITSM 로그인 정보를 확인할 수 없습니다.',
    caseFetchFailed: '케이스 조회 실패',
    searchNoResult: '검색 결과 없음',
    itsmFetchFailed: 'ITSM 조회 실패',
    itsmPartialFail: '⚠️ 일부 실패',
    itsmFetching: 'ITSM 조회 중…',
    itsmError: '조회 중 오류 발생',
    timelineLoadFailed: '타임라인 로드 실패',
    kbaLabel: 'KBA',
    watchRemove: '제거',
    watchSearching: '검색 중…',
    watchNoResult: '검색 결과 없음',
    watchAddBtn: '+ 추가',
    ssoStart: 'SSO 인증 중…',
    ssoIdp: 'SAP SSO 인증 중…',
    itsmReturn: 'ITSM 세션 확립 중…',
    favImportInvalid: '올바른 Favourite 백업 파일이 아닙니다.',
    favImportDone: '복원 완료',
    favImportAdded: '건 추가됨 (총',
    favImportTotal: '건)',
    favImportError: '파일 읽기 오류',
    uploadProgress: '업로드 중…',
    uploadFailed: '업로드 실패',
    fileReadFailed: '파일 읽기 실패',
    notifChecking: '변경사항 확인 중…',
    notifEmpty: '새로운 알림이 없습니다.',
    notifTitle: '케이스 업데이트',
    notifClearAll: 'Clear All',
    notifTypeState: '상태 변경',
    notifTypeJournal: '저널 업데이트',
    notifTypePriority: '우선순위 변경',
    filesCount: '개 파일',
    copied2: '✅ 복사됨',
    caseLabel: '케이스',
    titleLabel: '제목',
    statusPriorityLabel: '상태/우선순위',
    incLabel: '관련 INC',
    timeAgoMins: '분 전',
    timeAgoHours: '시간 전',
    timeAgoDays: '일 전',
    timeAgoMonths: '개월 전',
    actorCustomer: '고객',
    actorBoth: '양측',
    copyCustomerInquiry: '[고객 질의]',
    copyCurrentState: '[현재 상황·진행]',
    copyRequiredAction: '[필요 액션]',
    copyTimeline2: '[진행 타임라인]',
    caseSearchLabel: '🔍 케이스 검색',
    caseSearchHint: 'ITSM 케이스 번호로 조회',
    searchDirectLabel: '검색',
    searchDirectHint: '케이스 번호로 조회',
    searchUnifiedLabel: '통합 검색',
    searchUnifiedHint: '고객사 + 케이스 함께 조회',
    searchSectionAccount: '🏢 고객사',
    searchSectionCase: '📋 케이스',
    crmIdNotFound: '에 해당하는 고객사명을 찾을 수 없습니다.',
    retry: '재시도',
    aiServerError: 'AI 서버 오류',
    bcpDesc: 'SAP 백엔드 인시던트(BCP) — 근본원인 티켓',
    copyLink: '링크 복사',
  },
  en: {
    searchPlaceholder: 'Account / Case number search…',
    period1m: '1 Month', period3m: '3 Months', period6m: '6 Months',
    search: 'Search', tabAll: 'All', tabNotifications: '🔔 Notifications',
    settingsLanguage: 'Language', settingsTheme: 'Theme',
    settingsStartTab: 'Start Tab', settingsFavBackup: 'Favourite Backup',
    favExport: '⬆ Export', favImport: '⬇ Import',
    noCases: 'No cases found.', noAccounts: 'No accounts.',
    account: 'Account', assignedTo: 'Assigned To', createdOn: 'Created On',
    relatedLinks: 'Related Links', noRelatedLinks: 'No related Jira/INC',
    aiAnalyze: '✨ AI Analyze', aiAnalyzing: 'Analyzing…',
    aiAutoRun: 'Select a case to auto-run AI analysis.',
    aiCustomerInquiry: 'Customer Inquiry', aiCurrentState: 'Current State', aiRequiredAction: 'Required Action',
    copyForEmail: ' Copy all (for customer email)',
    copyTimeline: ' Copy Timeline',
    addMemo: 'Add Memo', add: 'Add',
    memoInternal: 'Internal memo — visible inside ITSM only (not shown to customer)',
    memoExternal: 'External memo — visible to the customer.',
    memoPlaceholder: 'Enter memo content…',
    timelineLoading: 'Loading timeline…',
    timelineEmpty: 'Run AI analysis to show the progress timeline.',
    selectFile: 'Select File', upload: 'Upload',
    watchNoOne: 'No one is watching.',
    watchAdding: '+ Add', watchViewing: '👁 Watching',
    watchSearch: 'Search by name or email…',
    noAccount: 'Account not found',
    noMappedAccount: 'No mapped accounts. Check korea-accounts.json.',
    selectStatus: 'Please select at least one Status.',
    aiError: 'AI analysis failed', copied: 'Copied to clipboard.',
    memoAdded: 'Memo added.',
    memoFailed: 'Failed to save memo',
    mccAlreadyEscalated: 'already has an active MCC escalation.',
    mccGenerating: 'AI is generating escalation content…',
    mccExpectedAction: 'Expected Action',
    mccCancel: 'Cancel', mccSubmit: '⚡ Submit', mccSubmitting: 'Submitting…',
    mccSuccess: 'MCC Escalation submitted', mccFailed: 'Submit failed',
    mccUnknownError: 'Unknown error',
    watchMe: 'Me', tlViewFull: 'View full log in ServiceNow →',
    sourceEntryLabel: 'Latest entry (raw)',
    watchAdding2: 'Adding…', watchFailed: 'Search failed',
    favEmpty: 'No favourites yet.', favEmptyHint: 'Press ⭐ on an account or case to add.',
    favSectionAccount: 'Accounts', favSectionCase: 'Cases',
    favRemove: 'Remove favourite', favAdd: 'Add favourite',
    favUndo: 'Click again to undo',
    watchUpdateFailed: 'Failed to update watch list',
    loginError: 'Could not verify ITSM login.',
    caseFetchFailed: 'Failed to fetch case',
    searchNoResult: 'No results for',
    itsmFetchFailed: 'ITSM fetch failed',
    itsmPartialFail: '⚠️ Partial failure',
    itsmFetching: 'Fetching from ITSM…',
    itsmError: 'Error during fetch',
    timelineLoadFailed: 'Timeline load failed',
    kbaLabel: 'KBA',
    watchRemove: 'Remove',
    watchSearching: 'Searching…',
    watchNoResult: 'No results',
    watchAddBtn: '+ Add',
    ssoStart: 'Starting SSO…',
    ssoIdp: 'SAP SSO authentication…',
    itsmReturn: 'Establishing ITSM session…',
    favImportInvalid: 'Not a valid Favourite backup file.',
    favImportDone: 'Restored',
    favImportAdded: 'added (total',
    favImportTotal: ')',
    favImportError: 'File read error',
    uploadProgress: 'Uploading…',
    uploadFailed: 'Upload failed',
    fileReadFailed: 'File read failed',
    notifChecking: 'Checking updates…',
    notifEmpty: 'No new notifications.',
    notifTitle: 'Case Updates',
    notifClearAll: 'Clear All',
    notifTypeState: 'State Changed',
    notifTypeJournal: 'Journal Updated',
    notifTypePriority: 'Priority Changed',
    filesCount: ' files',
    copied2: '✅ Copied',
    caseLabel: 'Case',
    titleLabel: 'Title',
    statusPriorityLabel: 'Status/Priority',
    incLabel: 'Related INC',
    timeAgoMins: 'm ago',
    timeAgoHours: 'h ago',
    timeAgoDays: 'd ago',
    timeAgoMonths: 'mo ago',
    actorCustomer: 'Customer',
    actorBoth: 'Both',
    copyCustomerInquiry: '[Customer Inquiry]',
    copyCurrentState: '[Current State]',
    copyRequiredAction: '[Required Action]',
    copyTimeline2: '[Progress Timeline]',
    caseSearchLabel: '🔍 Case search',
    caseSearchHint: 'Search by ITSM case number',
    searchDirectLabel: 'Search',
    searchDirectHint: 'Search by case number',
    searchUnifiedLabel: 'Unified Search',
    searchUnifiedHint: 'Search accounts + cases together',
    searchSectionAccount: '🏢 Account',
    searchSectionCase: '📋 Case',
    crmIdNotFound: 'No account name found for CRM ID',
    retry: 'Retry',
    aiServerError: 'AI server error',
    bcpDesc: 'SAP Backend Incident (BCP) — root cause ticket',
    copyLink: 'Copy link',
  },
  zh: {
    searchPlaceholder: '搜索客户 / 案例编号…',
    period1m: '1个月', period3m: '3个月', period6m: '6个月',
    search: '查询', tabAll: '全部', tabNotifications: '🔔 通知',
    settingsLanguage: '语言', settingsTheme: '主题',
    settingsStartTab: '起始标签', settingsFavBackup: '收藏备份',
    favExport: '⬆ 导出', favImport: '⬇ 导入',
    noCases: '没有案例。', noAccounts: '没有客户。',
    account: '客户', assignedTo: '负责人', createdOn: '创建日期',
    relatedLinks: '相关链接', noRelatedLinks: '无相关 Jira/INC',
    aiAnalyze: '✨ AI 分析', aiAnalyzing: '分析中…',
    aiAutoRun: '选择案例后自动运行 AI 分析。',
    aiCustomerInquiry: '客户询问', aiCurrentState: '当前状态', aiRequiredAction: '所需操作',
    copyForEmail: ' 全部复制（客户邮件用）',
    copyTimeline: ' 复制时间线',
    addMemo: '添加备注', add: '添加',
    memoInternal: '内部备注 — 仅在 ITSM 内部显示（客户不可见）',
    memoExternal: '外部备注 — 客户可见。',
    memoPlaceholder: '输入备注内容…',
    timelineLoading: '加载时间线中…',
    timelineEmpty: '运行 AI 分析以显示进度时间线。',
    selectFile: '选择文件', upload: '上传',
    watchNoOne: '没有人在关注。',
    watchAdding: '+ 添加', watchViewing: '👁 关注中',
    watchSearch: '按姓名或邮箱搜索…',
    noAccount: '找不到客户',
    noMappedAccount: '没有映射的客户。请检查 korea-accounts.json。',
    selectStatus: '请至少选择一个状态。',
    aiError: 'AI 分析失败', copied: '已复制到剪贴板。',
    memoAdded: '备注已添加。',
    memoFailed: '备注保存失败',
    mccAlreadyEscalated: '已存在 MCC 升级。',
    mccGenerating: 'AI 正在生成升级内容…',
    mccExpectedAction: 'Expected Action',
    mccCancel: '取消', mccSubmit: '⚡ 提交', mccSubmitting: '提交中…',
    mccSuccess: 'MCC Escalation 提交完成', mccFailed: '提交失败',
    mccUnknownError: '未知错误',
    watchMe: '我', tlViewFull: '在 ServiceNow 中查看完整记录 →',
    sourceEntryLabel: '最新条目（原文）',
    watchAdding2: '添加中…', watchFailed: '搜索失败',
    favEmpty: '暂无收藏。', favEmptyHint: '点击客户或案例上的 ⭐ 按钮添加。',
    favSectionAccount: '客户', favSectionCase: '案例',
    favRemove: '取消收藏', favAdd: '添加收藏',
    favUndo: '再次点击可撤销',
    watchUpdateFailed: 'Watch list 更新失败',
    loginError: '无法验证 ITSM 登录。',
    caseFetchFailed: '案例获取失败',
    searchNoResult: '无结果',
    itsmFetchFailed: 'ITSM 获取失败',
    itsmPartialFail: '⚠️ 部分失败',
    itsmFetching: '正在从 ITSM 获取…',
    itsmError: '获取出错',
    timelineLoadFailed: '时间线加载失败',
    kbaLabel: 'KBA',
    watchRemove: '移除',
    watchSearching: '搜索中…',
    watchNoResult: '无结果',
    watchAddBtn: '+ 添加',
    ssoStart: 'SSO 认证中…',
    ssoIdp: 'SAP SSO 认证中…',
    itsmReturn: '正在建立 ITSM 会话…',
    favImportInvalid: '不是有效的收藏备份文件。',
    favImportDone: '已恢复',
    favImportAdded: '条已添加（共',
    favImportTotal: '条）',
    favImportError: '文件读取错误',
    uploadProgress: '上传中…',
    uploadFailed: '上传失败',
    fileReadFailed: '文件读取失败',
    notifChecking: '检查更新中…',
    notifEmpty: '没有新通知。',
    notifTitle: '案例更新',
    notifClearAll: '全部清除',
    notifTypeState: '状态变更',
    notifTypeJournal: '日志更新',
    notifTypePriority: '优先级变更',
    filesCount: ' 个文件',
    copied2: '✅ 已复制',
    caseLabel: '案例',
    titleLabel: '标题',
    statusPriorityLabel: '状态/优先级',
    incLabel: '关联 INC',
    timeAgoMins: '分钟前',
    timeAgoHours: '小时前',
    timeAgoDays: '天前',
    timeAgoMonths: '个月前',
    actorCustomer: '客户',
    actorBoth: '双方',
    copyCustomerInquiry: '[客户询问]',
    copyCurrentState: '[当前状态]',
    copyRequiredAction: '[所需操作]',
    copyTimeline2: '[进展时间线]',
    caseSearchLabel: '🔍 案例搜索',
    caseSearchHint: '按 ITSM 案例编号查询',
    searchDirectLabel: '搜索',
    searchDirectHint: '按案例编号查询',
    searchUnifiedLabel: '综合搜索',
    searchUnifiedHint: '同时搜索客户和案例',
    searchSectionAccount: '🏢 客户',
    searchSectionCase: '📋 案例',
    crmIdNotFound: '找不到对应的客户名称，CRM ID：',
    retry: '重试',
    aiServerError: 'AI 服务器错误',
    bcpDesc: 'SAP 后端事件 (BCP) — 根本原因工单',
    copyLink: '复制链接',
  },
  ja: {
    searchPlaceholder: '顧客 / ケース番号で検索…',
    period1m: '1ヶ月', period3m: '3ヶ月', period6m: '6ヶ月',
    search: '検索', tabAll: 'すべて', tabNotifications: '🔔 通知',
    settingsLanguage: '言語', settingsTheme: 'テーマ',
    settingsStartTab: '開始タブ', settingsFavBackup: 'お気に入りバックアップ',
    favExport: '⬆ エクスポート', favImport: '⬇ インポート',
    noCases: 'ケースがありません。', noAccounts: '顧客がありません。',
    account: '顧客', assignedTo: '担当者', createdOn: '作成日',
    relatedLinks: '関連リンク', noRelatedLinks: '関連 Jira/INC なし',
    aiAnalyze: '✨ AI 分析', aiAnalyzing: '分析中…',
    aiAutoRun: 'ケースを選択すると AI 分析が自動実行されます。',
    aiCustomerInquiry: 'お客様のお問い合わせ', aiCurrentState: '現在の状況', aiRequiredAction: '必要なアクション',
    copyForEmail: ' 全てコピー（顧客メール用）',
    copyTimeline: ' タイムラインをコピー',
    addMemo: 'メモ追加', add: '追加',
    memoInternal: '内部メモ — ITSM 内部のみ表示（顧客には非公開）',
    memoExternal: '外部メモ — 顧客に公開されます。',
    memoPlaceholder: 'メモ内容を入力してください…',
    timelineLoading: 'タイムライン読み込み中…',
    timelineEmpty: 'AI 分析を実行すると進行タイムラインが表示されます。',
    selectFile: 'ファイル選択', upload: 'アップロード',
    watchNoOne: 'ウォッチしている人はいません。',
    watchAdding: '+ 追加', watchViewing: '👁 ウォッチ中',
    watchSearch: '名前またはメールで検索…',
    noAccount: '顧客が見つかりません',
    noMappedAccount: 'マッピングされた顧客がありません。korea-accounts.json を確認してください。',
    selectStatus: 'Status を1つ以上選択してください。',
    aiError: 'AI 分析失敗', copied: 'クリップボードにコピーしました。',
    memoAdded: 'メモが追加されました。',
    memoFailed: 'メモの保存に失敗しました',
    mccAlreadyEscalated: 'にはすでに MCC エスカレーションが登録されています。',
    mccGenerating: 'AI がエスカレーション内容を生成中…',
    mccExpectedAction: 'Expected Action',
    mccCancel: 'キャンセル', mccSubmit: '⚡ 送信', mccSubmitting: '送信中…',
    mccSuccess: 'MCC Escalation 送信完了', mccFailed: '送信失敗',
    mccUnknownError: '不明なエラー',
    watchMe: '自分', tlViewFull: 'ServiceNow で全文を見る →',
    sourceEntryLabel: '最新エントリ（原文）',
    watchAdding2: '追加中…', watchFailed: '検索失敗',
    favEmpty: 'お気に入りがありません。', favEmptyHint: '顧客またはケースの ⭐ を押して追加してください。',
    favSectionAccount: '顧客', favSectionCase: 'ケース',
    favRemove: 'お気に入り解除', favAdd: 'お気に入り追加',
    favUndo: 'もう一度クリックでキャンセル',
    watchUpdateFailed: 'Watch list の更新に失敗しました',
    loginError: 'ITSM ログイン情報を確認できません。',
    caseFetchFailed: 'ケースの取得に失敗しました',
    searchNoResult: '結果なし',
    itsmFetchFailed: 'ITSM 取得失敗',
    itsmPartialFail: '⚠️ 一部失敗',
    itsmFetching: 'ITSM から取得中…',
    itsmError: '取得中にエラー',
    timelineLoadFailed: 'タイムライン読み込み失敗',
    kbaLabel: 'KBA',
    watchRemove: '削除',
    watchSearching: '検索中…',
    watchNoResult: '結果なし',
    watchAddBtn: '+ 追加',
    ssoStart: 'SSO 認証中…',
    ssoIdp: 'SAP SSO 認証中…',
    itsmReturn: 'ITSM セッション確立中…',
    favImportInvalid: '有効なお気に入りバックアップファイルではありません。',
    favImportDone: '復元完了',
    favImportAdded: '件追加されました（合計',
    favImportTotal: '件）',
    favImportError: 'ファイル読み込みエラー',
    uploadProgress: 'アップロード中…',
    uploadFailed: 'アップロード失敗',
    fileReadFailed: 'ファイル読み込み失敗',
    notifChecking: '更新確認中…',
    notifEmpty: '新しい通知はありません。',
    notifTitle: 'ケース更新',
    notifClearAll: 'すべてクリア',
    notifTypeState: 'ステータス変更',
    notifTypeJournal: 'ジャーナル更新',
    notifTypePriority: '優先度変更',
    filesCount: ' 件のファイル',
    copied2: '✅ コピー済み',
    caseLabel: 'ケース',
    titleLabel: 'タイトル',
    statusPriorityLabel: 'ステータス/優先度',
    incLabel: '関連 INC',
    timeAgoMins: '分前',
    timeAgoHours: '時間前',
    timeAgoDays: '日前',
    timeAgoMonths: 'ヶ月前',
    actorCustomer: 'お客様',
    actorBoth: '双方',
    copyCustomerInquiry: '[お客様のお問い合わせ]',
    copyCurrentState: '[現在の状況]',
    copyRequiredAction: '[必要なアクション]',
    copyTimeline2: '[進行タイムライン]',
    caseSearchLabel: '🔍 ケース検索',
    caseSearchHint: 'ITSM ケース番号で検索',
    searchDirectLabel: '検索',
    searchDirectHint: 'ケース番号で検索',
    searchUnifiedLabel: '統合検索',
    searchUnifiedHint: '顧客とケースをまとめて検索',
    searchSectionAccount: '🏢 顧客',
    searchSectionCase: '📋 ケース',
    crmIdNotFound: 'CRM ID に該当する顧客名が見つかりません',
    retry: '再試行',
    aiServerError: 'AI サーバーエラー',
    bcpDesc: 'SAP バックエンドインシデント (BCP) — 根本原因チケット',
    copyLink: 'リンクをコピー',
  }
};

let _uiLang = 'ko';

function t(key) {
  return (STRINGS[_uiLang] || STRINGS.ko)[key] || STRINGS.ko[key] || key;
}

function applyI18n() {
  document.querySelectorAll('[data-i18n]').forEach(el => {
    el.textContent = t(el.dataset.i18n);
  });
  document.querySelectorAll('[data-i18n-placeholder]').forEach(el => {
    el.placeholder = t(el.dataset.i18nPlaceholder);
  });
}

function detectBrowserLang() {
  const lang = (navigator.language || 'ko').toLowerCase();
  if (lang.startsWith('ko')) return 'ko';
  if (lang.startsWith('zh')) return 'zh';
  if (lang.startsWith('ja')) return 'ja';
  return 'en';
}


let koreaAccounts = null;
let selectedOwnerKey = 'all';
let currentCases = [];
let selectedCase = null;
let myUserId = null;       // ITSM 로그인 사용자 sys_id
let myUserName = null;     // 표시용
let myEmail = null;        // watch_list 등록용
let _lastTargets = null;    // 마지막 조회 타겟([{crmId,name}]) — status 필터 변경 시 재조회용
// ── ONE360 고객사 상세 상태 (Chrome 원본에서 포팅) ──
let _selectedAccount = null;   // 선택된 단일 고객사 {crmId, name}. 복수 조회 시 null → 상세 탭 숨김
let _accountDetailTab = 'cases'; // 'contract' | 'cacv' | 'consumption' | 'cases'
// ONE360 raw 캐시 — 고객 선택 시 BDC+BTP 전체를 1회만 받아두고,
// SA 필터(BDC/BTP/Other) 변경은 서버 재조회 없이 클라이언트 필터링으로 처리.
// 구조: { rows, accountId, (guId,) crmId } / 로드 안 됐으면 null
let _contractAll = null;
let _cacvAll = null;
let _consumptionAll = null;
let _rawCases = [];         // 컴포넌트 필터 적용 전 원본 케이스 — comp 필터 변경 시 클라 재필터용
let _lastQuery = null;      // 마지막 검색 쿼리 — 재시도용
let _lastAiInsight = null;  // 마지막 AI 구조화 결과(전체 복사용)
let _lastAiLang = null;     // _lastAiInsight를 생성한 언어 — 언어 변경 시 재실행 판단용
let _memoType = 'internal'; // 'internal' | 'external'
let _favourites = [];       // [{crmId, name}] — browserAPI.storage.local 로드 후 채워짐
let _seenCaseStates = {};   // { [sys_id]: state_code } — 마지막으로 클릭해서 읽은 상태

// ── 케이스 상태 변경 추적 ──────────────────────────────────────────
function loadSeenStates() {
  browserAPI.storage.local.get('seenCaseStates', d => {
    _seenCaseStates = d.seenCaseStates || {};
  });
}

function markCaseSeen(sysId, stateCode) {
  _seenCaseStates[sysId] = stateCode;
  try { browserAPI.storage.local.set({ seenCaseStates: _seenCaseStates }); } catch(e) { console.warn("[CSM] Storage quota exceeded:", e); }
}

function isCaseStateChanged(sysId, currentCode) {
  if (!(sysId in _seenCaseStates)) return false; // 한 번도 안 읽은 케이스는 표시 안 함
  return _seenCaseStates[sysId] !== String(currentCode);
}

// ── Favourite 관리 ────────────────────────────────────────────────
async function loadFavourites() {
  return new Promise(resolve => {
    browserAPI.storage.local.get('favourites', data => {
      _favourites = Array.isArray(data.favourites) ? data.favourites : [];
      resolve(_favourites);
    });
  });
}

function saveFavourites() {
  try { browserAPI.storage.local.set({ favourites: _favourites }); } catch(e) { console.warn("[CSM] Storage quota exceeded:", e); }
}

function isFavourite(crmId) {
  return _favourites.some(f => f.type !== 'case' && String(f.crmId) === String(crmId));
}

function addFavourite(crmId, name) {
  if (isFavourite(crmId)) return;
  _favourites.push({ type: 'account', crmId: String(crmId), name });
  saveFavourites();
}

function removeFavourite(crmId) {
  _favourites = _favourites.filter(f => !(f.type !== 'case' && String(f.crmId) === String(crmId)));
  saveFavourites();
}

function isFavouriteCase(sysId) {
  return _favourites.some(f => f.type === 'case' && f.sysId === sysId);
}

async function addFavouriteCase(c) {
  if (isFavouriteCase(c.sys_id)) return;
  _favourites.push({ type: 'case', sysId: c.sys_id, number: c.number, title: c.short_description, account: c.account, correlation_display: c.correlation_display || '', state: c.state || '', state_code: c.state_code || '', priority: c.priority || '', priority_code: c.priority_code || '', u_app_component: c.u_app_component || '' });
  saveFavourites();

  // 3. Favourite 추가 시 즉시 lastState 저장
  const journal = c._journal || '';
  const { lastState } = await browserAPI.storage.local.get('lastState') || {};
  const state = lastState || {};
  state[c.number] = {
    state: c.state,
    priority: c.priority,
    journal: journal,
    updatedAt: new Date().toISOString()
  };
  try { await browserAPI.storage.local.set({ lastState: state }); } catch(e) { console.warn("[CSM] Storage quota exceeded:", e); }
}

async function removeFavouriteCase(sysId) {
  const removed = _favourites.find(f => f.type === 'case' && f.sysId === sysId);
  _favourites = _favourites.filter(f => !(f.type === 'case' && f.sysId === sysId));
  saveFavourites();

  // Favourite 제거 시 lastState에서도 삭제
  if (removed) {
    const { lastState } = await browserAPI.storage.local.get('lastState') || {};
    const state = lastState || {};
    delete state[removed.number];
    try { await browserAPI.storage.local.set({ lastState: state }); } catch(e) { console.warn("[CSM] Storage quota exceeded:", e); }
  }
}

function updateFavCaseBtn() {
  const btn = document.getElementById('btnFavCase');
  if (!btn || !selectedCase) return;
  const fav = isFavouriteCase(selectedCase.sys_id);
  btn.textContent = fav ? '⭐' : '☆';
  btn.classList.toggle('active', fav);
}

function updateFavouriteBtn() {
  const btn = document.getElementById('btnAddFavourite');
  if (!btn) return;
  if (!_lastTargets || _lastTargets.length !== 1) { btn.classList.add('hidden'); return; }
  const { crmId } = _lastTargets[0];
  btn.textContent = isFavourite(crmId) ? '⭐' : '☆';
  btn.classList.remove('hidden');
}

// ── 유틸 ─────────────────────────────────────────────────────────────
function timeAgo(dateStr) {
  if (!dateStr) return '';
  const d = new Date(dateStr.replace(' ', 'T'));
  const diff = Date.now() - d.getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 60) return `${mins}${t('timeAgoMins')}`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}${t('timeAgoHours')}`;
  const days = Math.floor(hrs / 24);
  if (days < 30) return `${days}${t('timeAgoDays')}`;
  return `${Math.floor(days / 30)}${t('timeAgoMonths')}`;
}

function getStr(v) {
  return (v && typeof v === 'object') ? (v.display_value || v.value || '') : (v || '');
}

function normalizeCase(c) {
  const component = getStr(c.u_app_component);
  const createdOn = getStr(c.sys_created_on);
  // account sys_id 추출 — account가 객체면 link에서, display_value만 있으면 별도 조회 필요
  let accountSysId = '';
  if (typeof c.account === 'object' && c.account?.link) {
    accountSysId = c.account.link.split('/').pop() || '';
  }
  return {
    sys_id: getStr(c.sys_id),
    number: getStr(c.number),
    short_description: getStr(c.short_description),
    state: getStr(c.state),
    state_code: typeof c.state === 'object' ? (c.state.value || '') : String(c.state || ''),
    action_status: getStr(c.action_status),
    priority: getStr(c.priority),
    priority_code: typeof c.priority === 'object' ? (c.priority.value || '') : String(c.priority || ''),
    sys_created_on: createdOn,
    created_ago: timeAgo(createdOn),
    assigned_to: getStr(c.assigned_to),
    account: getStr(c.account),
    account_sys_id: accountSysId,
    u_app_component: component,
    correlation_display: getStr(c.correlation_display),
    watch_list: getStr(c.watch_list), // 콤마 구분 email 목록
    active_escalation: getStr(c.active_escalation), // 에스컬레이션 레코드(예: ESC1561340), 없으면 ''
    mcc_escalated: !!getStr(c.active_escalation) // active_escalation 값 있으면 에스컬레이션 진행중
  };
}

function priorityBadge(code, label) {
  const cls = { '1': 'badge-p1', '2': 'badge-p2', '3': 'badge-p3', '4': 'badge-p4' }[code] || 'badge-p4';
  return `<span class="badge ${cls}">${label || 'P' + code}</span>`;
}

function stateBadge(code, label) {
  const resolved = ['7', '8'].includes(String(code));
  return `<span class="badge ${resolved ? 'badge-resolved' : 'badge-state'}">${label}</span>`;
}

// ── 개별 복사 헬퍼 ────────────────────────────────────────────────────
// 버튼 클릭 시 getText()가 반환하는 문자열을 클립보드에 복사, 잠깐 ✅ 표시
function attachCopy(btnEl, getText) {
  if (!btnEl) return;
  btnEl.addEventListener('click', (e) => {
    e.stopPropagation();
    const text = (typeof getText === 'function' ? getText() : getText) || '';
    if (!text) return;
    navigator.clipboard.writeText(text).then(() => {
      const orig = btnEl.innerHTML;
      btnEl.textContent = '✅';
      setTimeout(() => { btnEl.innerHTML = orig; }, 1200);
    });
  });
}

// HTML → 평문 (링크 텍스트 보존)
function htmlToText(html) {
  const div = document.createElement('div');
  div.innerHTML = String(html || '')
    .replace(/\[code\]/g, '').replace(/\[\/code\]/g, '')
    .replace(/<br\s*\/?>/gi, '\n');
  return (div.textContent || '').replace(/\n{3,}/g, '\n\n').trim();
}

// ── Journal(comments_and_work_notes) 파서 ────────────────────────────
// 헤더: "YYYY-MM-DD HH:MM:SS - 작성자 (UserID) (Type)" 또는 "YYYY-MM-DD HH:MM:SS - 작성자 (Type)"
function parseJournal(raw) {
  if (!raw) return [];
  // 마지막 괄호 쌍이 Type, 그 앞의 선택적 괄호 쌍이 UserID
  const headerRe = /^(\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}) - (.+?) \(([^()]+)\)\s*(?:\(([^()]+)\))?\s*$/;
  const lines = String(raw).split('\n');
  const entries = [];
  let cur = null;
  for (const line of lines) {
    const m = line.match(headerRe);
    if (m) {
      if (cur) entries.push(cur);
      // m[4] 있으면: author=m[2], userId=m[3], type=m[4]
      // m[4] 없으면: author=m[2], type=m[3]
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

// journal HTML 전체에서 KBA/Note me.sap.com/notes 링크 추출 (중복 제거)
function extractNoteLinks(rawJournal) {
  const out = [];
  const seen = new Set();
  // 1) <a href="...me.sap.com/notes/..."> 링크 태그
  const reLink = /<a[^>]+href=["']([^"']*me\.sap\.com\/notes\/[^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi;
  let m;
  while ((m = reLink.exec(rawJournal || '')) !== null) {
    const url = m[1];
    if (seen.has(url)) continue;
    seen.add(url);
    const title = htmlToText(m[2]) || url;
    out.push({ url, title });
  }
  // 2) plain text 10자리 숫자 (Note/KBA 번호) — 링크 없는 경우
  const plain = (rawJournal || '').replace(/<[^>]+>/g, ' '); // strip HTML
  const reNum = /\b(\d{10})\b/g;
  while ((m = reNum.exec(plain)) !== null) {
    const num = m[1];
    const url = `https://me.sap.com/notes/${num}`;
    if (seen.has(url)) continue;
    seen.add(url);
    out.push({ url, title: num });
  }
  return out;
}

// ── ITSM 통신 (통합 SessionManager window.CSMSession 경유) ──────────────
// 세션 확보/유효성/대기는 전부 window.CSMSession(init-session.js)이 담당한다.
// itsmFetch는 "토큰 받아서 요청하고, 세션 끊김 신호(401/403/400/405/opaqueredirect)면
// ensureSession으로 재확보 후 1회 재시도"만 한다.
function isSessionBreakStatus(response) {
  // credentials:'include'로 보낸 요청이 세션 없음일 때 나타나는 모든 형태.
  // 401/403(인증), 400/405(SSO ACS에 GET 착지 "GET not supported" 등), opaqueredirect(로그인 리다이렉트).
  return response.type === 'opaqueredirect' || response.status === 0
    || response.status === 400 || response.status === 401
    || response.status === 403 || response.status === 405;
}

async function itsmFetch(path, _retried = false) {
  console.log('[CSM] itsmFetch →', path.slice(0, 100), '_retried=', _retried);

  const ITSM_BASE = 'https://itsm.services.sap';

  // g_ck 획득 — 매니저에 위임.
  let gck = window.CSMSession.getToken('itsm');
  if (!gck) {
    if (!_retried) {
      const ok = await window.CSMSession.ensureSession('itsm');
      if (ok) return itsmFetch(path, true);
    }
    throw new Error('ITSM 세션 없음');
  }

  // PATCH 요청 처리
  const patchIdx = path.indexOf('__PATCH__');
  if (patchIdx >= 0) {
    const apiPath = path.slice(0, patchIdx);
    const bodyStr = path.slice(patchIdx + 9);
    const response = await fetch(ITSM_BASE + apiPath, {
      method: 'PATCH',
      credentials: 'include',
      redirect: 'manual',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
        'X-UserToken': gck
      },
      body: bodyStr
    });

    if (isSessionBreakStatus(response)) {
      if (!_retried) {
        const ok = await window.CSMSession.ensureSession('itsm');
        if (ok) return itsmFetch(path, true);
      }
      throw new Error('ITSM 인증 실패');
    }

    if (!response.ok) {
      throw new Error(`ITSM PATCH ${response.status}`);
    }

    const data = await response.json();
    return data;
  }

  // GET 요청
  const response = await fetch(ITSM_BASE + path, {
    credentials: 'include',
    redirect: 'manual',
    headers: {
      'Accept': 'application/json',
      'X-UserToken': gck
    }
  });

  console.log('[CSM] ITSM 응답:', response.status, response.type, (response.url || '').slice(0, 80));

  if (isSessionBreakStatus(response)) {
    if (!_retried) {
      const ok = await window.CSMSession.ensureSession('itsm');
      if (ok) return itsmFetch(path, true);
    }
    throw new Error('ITSM 인증 실패');
  }

  if (!response.ok) {
    throw new Error(`ITSM ${response.status}`);
  }

  const data = await response.json();
  return data;
}

// ── 내 계정 정보 ─────────────────────────────────────────────────────
async function loadMyUser() {
  if (myUserId) return;
  try {
    // 현재 세션 사용자를 표준 API로 조회 (동적 gs.getUserName() 쿼리는 REST에서 차단됨)
    const me = await itsmFetch('/api/now/ui/user/current_user');
    const uid = me?.result?.user_sys_id || me?.result?.sys_id;
    if (uid) {
      const data = await itsmFetch(`/api/now/table/sys_user/${uid}?sysparm_fields=sys_id,name,email&sysparm_display_value=true`);
      const u = data?.result;
      if (u) {
        myUserId = getStr(u.sys_id);
        myUserName = getStr(u.name);
        myEmail = getStr(u.email);
      }
    }
  } catch (e) {
    console.warn('내 사용자 정보 로드 실패:', e.message);
  }
}

// ── 고객사 데이터 ────────────────────────────────────────────────────
async function loadKoreaAccounts() {
  if (koreaAccounts) return koreaAccounts;
  const url = browserAPI.runtime.getURL('korea-accounts.json');
  const r = await fetch(url);
  const data = await r.json();
  koreaAccounts = data.accounts || [];
  return koreaAccounts;
}

function buildCrmMap(accounts) {
  const map = {};
  accounts.forEach(a => {
    const raw = String(a.crmId);
    const stripped = raw.replace(/^0+/, '') || '0';
    map[raw] = a.name;
    map[stripped] = a.name;
  });
  return map;
}

// ── ITSM 쿼리 빌드 ───────────────────────────────────────────────────
function buildQuery(crmId, days, stateCodes) {
  const ALL_STATES = ['1','2','9','6','3'];
  const since = new Date();
  since.setDate(since.getDate() - Number(days));
  const sinceStr = since.toISOString().slice(0, 10);
  console.log('[CSM] buildQuery days=', days, 'sinceStr=', sinceStr);
  let q = `account.u_sap_crm_bp_number=${crmId}^sys_updated_on>=${sinceStr}`;
  const excluded = ALL_STATES.filter(s => !stateCodes.includes(s));
  excluded.forEach(s => { q += `^state!=${s}`; });
  q += '^ORDERBYDESCsys_updated_on';
  const params = new URLSearchParams({
    sysparm_fields: 'number,short_description,state,action_status,priority,sys_created_on,assigned_to,account,sys_id,u_app_component,correlation_display,watch_list,active_escalation',
    sysparm_limit: '500',
    sysparm_display_value: 'true'
  });
  return `/api/now/table/sn_customerservice_case?sysparm_query=${encodeURIComponent(q)}&${params}`;
}

// ── MCC 에스컬레이션 상태 = 케이스의 active_escalation 필드 (별도 조회 없음) ──
// 기존 sc_req_item 조회(checkMccEscalation)는 403(권한없음)으로 항상 false 였고,
// 30회 병렬 조회로 목록 렌더를 블록하기만 했음 → 제거. normalizeCase 의 mcc_escalated 사용.

// ── Watch list 토글 ─────────────────────────────────────────────────
async function toggleWatch(caseItem, watchBtn) {
  if (!myEmail) {
    await loadMyUser();
    if (!myEmail) { alert(t('loginError')); return; }
  }
  const watching = watchBtn.classList.contains('watching');
  const currentList = (caseItem.watch_list || '').split(',').map(s => s.trim()).filter(Boolean);
  let newList;
  if (watching) {
    newList = currentList.filter(e => !e.includes(myEmail.split('@')[0]));
  } else {
    if (!currentList.includes(myEmail)) currentList.push(myEmail);
    newList = currentList;
  }
  try {
    const resp = await itsmFetch(`/api/now/table/sn_customerservice_case/${caseItem.sys_id}__PATCH__${JSON.stringify({ watch_list: newList.join(',') })}`);
    caseItem.watch_list = newList.join(',');
    if (watching) {
      watchBtn.classList.remove('watching');
      watchBtn.title = t('watchAdding');
    } else {
      watchBtn.classList.add('watching');
      watchBtn.title = `${t('watchViewing')}: ${newList.join(', ')}`;
    }
  } catch (e) {
    alert(t('watchUpdateFailed') + ': ' + e.message);
  }
}

// ── 렌더: 고객사 리스트 ──────────────────────────────────────────────
async function renderFavouriteList() {
  const startKey = selectedOwnerKey;

  await loadFavourites();

  // ⚠️ 탭 변경 감지 → 렌더링 중단
  if (selectedOwnerKey !== startKey) {
    console.log(`[renderFavouriteList] 탭 변경 감지, 렌더링 중단`);
    return;
  }

  const list = document.getElementById('accountList');
  const accounts = _favourites.filter(f => f.type !== 'case');
  const cases = _favourites.filter(f => f.type === 'case');

  // Notifications 제거(모바일) — 숨길 탭 없음

  if (!accounts.length && !cases.length) {
    list.innerHTML = `<div class="empty-state">${t('favEmpty')}<br><span style="font-size:11px;color:#888">${t('favEmptyHint')}</span></div>`;
  } else {
    let html = '';
    if (accounts.length) {
      html += `<div class="fav-section-label">${t('favSectionAccount')}</div>`;
      html += accounts.map(a => {
        const displayName = a.name.replace(/\s*\([^)]*\)\s*$/, '').trim();
        return `
        <div class="account-item" data-crmid="${escHtml(a.crmId)}" data-name="${escHtml(a.name)}">
          <button class="fav-star-btn" data-crmid="${escHtml(a.crmId)}" title="${t('favRemove')}">⭐</button>
          <div class="account-info">
            <div class="account-name">${escHtml(displayName)}</div>
          </div>
        </div>`;
      }).join('');
    }
    if (cases.length) {
      html += `<div class="fav-section-label">${t('favSectionCase')}</div>`;
      // 저장된 정보로 즉시 렌더
      html += cases.map(c => {
        const caseObj = {
          sys_id: c.sysId, number: c.number, short_description: c.title || '',
          account: c.account || '', state: c.state || '', state_code: c.state_code || '',
          priority: c.priority || '', priority_code: c.priority_code || '',
          mcc_escalated: false, correlation_display: c.correlation_display || '', watch_list: '', assigned_to: '',
          u_app_component: c.u_app_component || '', created_ago: ''
        };
        return buildCaseItemHtml(caseObj, 'fav-case-item');
      }).join('');
    }
    list.innerHTML = html;

    // account 이벤트 바인딩 (즉시)
    list.querySelectorAll('.account-item:not(.fav-case-item)').forEach(el => {
      el.addEventListener('click', (e) => {
        if (e.target.classList.contains('fav-star-btn')) return;
        if (el.classList.contains('fav-pending-remove')) return;
        doSearch([el.dataset.crmid], el.dataset.name);
      });
    });
    list.querySelectorAll('.fav-star-btn:not(.fav-case-star)').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const crmId = btn.dataset.crmid;
        const item = btn.closest('.account-item');
        if (item.classList.contains('fav-pending-remove')) {
          item.classList.remove('fav-pending-remove');
          btn.textContent = '⭐';
          btn.title = t('favRemove');
          addFavourite(crmId, item.querySelector('.account-name').textContent);
        } else {
          item.classList.add('fav-pending-remove');
          btn.textContent = '☆';
          btn.title = t('favUndo');
          removeFavourite(crmId);
        }
      });
    });

    // case 이벤트 바인딩 (즉시, 저장된 데이터로 이미 렌더된 상태)
    if (cases.length) {
      bindFavCaseEvents(list);

      // 백그라운드로 상태값 갱신 (20건씩 청크 병렬 처리)
      (async () => {
        const CHUNK = 20;
        const chunks = [];
        for (let i = 0; i < cases.length; i += CHUNK) chunks.push(cases.slice(i, i + CHUNK));
        const allFetched = (await Promise.all(
          chunks.map(chunk => {
            const ids = chunk.map(c => c.sysId).join(',');
            return itsmFetch(
              `/api/now/table/sn_customerservice_case?sysparm_query=sys_idIN${encodeURIComponent(ids)}&sysparm_fields=sys_id,state,action_status,priority,u_app_component,correlation_display,watch_list,active_escalation&sysparm_display_value=true&sysparm_limit=${chunk.length}`
            ).then(d => Array.isArray(d?.result) ? d.result : []).catch(() => []);
          })
        )).flat();

        allFetched.forEach(raw => {
          const el = list.querySelector(`.fav-case-item[data-sysid="${raw.sys_id}"]`);
          if (!el) return;
          // 저장된 케이스 스냅샷 + 최신 상태값으로 병합해서 재렌더
          const saved = cases.find(c => c.sysId === raw.sys_id) || {};
          const caseObj = normalizeCase({
            sys_id: raw.sys_id,
            number: saved.number || '',
            short_description: saved.title || '',
            account: saved.account || '',
            state: raw.state,
            action_status: raw.action_status,
            priority: raw.priority,
            u_app_component: raw.u_app_component,
            watch_list: raw.watch_list,
            active_escalation: raw.active_escalation,
            assigned_to: '', sys_created_on: '', correlation_display: getStr(raw.correlation_display) || saved.correlation_display || ''
          });
          // outerHTML 교체 후 이벤트 재바인딩
          el.outerHTML = buildCaseItemHtml(caseObj, 'fav-case-item');
          // 저장소에도 최신 상태 반영
          const favIdx = _favourites.findIndex(f => f.type === 'case' && f.sysId === raw.sys_id);
          if (favIdx >= 0) {
            _favourites[favIdx].state = getStr(raw.state);
            _favourites[favIdx].state_code = getStr(raw.state?.value ?? '');
            _favourites[favIdx].priority = getStr(raw.priority);
            _favourites[favIdx].priority_code = getStr(raw.priority?.value ?? '');
            _favourites[favIdx].u_app_component = getStr(raw.u_app_component);
            if (raw.correlation_display) _favourites[favIdx].correlation_display = getStr(raw.correlation_display);
          }
        });
        saveFavourites();
        // 상태 업데이트 후 이벤트 재바인딩 — list가 여전히 현재 DOM인지 확인
        if (document.getElementById('accountList') === list) {
          bindFavCaseEvents(list);
        }
      })();
    }
  }
  showView('account');
}

function bindFavCaseEvents(list) {
  list.querySelectorAll('.fav-case-item').forEach(el => {
    if (el.dataset.bound) return;
    el.dataset.bound = '1';
    el.addEventListener('click', async (e) => {
      if (e.target.classList.contains('case-fav-btn')) return;
      if (e.target.classList.contains('watch-btn')) return;
      if (el.classList.contains('fav-pending-remove')) return;
      const sysId = el.dataset.sysid;
      el.style.cursor = 'wait';
      try {
        const data = await itsmFetch(
          `/api/now/table/sn_customerservice_case/${sysId}?sysparm_fields=sys_id,number,short_description,state,action_status,priority,sys_created_on,assigned_to,account,u_app_component,correlation_display,watch_list,active_escalation,comments_and_work_notes&sysparm_display_value=all`
        );
        const c = normalizeCase(data.result);
        c._journal = getStr(data.result?.comments_and_work_notes);
        openDetail(c);
      } catch (err) {
        alert(t('caseFetchFailed') + ': ' + err.message);
      } finally {
        el.style.cursor = '';
      }
    });
    el.querySelectorAll('.case-fav-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const sysId = btn.dataset.sysid;
        const item = btn.closest('.case-item');
        if (item.classList.contains('fav-pending-remove')) {
          item.classList.remove('fav-pending-remove');
          btn.textContent = '⭐'; btn.classList.add('active');
          const favCase = _favourites.find(f => f.type === 'case' && f.sysId === sysId);
          if (favCase && !isFavouriteCase(sysId)) { _favourites.push(favCase); saveFavourites(); }
        } else {
          item.classList.add('fav-pending-remove');
          btn.textContent = '☆'; btn.classList.remove('active');
          removeFavouriteCase(sysId);
        }
      });
    });
  });
}

async function renderAccountList(crmIds) {
  // 시작 시점의 selectedOwnerKey 캡처 — 완료 시 비교용
  const startKey = selectedOwnerKey;

  // Notifications 제거(모바일) — 숨길 탭 없음

  const accounts = await loadKoreaAccounts();
  const map = buildCrmMap(accounts);
  // crmId → json 원본 crmId(앞에 0 포함) 역매핑
  const canonicalMap = {};
  accounts.forEach(a => {
    const stripped = String(a.crmId).replace(/^0+/, '') || '0';
    canonicalMap[stripped] = a.crmId;
    canonicalMap[a.crmId] = a.crmId;
  });
  const seen = new Set();
  const items = crmIds.map(id => {
    const canonical = canonicalMap[id] || canonicalMap[String(id).replace(/^0+/, '')] || id;
    const name = map[String(id).replace(/^0+/, '')] || map[id] || null;
    return { crmId: canonical, name };
  }).filter(a => {
    if (seen.has(a.crmId)) return false;
    seen.add(a.crmId);
    return true;
  });

  // korea-accounts에 없는 항목은 ITSM customer_account에서 name 조회
  await Promise.all(items.filter(a => !a.name).map(async a => {
    try {
      const path = `/api/now/table/customer_account?sysparm_query=u_sap_crm_bp_number=${encodeURIComponent(a.crmId)}&sysparm_fields=name&sysparm_limit=1&sysparm_exclude_reference_link=true`;
      const resp = await new Promise((resolve, reject) => {
        itsmFetch(path).then(resolve).catch(reject);
      });
      a.name = resp?.result?.[0]?.name || null;
    } catch { /* 무시 */ }
  }));

  // ⚠️ 렌더링 직전 체크: 탭이 바뀌었으면 중단 (다른 탭의 내용이 덮어쓰는 것 방지)
  if (selectedOwnerKey !== startKey) {
    console.log(`[renderAccountList] 탭 변경 감지 (${startKey} → ${selectedOwnerKey}), 렌더링 중단`);
    return;
  }

  const sorted = items.filter(a => a.name).sort((a, b) => a.name.localeCompare(b.name));

  const list = document.getElementById('accountList');
  if (!sorted.length) {
    list.innerHTML = `<div class="empty-state">${t('noAccounts')}</div>`;
  } else {
    list.innerHTML = sorted.map(a => {
      const displayName = a.name.replace(/\s*\([^)]*\)\s*$/, '').trim();
      const fav = isFavourite(a.crmId);
      const crmStr = String(a.crmId).replace(/^0+/, '');
      return `
      <div class="account-item" data-crmid="${a.crmId}" data-name="${escHtml(a.name)}">
        <button class="fav-star-btn${fav ? ' active' : ''}" data-crmid="${a.crmId}" title="${fav ? t('favRemove') : t('favAdd')}">${fav ? '⭐' : '☆'}</button>
        <div class="account-info">
          <div class="account-name">${escHtml(displayName)}</div>
          <div class="account-id" style="font-size:11px;color:var(--text-muted)">CRM ${crmStr}</div>
        </div>
        <span class="account-arrow">›</span>
      </div>`;
    }).join('');
    list.querySelectorAll('.account-item').forEach(el => {
      el.addEventListener('click', (e) => {
        if (e.target.classList.contains('fav-star-btn')) return;
        const crmId = el.dataset.crmid;
        const name = el.dataset.name;
        doSearch([crmId], name);
      });
    });
    list.querySelectorAll('.fav-star-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const crmId = btn.dataset.crmid;
        const item = btn.closest('.account-item');
        const name = item.dataset.name;
        if (isFavourite(crmId)) {
          removeFavourite(crmId);
          btn.textContent = '☆';
          btn.classList.remove('active');
          btn.title = t('favAdd');
        } else {
          addFavourite(crmId, name);
          btn.textContent = '⭐';
          btn.classList.add('active');
          btn.title = t('favRemove');
        }
      });
    });
  }
  showView('account');
}

function escHtml(s) {
  return String(s || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

// ── 렌더: 케이스 리스트 ─────────────────────────────────────────────
function buildCaseItemHtml(c, extraClass = '') {
  const watching = myEmail && (c.watch_list || '').includes(myEmail.split('@')[0]);
  const watchTitle = watching ? `${t('watchViewing')} (${c.watch_list})` : t('watchAdding');
  const isFavCase = isFavouriteCase(c.sys_id);
  const stateChanged = isCaseStateChanged(c.sys_id, c.state_code);
  const stateBadgeHtml = stateChanged
    ? `<span class="badge badge-state-changed">${escHtml(c.state)}</span>`
    : stateBadge(c.state_code, c.state);
  return `
  <div class="case-item${extraClass ? ' ' + extraClass : ''}${stateChanged ? ' state-changed' : ''}" data-sysid="${c.sys_id}">
    <button class="case-fav-btn${isFavCase ? ' active' : ''}" title="Favourite" data-sysid="${c.sys_id}">${isFavCase ? '⭐' : '☆'}</button>
    <div class="case-main">
      <div class="case-header">
        <span class="case-number">${escHtml(c.number)}${c.correlation_display ? ` <span class="corr-num">${escHtml(c.correlation_display)}</span>` : ''}</span>
        <div class="case-badges">
          ${priorityBadge(c.priority_code, c.priority)}
          ${stateBadgeHtml}
          ${c.mcc_escalated ? '<span class="mcc-badge">⚡ MCC</span>' : ''}
          <button class="watch-btn ${watching ? 'watching' : ''}" title="${escHtml(watchTitle)}" data-sysid="${c.sys_id}">👁</button>
        </div>
      </div>
      <div class="case-account">${escHtml(c.account)}</div>
      <div class="case-desc">${escHtml(c.short_description)}</div>
      <div class="case-meta">
        <span class="case-component">${escHtml(c.u_app_component)}</span>
        <span>${escHtml(c.created_ago || '')}</span>
        ${c.assigned_to ? `<span>👤 ${escHtml(c.assigned_to)}</span>` : ''}
      </div>
    </div>
  </div>`;
}

async function renderCaseList(cases) {
  const list = document.getElementById('caseList');
  if (!cases.length) {
    showView('empty');
    return;
  }

  list.innerHTML = cases.map(c => buildCaseItemHtml(c)).join('');

  // 이벤트 위임: list 컨테이너에 한 번만 등록 (outerHTML 교체 후에도 살아있음)
  if (!list._delegated) {
    list._delegated = true;
    list.addEventListener('click', async (e) => {
      const btn = e.target.closest('.watch-btn');
      const favBtn = e.target.closest('.case-fav-btn');
      const item = e.target.closest('.case-item');
      if (!item) return;
      const sysId = item.dataset.sysid;
      const c = currentCases.find(x => x.sys_id === sysId);

      if (btn) {
        e.stopPropagation();
        if (c) await toggleWatch(c, btn);
        return;
      }
      if (favBtn) {
        e.stopPropagation();
        if (!c) return;
        if (isFavouriteCase(sysId)) {
          await removeFavouriteCase(sysId);
          favBtn.textContent = '☆';
          favBtn.classList.remove('active');
        } else {
          await addFavouriteCase(c);
          favBtn.textContent = '⭐';
          favBtn.classList.add('active');
        }
        return;
      }
      if (c) openDetail(c);
    });
  }

  showView('cases');
}

// ── 뷰 전환 ──────────────────────────────────────────────────────────
let _currentView = 'account'; // 'account' | 'cases' | 'loading' | 'empty' | 'error'
// 활성 탭(_accountDetailTab) 기준으로 ONE360 탭 패널과 caseList를 상호배타 토글.
// 고객 미선택 시엔 전부 숨긴다. showView와 탭 클릭 핸들러가 공유한다.
function applyDetailTabVisibility() {
  const hasAccount = !!_selectedAccount;
  const tab = _accountDetailTab;
  const set = (id, show) => { const el = document.getElementById(id); if (el) el.classList.toggle('hidden', !show); };
  set('contractTab', hasAccount && tab === 'contract');
  set('cacvTab', hasAccount && tab === 'cacv');
  set('consumptionTab', hasAccount && tab === 'consumption');
  // caseList는 고객 선택 + Cases 탭일 때만. account/loading/empty/error 뷰에선
  // showView가 caseList를 직접 숨기므로 여기선 cases 탭 조건만 본다.
  const inListMode = _currentView === 'account' || _currentView === 'loading' || _currentView === 'empty' || _currentView === 'error';
  set('caseList', hasAccount && tab === 'cases' && !inListMode);

  // ONE360 탭에선 "케이스가 없습니다" emptyState를 강제로 숨긴다.
  if (hasAccount && tab !== 'cases') set('emptyState', false);

  // 탭 버튼 active 상태 동기화
  document.querySelectorAll('.account-detail-tab').forEach(t => {
    t.classList.toggle('active', t.dataset.tab === tab);
  });
}

function showView(mode) {
  _currentView = mode;
  document.getElementById('accountList').classList.toggle('hidden', mode !== 'account');
  document.getElementById('skeletonList').classList.toggle('hidden', mode !== 'loading');
  document.getElementById('emptyState').classList.toggle('hidden', mode !== 'empty');
  document.getElementById('errorState').classList.toggle('hidden', mode !== 'error');

  // 고객사 상세 (Contract/cACV/Consumption/Cases 탭)
  const detailContainer = document.getElementById('accountDetailContainer');
  if (detailContainer) {
    detailContainer.classList.toggle('hidden', !_selectedAccount);
  }

  // caseList는 accountDetailContainer 바깥 형제이므로, 활성 탭 기준으로
  // ONE360 탭과 상호배타 토글(모든 탭 하단에 case 섞임 방지).
  if (mode === 'cases') _accountDetailTab = 'cases';
  applyDetailTabVisibility();

  // 헤더 ← 버튼: 고객사 목록이 아닐 때 표시, 로고는 반대로
  const isAccount = mode === 'account';
  document.getElementById('btnBackMain').classList.toggle('hidden', isAccount);
  document.getElementById('hdrLogo').classList.toggle('hidden', !isAccount);
  if (isAccount) {
    document.getElementById('hdrTitle').textContent = 'CSM Cases';
    document.getElementById('btnAddFavourite').classList.add('hidden');
  }
}

// ── 조회 ─────────────────────────────────────────────────────────────
// 통합 검색: 고객사 카드 + 케이스 카드 혼합 표시
// - 숫자: korea-accounts CRM ID 매칭 → 고객사 카드, 동시에 케이스 번호 조회 → 케이스 카드
// - 텍스트: ITSM customer_account name 검색 → 고객사 카드, short_description 검색 → 케이스 카드
async function searchUnified(q) {
  console.log('[CSM] searchUnified 호출 q=', q);
  showView('loading');
  const stripped = q.replace(/^0+/, '');
  const isNumeric = /^\d+$/.test(q);

  const localAccounts = await loadKoreaAccounts();
  const accountHits = isNumeric
    ? localAccounts.filter(a => String(a.crmId).replace(/^0+/, '') === stripped)
    : localAccounts.filter(a => a.name.toLowerCase().includes(q.toLowerCase()));

  console.log('[CSM] accountHits=', accountHits.length, accountHits.map(a => a.name));

  // 케이스 조회 후 통합 표시 (고객사 + 케이스)
  try {
    const fields = 'sys_id,number,short_description,state,action_status,priority,sys_created_on,assigned_to,account,u_app_component,correlation_display,watch_list,active_escalation';
    let caseHits = [];

    if (isNumeric) {
      // 숫자 입력 → 여러 패턴 병렬 시도
      const queries = [];

      // 1) correlation_display (6~7자리 케이스 번호)
      if (/^\d{6,7}$/.test(q)) {
        queries.push(`correlation_display=${encodeURIComponent(q + '/2026')}`);
        queries.push(`correlation_display=${encodeURIComponent(q + '/2025')}`);
      }

      // 2) number LIKE (CS번호 부분 매칭)
      queries.push(`numberLIKE${encodeURIComponent(q)}`);

      // 3) account.name 부분 매칭 (숫자가 고객사명에 포함된 경우)
      if (accountHits.length) {
        queries.push(`account.nameLIKE${encodeURIComponent(accountHits[0].name.split(' ')[0])}`);
      }

      // 병렬 실행
      console.log('[CSM] searchUnified 쿼리들:', queries);
      const results = await Promise.all(
        queries.map(snQuery =>
          itsmFetch(`/api/now/table/sn_customerservice_case?sysparm_query=${snQuery}&sysparm_fields=${fields}&sysparm_display_value=true&sysparm_limit=20`)
            .then(d => {
              console.log(`[CSM] 쿼리 성공: ${snQuery.slice(0, 50)} → ${d?.result?.length || 0}건`);
              return (d?.result || []).map(normalizeCase);
            })
            .catch(e => {
              console.warn(`[CSM] 쿼리 실패: ${snQuery.slice(0, 50)}`, e.message);
              return [];
            })
        )
      );
      console.log('[CSM] 병렬 조회 완료, 총', results.flat().length, '건');

      // 중복 제거
      const seen = new Set();
      caseHits = results.flat().filter(c => {
        if (seen.has(c.sys_id)) return false;
        seen.add(c.sys_id);
        return true;
      });
    } else {
      // 텍스트 입력 → short_description 검색
      const data = await itsmFetch(
        `/api/now/table/sn_customerservice_case?sysparm_query=short_descriptionLIKE${encodeURIComponent(q)}&sysparm_fields=${fields}&sysparm_display_value=true&sysparm_limit=20`
      );
      caseHits = (data?.result || []).map(normalizeCase);
    }

    renderUnified(accountHits, caseHits, q);
  } catch (e) {
    console.warn('[CSM] 케이스 조회 실패', e.message);
  }
}

function renderUnified(accountHits, caseHits, q) {
  const list = document.getElementById('accountList');

  if (!accountHits.length && !caseHits.length) {
    document.getElementById('emptyState').textContent = `${t('searchNoResult')}: ${q}`;
    showView('empty');
    return;
  }

  let html = '';
  if (accountHits.length) {
    html += `<div class="search-section-label">${t('searchSectionAccount')}</div>`;
    html += accountHits.map(a => {
      const displayName = a.name.replace(/\s*\([^)]*\)\s*$/, '').trim();
      const crmStr = String(a.crmId).replace(/^0+/, '');
      const fav = isFavourite(a.crmId);
      return `<div class="account-item search-account-item" data-crmid="${escHtml(String(a.crmId))}" data-name="${escHtml(a.name)}">
        <button class="fav-star-btn${fav ? ' active' : ''}" data-crmid="${escHtml(String(a.crmId))}" title="${fav ? t('favRemove') : t('favAdd')}">${fav ? '⭐' : '☆'}</button>
        <div class="account-info">
          <div class="account-name">${escHtml(displayName)}</div>
          <div class="account-id" style="font-size:11px;color:var(--text-muted)">CRM ${crmStr}</div>
        </div>
        <span class="account-arrow">›</span>
      </div>`;
    }).join('');
  }
  if (caseHits.length) {
    html += `<div class="search-section-label">${t('searchSectionCase')}</div>`;
    html += caseHits.map(c => buildCaseItemHtml(c)).join('');
  }

  list.innerHTML = html;
  showView('account');

  list.querySelectorAll('.search-account-item').forEach(el => {
    el.addEventListener('click', e => {
      if (e.target.classList.contains('fav-star-btn')) return;
      doSearch([el.dataset.crmid], el.dataset.name);
    });
    el.querySelector('.fav-star-btn')?.addEventListener('click', e => {
      e.stopPropagation();
      const crmId = e.target.dataset.crmid;
      const name = el.dataset.name;
      if (isFavourite(crmId)) { removeFavourite(crmId); e.target.textContent = '☆'; e.target.classList.remove('active'); }
      else { addFavourite(crmId, name); e.target.textContent = '⭐'; e.target.classList.add('active'); }
    });
  });

  list.querySelectorAll('.case-item').forEach(el => {
    el.addEventListener('click', async e => {
      if (e.target.closest('.case-fav-btn') || e.target.closest('.watch-btn')) return;
      const sysId = el.dataset.sysid;
      el.style.cursor = 'wait';
      try {
        const data = await itsmFetch(
          `/api/now/table/sn_customerservice_case/${sysId}?sysparm_fields=sys_id,number,short_description,state,action_status,priority,sys_created_on,assigned_to,account,u_app_component,correlation_display,watch_list,active_escalation,comments_and_work_notes&sysparm_display_value=all`
        );
        const c = normalizeCase(data.result);
        c._journal = getStr(data.result?.comments_and_work_notes);
        openDetail(c);
      } catch (err) { alert(t('caseFetchFailed') + ': ' + err.message); }
      finally { el.style.cursor = ''; }
    });
  });
}

async function doSearchOrCase(q) {
  _lastQuery = q; // 재시도를 위해 저장
  return searchUnified(q);
}


// CS번호 / 케이스번호 직접 조회 → 케이스 목록 + 클릭 가능
async function searchCaseDirectly(q) {
  console.log('[CSM] searchCaseDirectly 호출 q=', q);
  const input = q.trim();

  // 🚨 6~7자리 숫자는 무조건 correlation_display (케이스 번호) — 최우선 처리
  if (/^\d{6,7}$/.test(input)) {
    console.log('[CSM] searchCaseDirectly: 6~7자리 → correlation_display 조회');
    showView('loading');
    const fields = 'sys_id,number,short_description,state,action_status,priority,sys_created_on,assigned_to,account,u_app_component,correlation_display,watch_list,active_escalation';
    let rows = [];
    try {
      // 2026 먼저 시도
      const data2026 = await itsmFetch(
        `/api/now/table/sn_customerservice_case?sysparm_query=correlation_display=${encodeURIComponent(input + '/2026')}&sysparm_fields=${fields}&sysparm_display_value=true&sysparm_limit=20`
      );
      rows = Array.isArray(data2026?.result) ? data2026.result : [];

      // 없으면 2025 시도
      if (!rows.length) {
        const data2025 = await itsmFetch(
          `/api/now/table/sn_customerservice_case?sysparm_query=correlation_display=${encodeURIComponent(input + '/2025')}&sysparm_fields=${fields}&sysparm_display_value=true&sysparm_limit=20`
        );
        rows = Array.isArray(data2025?.result) ? data2025.result : [];
      }

      if (!rows.length) {
        document.getElementById('emptyState').textContent = `${t('searchNoResult')}: ${input}`;
        showView('empty');
        return;
      }

      const cases = rows.map(normalizeCase);
      _rawCases = cases;
      currentCases = cases;
      _lastTargets = null;
      const titleEl = document.getElementById('hdrTitle');
      if (titleEl) titleEl.textContent = input;
      await renderCaseList(cases);
      document.getElementById('resultCount').textContent = `${cases.length}건`;
    } catch (e) {
      showError(t('caseFetchFailed'), e.message);
    }
    return;
  }

  let snQuery;
  if (/^CS/i.test(input)) {
    snQuery = `number=${encodeURIComponent(input.toUpperCase())}`;
  } else if (/^\d{14,}$/.test(input)) {
    // CS 없는 14자리 이상 순수숫자 → CS 붙여서 exact 조회
    snQuery = `number=CS${encodeURIComponent(input)}`;
  } else if (/^\d+\/\d{4}$/.test(input)) {
    // 연도형(1209589/2026, 01209589/2026) → correlation_display 조회
    snQuery = `correlation_display=${encodeURIComponent(input)}`;
  } else if (/^\d/.test(input)) {
    // 그 외 숫자 → numberLIKE (부분 번호)
    snQuery = `numberLIKE${encodeURIComponent(input)}`;
  } else {
    // 텍스트 키워드 → short_description LIKE
    snQuery = `short_descriptionLIKE${encodeURIComponent(input)}`;
  }
  showView('loading');
  try {
    const fields = 'sys_id,number,short_description,state,action_status,priority,sys_created_on,assigned_to,account,u_app_component,correlation_display,watch_list,active_escalation';
    const data = await itsmFetch(
      `/api/now/table/sn_customerservice_case?sysparm_query=${snQuery}&sysparm_fields=${fields}&sysparm_display_value=true&sysparm_limit=20`
    );
    const rows = Array.isArray(data?.result) ? data.result : [];
    if (!rows.length) {
      document.getElementById('emptyState').textContent = `${t('searchNoResult')}: ${input}`;
      showView('empty');
      return;
    }
    const cases = rows.map(normalizeCase);
    _rawCases = cases;
    currentCases = cases;
    _lastTargets = null; // 고객사 기반 아님
    // 헤더에 검색어 표시
    const titleEl = document.getElementById('hdrTitle');
    if (titleEl) titleEl.textContent = input;
    await renderCaseList(cases);
    document.getElementById('resultCount').textContent = `${cases.length}건`;
  } catch (e) {
    showError(t('caseFetchFailed'), e.message);
  }
}

async function doSearch(crmIds, overrideAccountName) {
  console.log('[CSM] doSearch 시작 crmIds=', crmIds);
  showView('loading');
  document.getElementById('resultCount').textContent = '';

  const accounts = await loadKoreaAccounts();
  const map = buildCrmMap(accounts);
  const days = document.getElementById('periodSelect').value;
  const ALL_STATES = ['1','2','9','6','3'];

  const seen = new Set();
  const targets = crmIds.map(id => ({
    crmId: id,
    name: overrideAccountName || map[String(id).replace(/^0+/, '')] || map[id] || null,
    erpId: null  // ITSM customer_account 조회로 채움
  }));

  // korea-accounts.json에 없는 CRM ID → ITSM customer_account에서 name+erpId 조회
  await Promise.all(targets.map(async t => {
    try {
      const path = `/api/now/table/customer_account?sysparm_query=u_sap_crm_bp_number=${encodeURIComponent(t.crmId)}&sysparm_fields=name,number&sysparm_limit=1&sysparm_exclude_reference_link=true`;
      const resp = await itsmFetch(path);
      const row = resp?.result?.[0];
      if (row) {
        if (!t.name) t.name = row.name || null;
        t.erpId = row.number || null;
      }
    } catch { /* 조회 실패는 무시 */ }
  }));

  const uniqueTargets = [];
  const seenNames = new Set();
  for (const t of targets) {
    if (!t.name || seenNames.has(t.name)) continue;
    seenNames.add(t.name);
    uniqueTargets.push(t);
  }
  const finalTargets = uniqueTargets;

  if (!finalTargets.length) {
    showError(
      t('noMappedAccount'),
      `CRM ID ${crmIds.join(', ')} ${t('crmIdNotFound')}`
    );
    return;
  }

  _lastTargets = finalTargets;

  // ONE360 고객사 컨텍스트: 단일 고객사면 상세 탭(Contract/cACV/Consumption) 활성화,
  // 복수 고객사면 null로 두어 상세 탭을 숨긴다(Chrome 원본과 동일).
  // 선택된 고객사가 바뀌면 ONE360 캐시 무효화.
  if (finalTargets.length === 1) {
    const prevCrm = _selectedAccount && _selectedAccount.crmId;
    _selectedAccount = { crmId: finalTargets[0].crmId, name: finalTargets[0].name };
    if (prevCrm !== _selectedAccount.crmId) {
      _contractAll = _cacvAll = _consumptionAll = null;
    }
  } else {
    _selectedAccount = null;
    _contractAll = _cacvAll = _consumptionAll = null;
  }
  _accountDetailTab = 'cases';

  setProgress(`${t('itsmFetching')} (${finalTargets.map(t => t.name).join(', ')})`);
  try {
    const results = await Promise.all(
      finalTargets.map(t =>
        itsmFetch(buildQuery(t.crmId, days, ALL_STATES))
          .then(d => {
            const rows = d.result || [];
            return rows.map(normalizeCase);
          })
          .catch(e => {
            console.error(`[CSM] ${t.name} 조회 실패:`, e.message);
            return { _error: true, name: t.name, msg: e.message };
          })
      )
    );

    // 에러 분리
    const errors = results.filter(r => r._error);
    const rows = results.filter(r => !r._error).flat();

    if (errors.length && !rows.length) {
      // 전부 실패
      showError(
        t('itsmFetchFailed'),
        errors.map(e => `${e.name}: ${e.msg}`).join('\n')
      );
      return;
    }
    if (errors.length) {
      // 일부 실패 — 결과 상단에 경고 표시
      document.getElementById('resultCount').textContent =
        `${t('itsmPartialFail')} (${errors.map(e => e.name).join(', ')})`;
    }

    let flat = rows;
    const deduped = flat.filter((c, i, a) => a.findIndex(x => x.sys_id === c.sys_id) === i)
      .sort((a, b) => b.sys_created_on.localeCompare(a.sys_created_on));

    _rawCases = deduped; // state/컴포넌트 필터 클라이언트에서 처리
    if (errors.length) {
      document.getElementById('resultCount').textContent =
        `${t('itsmPartialFail')} (${errors.map(e => e.name).join(', ')})`;
    }

    setProgress('');
    // 헤더에 고객사명 표시
    const titleEl = document.getElementById('hdrTitle');
    if (titleEl) {
      if (finalTargets.length === 1) {
        const t = finalTargets[0];
        const cleanName = t.name ? t.name.replace(/\s*\([^)]*\)\s*$/, '').trim() : null;
        const crmStr = String(t.crmId).replace(/^0+/, '');
        const erpStr = t.erpId ? String(t.erpId).replace(/^0+/, '') : null;
        const idPart = erpStr ? `CRM:${crmStr} / ERP:${erpStr}` : `CRM:${crmStr}`;
        titleEl.textContent = cleanName ? `${cleanName} (${idPart})` : idPart;
      } else {
        titleEl.textContent = finalTargets.map(t => t.name || t.crmId).join(', ');
      }
    }
    applyComponentFilter(); // comp 필터 적용 후 렌더
    updateFavouriteBtn();   // Favourite 버튼 상태 갱신
  } catch (e) {
    setProgress('');
    showError(t('itsmError'), e.stack || e.message);
  }
}

// ── 컴포넌트 필터 (클라이언트 재필터 — 서버 재조회 없음) ──────────────
async function applyComponentFilter() {
  const STATE_TEXT = { '1':'New', '2':'In progress', '9':'Awaiting Info', '6':'Resolved', '3':'Closed' };
  const stateCodes = [...document.querySelectorAll('.status-chk:checked')].map(c => c.value);
  const stateLabels = stateCodes.map(c => STATE_TEXT[c]).filter(Boolean);
  const compKeys = [...document.querySelectorAll('.comp-chk:checked')].map(c => c.value);
  // BDC/BTP/Other 3버킷. BDC/BTP는 prefix 매칭, Other는 BDC/BTP prefix의 여집합.
  const want = { bdc: compKeys.includes('BDC'), btp: compKeys.includes('BTP'), other: compKeys.includes('OTHER') };
  const allComps = compKeys.length === 0 || (want.bdc && want.btp && want.other);
  let filtered = _rawCases;
  if (stateLabels.length) filtered = filtered.filter(c => stateLabels.includes(c.state));
  if (!allComps) {
    filtered = filtered.filter(c => {
      const comp = c.u_app_component || '';
      const isBdc = COMPONENTS.BDC.some(p => comp.startsWith(p));
      const isBtp = COMPONENTS.BTP.some(p => comp.startsWith(p));
      const isOther = !isBdc && !isBtp;
      return (want.bdc && isBdc) || (want.btp && isBtp) || (want.other && isOther);
    });
  }
  currentCases = filtered;
  if (!document.getElementById('resultCount').textContent.startsWith('⚠️')) {
    document.getElementById('resultCount').textContent = `${filtered.length}건`;
  }
  if (!myEmail) await loadMyUser().catch(() => {});
  renderCaseList(filtered);
}

// ── 인페이지 토스트 ─────────────────────────────────────────────────────
// iOS Safari 확장 popup WebView에서는 window.alert()가 조용히 무시된다(일반 탭은 뜸).
// MCC Escalation 안내처럼 "브라우저는 되는데 확장은 안 뜨던" 알림을 이걸로 대체한다.
// kind: 'success' | 'error' | 'info'(기본). 2.5초 뒤 자동 소멸. 메시지는 textContent로만 넣어 XSS 차단.
let _toastTimer = null;
function showToast(msg, kind) {
  let el = document.getElementById('csmToast');
  if (!el) {
    el = document.createElement('div');
    el.id = 'csmToast';
    el.className = 'csm-toast';
    document.body.appendChild(el);
  }
  el.className = 'csm-toast toast-' + (kind || 'info');
  el.textContent = msg;
  // 리플로우 강제 후 show 클래스로 페이드인(연속 호출 시에도 애니메이션 재생).
  void el.offsetWidth;
  el.classList.add('show');
  if (_toastTimer) clearTimeout(_toastTimer);
  _toastTimer = setTimeout(() => {
    el.classList.remove('show');
    setTimeout(() => { if (el && el.parentNode && !el.classList.contains('show')) el.remove(); }, 250);
  }, 2500);
}

function showError(msg, detail) {
  const el = document.getElementById('errorState');

  // 세션 에러 자동 감지 및 재연결. 400/405/opaqueredirect/HTML/ONE360도 세션 신호로 포함(결함4).
  const isSessionError = detail && (
    detail.includes('ITSM 세션') || detail.includes('g_ck') || detail.includes('401')
    || detail.includes('403') || detail.includes('400') || detail.includes('405')
    || detail.includes('세션 없음') || detail.includes('로그인') || detail.includes('SSO')
    || detail.includes('Safari에서') || detail.includes('세션 만료') || detail.includes('세션 확보')
    || detail.includes('GET is not supported') || detail.includes('opaqueredirect')
    || detail.includes('HTML 응답') || detail.includes('ONE360')
  );

  if (isSessionError && window.CSMSession) {
    // 에러 출처 시스템을 판별 — ONE360 에러면 one360 세션을, 아니면 itsm 세션을 기다린다.
    const sys = detail.includes('ONE360') ? 'one360' : 'itsm';
    const sysLabel = sys === 'one360' ? 'ONE360' : 'ITSM';
    console.log('[CSM] showError 세션 감지 - 재연결 대상:', sys);
    el.innerHTML = `<div class="error-title">🔄 ${sysLabel} 세션 재연결 중...</div>`;
    showView('error');

    // 통합 매니저 경유 — 조회 경로가 돌리는 폴링과 동일 Promise를 공유해 redirect 중복을 막는다.
    window.CSMSession.ensureSession(sys).then((success) => {
      if (success) {
        console.log('[CSM] ✅ 재연결 성공 - 자동 재시도');
        setTimeout(() => {
          if (_lastQuery) {
            doSearchOrCase(_lastQuery);
          } else {
            location.reload();
          }
        }, 1000);
      } else {
        console.error('[CSM] ❌ 재연결 실패');
        const host = sys === 'one360' ? 'one360.for.sap' : 'itsm.services.sap';
        el.innerHTML = `<div class="error-title">⚠️ 재연결 실패</div>`
          + `<pre class="error-detail">Safari에서 ${host}를 직접 열어 로그인하세요</pre>`
          + `<button class="btn-ghost btn-sm" onclick="location.reload()" style="margin-top:8px">다시 시도</button>`;
      }
    });
    return;
  }

  // 일반 에러 표시
  el.innerHTML = `<div class="error-title">⚠️ ${escHtml(msg)}</div>`
    + (detail ? `<pre class="error-detail">${escHtml(detail)}</pre>` : '')
    + `<button class="btn-ghost btn-sm" id="btnRetry" style="margin-top:8px">${t('retry')}</button>`;
  showView('error');
  console.error('[CSM]', msg, detail || '');

  // 재시도 버튼
  setTimeout(() => {
    const btn = document.getElementById('btnRetry');
    if (btn) {
      btn.onclick = () => {
        if (_lastQuery) {
          doSearchOrCase(_lastQuery);
        } else {
          location.reload();
        }
      };
    }
  }, 0);
}

function setProgress(msg) {
  // 스켈레톤 위에 진행 메시지 오버레이
  const el = document.getElementById('progressMsg');
  if (el) { el.textContent = msg; el.classList.toggle('hidden', !msg); }
}

// ── 케이스 상세 ──────────────────────────────────────────────────────
async function openDetail(c) {
  selectedCase = c;
  markCaseSeen(c.sys_id, c.state_code); // 읽음 처리 — 이후 상태 변경 감지 기준

  // 선택 표시
  document.querySelectorAll('.case-item').forEach(el => {
    el.classList.toggle('selected', el.dataset.sysid === c.sys_id);
  });

  document.getElementById('detailNumber').textContent = c.number + (c.correlation_display ? ` / ${c.correlation_display}` : '');
  document.getElementById('detailDesc').textContent = c.short_description;
  document.getElementById('detailAccount').textContent = c.account;
  document.getElementById('detailState').textContent = c.state;
  document.getElementById('detailPriority').textContent = c.priority;
  document.getElementById('detailAssignee').textContent = c.assigned_to;
  document.getElementById('detailCreated').textContent = c.sys_created_on;
  document.getElementById('detailComponent').textContent = c.u_app_component;

  // Favourite 버튼 상태 동기화
  updateFavCaseBtn();
  _lastAiInsight = null;
  document.getElementById('aiBusy').classList.add('hidden');
  document.getElementById('aiStructured').classList.add('hidden');
  document.getElementById('aiPlaceholder').classList.remove('hidden');
  document.querySelectorAll('#aiStructured .ai-block-body').forEach(el => el.textContent = '');

  // 참조 링크 초기화 (ServiceNow 원문은 항상 표시)
  renderRefs(c, '');

  // 메모 초기화 (ITSM 메모는 입력란만 비움 — 기존 로컬 저장 제거)
  document.getElementById('memoInput').value = '';
  const memoHistEl = document.getElementById('memoHistory');
  if (memoHistEl) memoHistEl.classList.add('hidden');

  // 탭 초기화 (Overview). Timeline 은 AI 분석 실행 시 생성되므로 안내 문구 표시
  switchDetailTab('overview');
  document.getElementById('timelineList').innerHTML = '';
  document.getElementById('timelineEmpty').classList.remove('hidden');

  // 패널 열기
  const panel = document.getElementById('detailPanel');
  panel.classList.remove('hidden');
  requestAnimationFrame(() => panel.classList.add('open'));

  // 상세 단건 조회 (journal + 참조 필드) — 비동기, 완료 시 참조/타임라인 갱신
  loadCaseDetail(c);
}

// 상세 단건 조회: 상태값 + journal + INC/KBA/SimCat 필드
async function loadCaseDetail(c) {
  document.getElementById('timelineBusy').classList.remove('hidden');
  try {
    const fields = [
      'sys_id','number','comments_and_work_notes','u_info_from_correction',
      'state','action_status','priority','assigned_to','account','u_app_component',
      'correlation_id','correlation_display','u_bcp_link','u_simcat_link','knowledge','watch_list','active_escalation'
    ].join(',');
    const data = await itsmFetch(
      `/api/now/table/sn_customerservice_case/${c.sys_id}?sysparm_fields=${fields}&sysparm_display_value=true`
    );
    const rec = data?.result || {};
    const journal = getStr(rec.comments_and_work_notes);

    // 최신 상태값으로 selectedCase 갱신 + UI 반영
    const fresh = normalizeCase(rec);
    c.state = fresh.state; c.state_code = fresh.state_code;
    c.priority = fresh.priority; c.priority_code = fresh.priority_code;
    c.assigned_to = fresh.assigned_to;
    c.u_app_component = fresh.u_app_component;
    c.watch_list = fresh.watch_list;
    c.mcc_escalated = fresh.mcc_escalated;
    document.getElementById('detailState').textContent = c.state;
    document.getElementById('detailPriority').textContent = c.priority;
    document.getElementById('detailAssignee').textContent = c.assigned_to;
    document.getElementById('detailComponent').textContent = c.u_app_component;
    markCaseSeen(c.sys_id, c.state_code); // 최신 상태로 읽음 기록 갱신
    const listItem = document.querySelector(`.case-item[data-sysid="${c.sys_id}"]`);
    if (listItem) {
      const isFavItem = listItem.classList.contains('fav-case-item');
      listItem.outerHTML = buildCaseItemHtml(c, isFavItem ? 'fav-case-item' : '');
      // fav-case-item은 outerHTML 교체로 이벤트가 사라지므로 재바인딩
      if (isFavItem) {
        const list = document.getElementById('accountList');
        if (document.getElementById('accountList') === list) bindFavCaseEvents(list);
      }
    }

    c._detail = rec;
    c._journal = journal;

    // Favourite 케이스면 lastState에 저장 (다음 변경 감지용 스냅샷)
    if (isFavouriteCase(c.sys_id)) {
      const { lastState } = await browserAPI.storage.local.get('lastState') || {};
      const state = lastState || {};
      state[c.number] = {
        state: c.state,
        priority: c.priority,
        journal: journal,
        updatedAt: new Date().toISOString()
      };
      try { await browserAPI.storage.local.set({ lastState: state }); } catch(e) { console.warn("[CSM] Storage quota exceeded:", e); }
    }

    // 담당자 이메일 조회 (복사 버튼용)
    const assignedLink = typeof rec.assigned_to?.link === 'string' ? rec.assigned_to.link : null;
    if (assignedLink && !c._assigneeEmail) {
      // assigned_to.link는 절대 URL — ITSM_BASE 부분 제거 후 path만 사용
      const linkPath = assignedLink.startsWith(ITSM_BASE)
        ? assignedLink.slice(ITSM_BASE.length)
        : assignedLink.replace(/^https?:\/\/[^/]+/, '');
      itsmFetch(`${linkPath}?sysparm_fields=email&sysparm_display_value=true`).then(r => {
        c._assigneeEmail = getStr(r?.result?.email);
      }).catch(() => {});
    }
    renderRefs(c, journal, getStr(rec.u_info_from_correction));
    renderMemoHistory(journal);
    // 상세 로드 완료 후 AI 분석 자동 실행 (1회, 같은 언어 결과 있으면 스킵)
    const lang = _uiLang;
    if (!_lastAiInsight || _lastAiLang !== lang) runAiInsight();
    // Timeline 은 AI 분석(runAiInsight) 이 생성. journal 원문은 _journal 에만 보관.
  } catch (e) {
    console.warn('[CSM] 상세 조회 실패:', e.message);
    document.getElementById('timelineEmpty').textContent = t('timelineLoadFailed') + ': ' + e.message;
    document.getElementById('timelineEmpty').classList.remove('hidden');
  } finally {
    document.getElementById('timelineBusy').classList.add('hidden');
  }
}

// ── 참조 링크 렌더 (ServiceNow / INC / KBA / SimCat) ──────────────────
function renderRefs(c, rawJournal, correctionInfo) {
  const rec = c._detail || {};
  const refs = [];

  // ServiceNow 원문 (sys_id 기반 — 생성 아님)
  refs.push({
    label: 'ServiceNow',
    title: c.number,
    url: `${ITSM_BASE}/now/cwf/agent/record/sn_customerservice_case/${c.sys_id}`
  });

  // INC (BCP) — u_bcp_link 우선, 없으면 correlation_id로 조립
  const bcpLink = getStr(rec.u_bcp_link);
  const corrId = getStr(rec.correlation_id);
  const corrDisp = getStr(rec.correlation_display) || c.correlation_display;
  const incTitle = corrDisp || corrId || '';
  if (bcpLink && incTitle) {
    refs.push({ label: 'BCP Case', title: incTitle, url: bcpLink, desc: t('bcpDesc') });
  } else if (corrId && /^\d+$/.test(corrId)) {
    refs.push({
      label: 'BCP Case', title: incTitle || corrId,
      url: `https://support.bss.net.sap/sap/support/message/${corrId}`,
      desc: t('bcpDesc')
    });
  }

  // KBA / SAP Note — journal 본문의 me.sap.com/notes 링크 추출
  extractNoteLinks(rawJournal).forEach(n => {
    const noteNum = n.url.match(/\/notes\/(\d+)/)?.[1] || '';
    const noteNumTrimmed = noteNum.replace(/^0+/, '') || noteNum;
    const titleIsUrl = n.title === n.url || n.title.startsWith('http');
    const titleIsNum = /^\d+$/.test(n.title.trim());
    let display;
    if (titleIsUrl || titleIsNum) {
      display = noteNumTrimmed;
    } else {
      display = `${noteNumTrimmed} - ${n.title.replace(/^\d+ - /, '').trim()}`;
    }
    refs.push({ label: t('kbaLabel'), title: display, url: n.url });
  });

  // Jira — journal + u_info_from_correction 에서 PROJECT-1234 형태 추출
  const jiraKeys = new Set();
  const jiraRe = /\b([A-Z][A-Z0-9]{1,9}-\d+)\b/g;
  const plainJournal = (rawJournal || '').replace(/<[^>]+>/g, ' ');
  const plainCorrection = (correctionInfo || '').replace(/<[^>]+>/g, ' ');
  let m;
  for (const text of [plainJournal, plainCorrection]) {
    jiraRe.lastIndex = 0;
    while ((m = jiraRe.exec(text)) !== null) {
      if (!/^\d+$/.test(m[1].split('-')[0])) jiraKeys.add(m[1]);
    }
  }
  jiraKeys.forEach(key => {
    refs.push({ label: 'Jira', title: key, url: `https://jira.tools.sap/browse/${key}` });
  });

  const box = document.getElementById('detailRefs');
  box.innerHTML = refs.map((r, i) => `
    <div class="ref-row" data-i="${i}">
      <span class="ref-label"${r.desc ? ` title="${escHtml(r.desc)}"` : ''}>${escHtml(r.label)}</span>
      <a class="ref-link" href="${escHtml(r.url)}" target="_blank" title="${escHtml(r.url)}">${escHtml(r.title)}</a>
      <button class="copy-btn ref-copy" title="${t('copyLink')}"><svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor"><path d="M11 2H5a1 1 0 0 0-1 1v9a1 1 0 0 0 1 1h6a1 1 0 0 0 1-1V3a1 1 0 0 0-1-1zM5 1h6a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V3a2 2 0 0 1 2-2z"/><path d="M3 4H2a1 1 0 0 0-1 1v9a1 1 0 0 0 1 1h6a1 1 0 0 0 1-1v-1H8v1H2V5h1V4z"/></svg></button>
    </div>`).join('');

  box.querySelectorAll('.ref-row').forEach((row, i) => {
    attachCopy(row.querySelector('.ref-copy'), () => refs[i].url);
  });
}

// ── AI 타임라인 렌더 ──────────────────────────────────────────────────
// AI 서버가 생성한 timeline 배열 [{date, summary, actor}] 을 카드로 렌더.
function actorInfo(actor) {
  const a = (actor || '').trim();
  const customerVals = new Set(['고객', 'Customer', '客户', 'お客様']);
  const bothVals = new Set(['양측', 'Both', '双方', '双方']);
  if (customerVals.has(a)) return { cls: 'tl-customer', icon: '👤', label: t('actorCustomer') };
  if (bothVals.has(a)) return { cls: 'tl-external', icon: '🔁', label: t('actorBoth') };
  return { cls: 'tl-external', icon: '📨', label: 'SAP' };
}

function renderAiTimeline(timeline) {
  const list = document.getElementById('timelineList');
  const empty = document.getElementById('timelineEmpty');
  const entries = Array.isArray(timeline) ? timeline : [];
  if (!entries.length) {
    list.innerHTML = '';
    document.getElementById('timelineHeader').classList.add('hidden');
    empty.textContent = t('timelineEmpty');
    empty.classList.remove('hidden');
    return;
  }
  empty.classList.add('hidden');
  const snUrl = selectedCase ? `${ITSM_BASE}/now/cwf/agent/record/sn_customerservice_case/${selectedCase.sys_id}` : '';
  const cards = entries.map(e => {
    const ai = actorInfo(e.actor);
    return `
    <div class="tl-card ${ai.cls}">
      <div class="tl-head">
        <span class="tl-type">${ai.icon} ${escHtml(ai.label)}</span>
        <span class="tl-time">${escHtml(e.date || '')}</span>
      </div>
      <div class="tl-body">${escHtml(e.summary || '')}</div>
    </div>`;
  }).join('');
  const footer = snUrl
    ? `<div class="tl-footer"><a class="ref-link" href="${escHtml(snUrl)}" target="_blank">${t('tlViewFull')}</a></div>`
    : '';
  list.innerHTML = cards + footer;

  const header = document.getElementById('timelineHeader');
  header.classList.remove('hidden');
  attachCopy(document.getElementById('btnCopyTimeline'), () =>
    entries.map(e => `[${e.date || ''}] (${e.actor || ''}) ${e.summary || ''}`).join('\n')
  );
}

// ── 상세 탭 전환 ──────────────────────────────────────────────────────
let _activeDetailTab = 'overview';
function switchDetailTab(tab) {
  _activeDetailTab = tab;
  document.querySelectorAll('.detail-tab').forEach(b =>
    b.classList.toggle('active', b.dataset.tab === tab));
  document.getElementById('tabOverview').classList.toggle('hidden', tab !== 'overview');
  document.getElementById('tabTimeline').classList.toggle('hidden', tab !== 'timeline');
  document.getElementById('tabAttachments').classList.toggle('hidden', tab !== 'attachments');
  if (tab === 'attachments' && selectedCase) loadAttachments(selectedCase.sys_id);
}

function closeDetail() {
  const panel = document.getElementById('detailPanel');
  panel.classList.remove('open');
  setTimeout(() => panel.classList.add('hidden'), 260);
  selectedCase = null;
  _attachSysId = null;
  _lastAiInsight = null;
  _lastAiLang = null;
  document.querySelectorAll('.case-item').forEach(el => el.classList.remove('selected'));
}

// ── 첨부파일 탭 ───────────────────────────────────────────────────────
const ATTACH_ICON = {
  pdf: '📄', doc: '📝', docx: '📝', xls: '📊', xlsx: '📊',
  ppt: '📊', pptx: '📊', zip: '🗜', png: '🖼', jpg: '🖼', jpeg: '🖼',
  gif: '🖼', mp4: '🎥', txt: '📃', log: '📃', csv: '📊', xml: '📄', json: '📄'
};
function attachIcon(name) {
  const ext = (name || '').split('.').pop().toLowerCase();
  return ATTACH_ICON[ext] || '📎';
}
function fmtBytes(n) {
  if (!n) return '';
  const num = parseInt(n, 10);
  if (num < 1024) return num + ' B';
  if (num < 1024 * 1024) return (num / 1024).toFixed(1) + ' KB';
  return (num / 1024 / 1024).toFixed(1) + ' MB';
}

let _attachSysId = null;
async function loadAttachments(sysId) {
  if (_attachSysId === sysId) return; // 이미 로드됨
  _attachSysId = sysId;
  const busy = document.getElementById('attachBusy');
  const list = document.getElementById('attachList');
  const empty = document.getElementById('attachEmpty');
  busy.classList.remove('hidden');
  list.innerHTML = '';
  empty.classList.add('hidden');
  try {
    const data = await itsmFetch(
      `/api/now/attachment?sysparm_query=table_name=sn_customerservice_case^table_sys_id=${sysId}&sysparm_fields=sys_id,file_name,size_bytes,content_type,sys_created_on,sys_created_by&sysparm_limit=50&sysparm_orderby=sys_created_on`
    );
    const files = data?.result || [];
    if (!files.length) {
      empty.classList.remove('hidden');
      return;
    }
    list.innerHTML = files.map(f => `
      <div class="attach-item">
        <span class="attach-icon">${attachIcon(f.file_name)}</span>
        <div class="attach-info">
          <a class="attach-name ref-link" href="${ITSM_BASE}/sys_attachment.do?sys_id=${f.sys_id}" target="_blank" title="${escHtml(f.file_name)}">${escHtml(f.file_name)}</a>
          <span class="attach-meta">${fmtBytes(f.size_bytes)} · ${escHtml((f.sys_created_on || '').slice(0,10))} · ${escHtml(f.sys_created_by?.display_value || f.sys_created_by || '')}</span>
        </div>
      </div>`).join('');
  } catch (e) {
    empty.textContent = 'Failed to load attachments: ' + e.message;
    empty.classList.remove('hidden');
  } finally {
    busy.classList.add('hidden');
  }
}

async function uploadAttachment(sysId, file) {
  const gck = await getGck();
  const form = new FormData();
  form.append('table_name', 'sn_customerservice_case');
  form.append('table_sys_id', sysId);
  form.append('uploadFile', file, file.name);

  const r = await fetch(`${ITSM_BASE}/api/now/attachment/upload`, {
    method: 'POST',
    credentials: 'include',
    headers: { Accept: 'application/json', 'X-UserToken': gck },
    body: form
  });

  if (r.status === 401) throw new Error('ITSM 세션 만료');
  if (!r.ok) {
    const txt = await r.text().catch(() => '');
    throw new Error(`업로드 ${r.status}: ${txt.slice(0, 200)}`);
  }

  return r.json();
}

// ── AI Insight ────────────────────────────────────────────────────────
async function runAiInsight() {
  if (!selectedCase) return;
  const lang = _uiLang;
  document.getElementById('aiBusy').classList.remove('hidden');
  document.getElementById('aiPlaceholder').classList.add('hidden');
  document.getElementById('aiStructured').classList.add('hidden');
  document.getElementById('btnAi').disabled = true;

  try {
    const r = await fetch(getAiInsightUrl(), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        caseNumber: selectedCase.number,
        shortDesc: selectedCase.short_description,
        state: selectedCase.state,
        priority: selectedCase.priority,
        assignedTo: selectedCase.assigned_to,
        account: selectedCase.account,
        component: selectedCase.u_app_component,
        incNumber: selectedCase.correlation_display || '',
        journal: selectedCase._journal || '',   // ← comments_and_work_notes 전문
        language: lang,
        format: 'structured'                     // 서버에 3항목 JSON + timeline 배열 요청
      })
    });
    if (!r.ok) throw new Error(`${t('aiServerError')}: ${r.status}`);
    const data = await r.json();
    console.log('[AI] raw insight type:', typeof data.insight, 'timeline:', Array.isArray(data.insight?.timeline) ? data.insight.timeline.length : 'N/A', 'customer_inquiry:', data.insight?.customer_inquiry?.slice?.(0,30));
    const s = parseAiStructured(data.insight);
    console.log('[AI] parsed customer_inquiry:', s.customer_inquiry?.slice(0,30), 'required_action:', s.required_action?.slice(0,30), 'timeline entries:', s.timeline.length, 'source_entry:', s.source_entry);
    _lastAiInsight = s;
    _lastAiLang = lang;
    if (selectedCase) selectedCase._aiTimeline = s.timeline;
    renderAiStructured(s, selectedCase?._journal);
    renderAiTimeline(s.timeline);
  } catch (e) {
    document.getElementById('aiPlaceholder').textContent = `${t('aiError')}: ${e.message}`;
    document.getElementById('aiPlaceholder').classList.remove('hidden');
  } finally {
    document.getElementById('aiBusy').classList.add('hidden');
    document.getElementById('btnAi').disabled = false;
  }
}

// AI 응답 → {customer_inquiry, current_state, required_action, source_entry, timeline:[{date,summary,actor}]}
function parseAiStructured(insight) {
  if (insight && typeof insight === 'object') {
    // 각 필드가 JSON 문자열로 이중 인코딩되어 온 경우 파싱
    const parse = (val) => {
      if (typeof val === 'string' && (val.startsWith('{') || val.startsWith('['))) {
        try { return JSON.parse(val); } catch { return val; }
      }
      return val;
    };
    return {
      customer_inquiry: parse(insight.customer_inquiry) || '',
      current_state: parse(insight.current_state) || '',
      required_action: parse(insight.required_action) || '',
      source_entry: (insight.source_entry && insight.source_entry.text) ? insight.source_entry : null,
      timeline: Array.isArray(insight.timeline) ? insight.timeline : []
    };
  }
  // 문자열이면 JSON 파싱 시도, 실패 시 전체를 current_state에
  try {
    const j = JSON.parse(insight);
    return parseAiStructured(j);
  } catch {
    return { customer_inquiry: '', current_state: String(insight || ''), required_action: '', source_entry: null, timeline: [] };
  }
}

function renderAiStructured(s, journal) {
  const map = {
    customer_inquiry: s.customer_inquiry,
    current_state: s.current_state,
    required_action: s.required_action
  };
  document.querySelectorAll('#aiStructured .ai-block').forEach(block => {
    const key = block.dataset.key;
    block.querySelector('.ai-block-body').textContent = map[key] || '—';

    // current_state 블록은 원문 포함해서 복사
    if (key === 'current_state' && s.source_entry) {
      attachCopy(block.querySelector('.copy-btn'), () => {
        const rawText = `${s.source_entry.time} — ${s.source_entry.author} (${s.source_entry.type})\n${s.source_entry.text}`;
        return `${map[key] || ''}\n\n[원문]\n${rawText}`;
      });
    } else {
      attachCopy(block.querySelector('.copy-btn'), () => map[key] || '');
    }
  });

  // 최근 journal 원문 (current_state 블록 하단) — AI가 current_state 근거로 사용한 항목
  const rawEl = document.getElementById('aiLatestRaw');
  const rawText = document.getElementById('aiLatestRawText');
  const latest = s.source_entry;
  if (latest) {
    rawText.textContent = `${latest.time} — ${latest.author} (${latest.type})\n${latest.text}`;
    rawEl.classList.remove('hidden');
  } else {
    rawEl.classList.add('hidden');
  }

  document.getElementById('aiPlaceholder').classList.add('hidden');
  document.getElementById('aiStructured').classList.remove('hidden');
}

// 전체 복사 — HTML/평문 둘 다 클립보드에 쓰기 (hyperlink + 단락 포함)
function copyAiFull(s) {
  if (!s) return;
  const c = selectedCase;
  const snUrl = c ? `${ITSM_BASE}/now/cwf/agent/record/sn_customerservice_case/${c.sys_id}` : '';
  const corrDisp = c?.correlation_display || '';

  // HTML 버전
  const h = (t) => t.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
  const nl2br = (t) => h(t).replace(/\n/g,'<br>');
  let html = '';
  if (c) {
    html += `<p><strong>${t('caseLabel')}:</strong> <a href="${h(snUrl)}">${h(c.number)}</a>`;
    if (corrDisp) html += ` / <strong>INC:</strong> ${h(corrDisp)}`;
    html += `<br><strong>${t('titleLabel')}:</strong> ${h(c.short_description)}<br><strong>${t('account')}:</strong> ${h(c.account)}<br><strong>${t('statusPriorityLabel')}:</strong> ${h(c.state)} / ${h(c.priority)}<br><strong>${t('assignedTo')}:</strong> ${h(c.assigned_to || '')}</p>`;
  }
  if (s.customer_inquiry) html += `<p><strong>${t('copyCustomerInquiry')}</strong><br>${nl2br(s.customer_inquiry)}</p>`;
  if (s.current_state)    html += `<p><strong>${t('copyCurrentState')}</strong><br>${nl2br(s.current_state)}</p>`;
  if (s.required_action)  html += `<p><strong>${t('copyRequiredAction')}</strong><br>${nl2br(s.required_action)}</p>`;
  if (Array.isArray(s.timeline) && s.timeline.length) {
    const rows = s.timeline.map(e => `<li><strong>${h(e.date||'')}</strong> (${h(e.actor||'')}) — ${h(e.summary||'')}</li>`).join('');
    html += `<p><strong>${t('copyTimeline2')}</strong><br><ul>${rows}</ul></p>`;
  }
  const latestEntry = s.source_entry;
  if (latestEntry) {
    html += `<p><strong>[${t('sourceEntryLabel')}]</strong><br><em>${nl2br(`${latestEntry.time} — ${latestEntry.author} (${latestEntry.type})\n${latestEntry.text}`)}</em></p>`;
  }

  // 평문 버전
  const plain = aiFullText(s);

  try {
    navigator.clipboard.write([
      new ClipboardItem({
        'text/html': new Blob([html], { type: 'text/html' }),
        'text/plain': new Blob([plain], { type: 'text/plain' })
      })
    ]);
  } catch {
    navigator.clipboard.writeText(plain);
  }
}

// 전체 복사 텍스트 조립 — 케이스 메타 헤더 + 3항목 + 진행 타임라인 (고객/내부 전달용)
function aiFullText(s) {
  if (!s) return '';
  const c = selectedCase;
  const parts = [];
  if (c) {
    const snUrl = `${ITSM_BASE}/now/cwf/agent/record/sn_customerservice_case/${c.sys_id}`;
    const header = [
      `${t('caseLabel')}: ${c.number || ''} — ${c.short_description || ''}`,
      `${t('account')}: ${c.account || ''}`,
      `${t('statusPriorityLabel')}: ${c.state || ''} / ${c.priority || ''}`,
      `${t('assignedTo')}: ${c.assigned_to || ''}`,
      c.correlation_display ? `${t('incLabel')}: ${c.correlation_display}` : '',
      `ServiceNow: ${snUrl}`
    ].filter(Boolean).join('\n');
    parts.push(header);
  }
  parts.push(
    s.customer_inquiry && `${t('copyCustomerInquiry')}\n${s.customer_inquiry}`,
    s.current_state && `${t('copyCurrentState')}\n${s.current_state}`,
    s.required_action && `${t('copyRequiredAction')}\n${s.required_action}`
  );
  if (Array.isArray(s.timeline) && s.timeline.length) {
    const tl = s.timeline
      .map(e => `- ${e.date || ''} (${e.actor || ''}): ${e.summary || ''}`)
      .join('\n');
    parts.push(`${t('copyTimeline2')}\n${tl}`);
  }
  const latestEntry = s.source_entry;
  if (latestEntry) {
    parts.push(`[${t('sourceEntryLabel')}]\n${latestEntry.time} — ${latestEntry.author} (${latestEntry.type})\n${latestEntry.text}`);
  }
  return parts.filter(Boolean).join('\n\n');
}

function renderMemoHistory(journal) {
  const el = document.getElementById('memoHistory');
  if (!el) return;
  if (!journal || !myUserName) { el.classList.add('hidden'); return; }

  const INTERNAL_TYPES = ['Work notes', 'Additional work notes', 'Internal Info'];
  const EXTERNAL_TYPES = ['Additional comments', 'Customer comments', 'Comments'];

  const entries = parseJournal(journal).filter(e => {
    const isMe = e.author && myUserName && e.author.toLowerCase().includes(myUserName.split(' ')[0].toLowerCase());
    const isMemo = INTERNAL_TYPES.includes(e.type) || EXTERNAL_TYPES.includes(e.type);
    return isMe && isMemo && e.text.trim();
  });

  if (!entries.length) { el.classList.add('hidden'); return; }

  el.innerHTML = entries.map(e => {
    const isInternal = INTERNAL_TYPES.includes(e.type);
    const typeLabel = isInternal ? 'Internal' : 'External';
    const typeCls = isInternal ? 'internal' : 'external';
    return `<div class="memo-history-item">
      <div class="memo-history-head">
        <span class="memo-history-type ${typeCls}">${typeLabel}</span>
        <span class="memo-history-time">${escHtml(e.time)}</span>
      </div>
      <div class="memo-history-body">${escHtml(e.text.slice(0, 500))}${e.text.length > 500 ? '…' : ''}</div>
    </div>`;
  }).join('');
  el.classList.remove('hidden');
}

// ── Watch List 패널 ───────────────────────────────────────────────────
async function toggleWatchPanel() {
  const panel = document.getElementById('watchPanel');
  const isHidden = panel.classList.contains('hidden');
  if (isHidden) {
    panel.classList.remove('hidden');
    // ITSM에서 최신 watch_list 재조회 후 렌더
    if (selectedCase) {
      try {
        const data = await itsmFetch(`/api/now/table/sn_customerservice_case/${selectedCase.sys_id}?sysparm_fields=watch_list&sysparm_display_value=true`);
        selectedCase.watch_list = getStr(data?.result?.watch_list);
      } catch (e) { /* 실패 시 기존값 사용 */ }
    }
    renderWatchMembers();
    document.getElementById('watchSearchInput').value = '';
    document.getElementById('watchSearchResults').classList.add('hidden');
    const inp = document.getElementById('watchSearchInput');
    inp.onkeyup = null;
    inp.oninput = debounceWatchSearch;
  } else {
    panel.classList.add('hidden');
  }
}

let _watchSearchTimer = null;
function debounceWatchSearch(e) {
  clearTimeout(_watchSearchTimer);
  const q = e.target.value.trim();
  if (q.length < 2) {
    document.getElementById('watchSearchResults').classList.add('hidden');
    return;
  }
  _watchSearchTimer = setTimeout(() => searchWatchUsers(q), 250);
}

function renderWatchMembers() {
  if (!selectedCase) return;
  if (!myEmail) { loadMyUser().then(renderWatchMembers); return; }
  const raw = (selectedCase.watch_list || '').split(',').map(s => s.trim()).filter(Boolean);
  const myId = myEmail.split('@')[0];
  const iWatching = raw.some(e => e.includes(myId));
  const others = raw.filter(e => !e.includes(myId));
  const el = document.getElementById('watchMembers');
  el.innerHTML = `
    <div class="watch-me-row">
      <span class="watch-me-label">${t('watchMe')} (${escHtml(myEmail)})</span>
      <button class="watch-me-btn ${iWatching ? 'watching' : ''}" id="btnWatchMe">
        ${iWatching ? t('watchViewing') : t('watchAdding')}
      </button>
    </div>
    ${others.map(email => `
      <div class="watch-member-row">
        <span class="watch-member-email">${escHtml(email)}</span>
        <button class="watch-remove-btn" data-email="${escHtml(email)}" title="${t('watchRemove')}">✕</button>
      </div>`).join('')}
    ${!iWatching && !others.length ? `<div class="watch-empty">${t('watchNoOne')}</div>` : ''}`;

  document.getElementById('btnWatchMe').onclick = async () => {
    await toggleWatchSelf();
    renderWatchMembers();
  };
  el.querySelectorAll('.watch-remove-btn').forEach(btn => {
    btn.onclick = async () => {
      await removeFromWatchList(btn.dataset.email);
      renderWatchMembers();
    };
  });
}

async function toggleWatchSelf() {
  if (!myEmail) { await loadMyUser(); if (!myEmail) return; }
  const myId = myEmail.split('@')[0];
  const raw = (selectedCase.watch_list || '').split(',').map(s => s.trim()).filter(Boolean);
  const watching = raw.some(e => e.includes(myId));
  const newList = watching
    ? raw.filter(e => !e.includes(myId))
    : [...raw, myEmail];
  await patchWatchList(newList);
}

async function removeFromWatchList(email) {
  const raw = (selectedCase.watch_list || '').split(',').map(s => s.trim()).filter(Boolean);
  const newList = raw.filter(e => e !== email);
  await patchWatchList(newList);
}

async function addToWatchList(email) {
  const raw = (selectedCase.watch_list || '').split(',').map(s => s.trim()).filter(Boolean);
  if (raw.includes(email)) return;
  await patchWatchList([...raw, email]);
}

async function patchWatchList(newList) {
  const joined = newList.join(',');
  await itsmFetch(`/api/now/table/sn_customerservice_case/${selectedCase.sys_id}__PATCH__${JSON.stringify({ watch_list: joined })}`);
  selectedCase.watch_list = joined;
  // 목록의 해당 케이스 아이템 watch 버튼도 갱신
  const myId = myEmail ? myEmail.split('@')[0] : '';
  const iWatching = myId && newList.some(e => e.includes(myId));
  const listBtn = document.querySelector(`.watch-btn[data-sysid="${selectedCase.sys_id}"]`);
  if (listBtn) {
    listBtn.classList.toggle('watching', iWatching);
    listBtn.title = iWatching ? `${t('watchViewing')}: ${joined}` : t('watchAdding');
  }
}

async function searchWatchUsers(q) {
  const resultsEl = document.getElementById('watchSearchResults');
  resultsEl.innerHTML = `<div class="watch-searching">${t('watchSearching')}</div>`;
  resultsEl.classList.remove('hidden');
  try {
    const data = await itsmFetch(
      `/api/now/table/sys_user?sysparm_query=active=true^nameLIKE${encodeURIComponent(q)}^ORemailLIKE${encodeURIComponent(q)}&sysparm_fields=sys_id,name,email&sysparm_limit=8&sysparm_display_value=true`
    );
    const users = data?.result || [];
    if (!users.length) {
      resultsEl.innerHTML = `<div class="watch-searching">${t('watchNoResult')}</div>`;
      return;
    }
    const currentList = (selectedCase.watch_list || '').split(',').map(s => s.trim()).filter(Boolean);
    resultsEl.innerHTML = users.map(u => {
      const email = getStr(u.email);
      const name = getStr(u.name);
      const already = currentList.includes(email);
      return `<div class="watch-result-row ${already ? 'already' : ''}" data-email="${escHtml(email)}">
        <div class="watch-result-info">
          <span class="watch-result-name">${escHtml(name)}</span>
          <span class="watch-result-email">${escHtml(email)}</span>
        </div>
        <button class="watch-add-btn" ${already ? 'disabled' : ''} data-email="${escHtml(email)}">
          ${already ? '✓' : t('watchAddBtn')}
        </button>
      </div>`;
    }).join('');
    resultsEl.querySelectorAll('.watch-add-btn:not([disabled])').forEach(btn => {
      btn.onclick = async () => {
        btn.disabled = true;
        btn.textContent = t('watchAdding2');
        await addToWatchList(btn.dataset.email);
        btn.textContent = '✓';
        renderWatchMembers();
      };
    });
  } catch (e) {
    resultsEl.innerHTML = `<div class="watch-searching">${t('watchFailed')}: ${escHtml(e.message)}</div>`;
  }
}

// ── MCC Escalation 모달 ───────────────────────────────────────────────
async function openMccModal() {
  if (!selectedCase) return;
  const c = selectedCase;

  // 이미 에스컬레이션 존재 시 안내 후 종료 (확장 popup에선 alert이 안 떠서 토스트로)
  if (c.mcc_escalated) {
    showToast(`${c.number} ${t('mccAlreadyEscalated')}`, 'info');
    return;
  }

  // 모달 생성
  const backdrop = document.createElement('div');
  backdrop.className = 'modal-backdrop';
  backdrop.innerHTML = `
    <div class="modal">
      <div class="modal-header">
        <span>⚡ MCC Escalation — ${escHtml(c.number)}</span>
        <button class="modal-close" id="mccClose">✕</button>
      </div>
      <div class="modal-body">
        <div id="mccGenerating" class="modal-generating">${t('mccGenerating')}</div>
        <div id="mccForm" class="hidden">
          <div class="modal-field">
            <label>Request Title *</label>
            <input type="text" id="mccTitle" style="font-size:12px;">
          </div>
          <div class="modal-field">
            <label>Business Impact *</label>
            <textarea id="mccBi" rows="3"></textarea>
          </div>
          <div class="modal-field">
            <label>Affected Business Process</label>
            <textarea id="mccProcess" rows="2"></textarea>
          </div>
          <div class="modal-field">
            <label>How They Are Affected</label>
            <textarea id="mccAffected" rows="2"></textarea>
          </div>
          <div class="modal-field">
            <label>Upcoming Due Dates</label>
            <input type="text" id="mccDue">
          </div>
          <div class="modal-field">
            <label>Strategic Involvement</label>
            <textarea id="mccStrategic" rows="2"></textarea>
          </div>
          <div class="modal-field">
            <label>Already Involved Parties</label>
            <textarea id="mccParties" rows="2"></textarea>
          </div>
          <div class="modal-options">
            <div class="modal-opt-label">${t('mccExpectedAction')}</div>
            <label class="modal-opt-radio"><input type="radio" name="mccAction" id="mccAssignProcessor" value="assign_processor"> Assign Processor</label>
            <label class="modal-opt-radio"><input type="radio" name="mccAction" id="mccSpeedup" value="speedup"> Speed Up</label>
            <label class="modal-opt-radio"><input type="radio" name="mccAction" id="mccVeryHigh" value="very_high"> Raise Priority to Very High</label>
          </div>
        </div>
      </div>
      <div id="mccFooter" class="modal-footer hidden">
        <button class="btn-ghost btn-sm" id="mccCancel">${t('mccCancel')}</button>
        <button class="btn-danger" id="mccSubmit">${t('mccSubmit')}</button>
      </div>
    </div>`;
  document.body.appendChild(backdrop);
  let cancelled = false;
  const closeModal = () => { cancelled = true; backdrop.remove(); };

  document.getElementById('mccClose').onclick = closeModal;
  document.getElementById('mccCancel')?.addEventListener('click', closeModal);
  backdrop.addEventListener('click', e => { if (e.target === backdrop) closeModal(); });

  // AI로 내용 생성
  try {
    const r = await fetch(getMccGenerateUrl(), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        caseNumber: c.number,
        shortDesc: c.short_description,
        state: c.state,
        priority: c.priority,
        assignedTo: c.assigned_to,
        account: c.account,
        component: c.u_app_component,
        journal: c._journal || ''
      })
    });
    if (cancelled) return;
    const data = await r.json();
    if (cancelled) return;
    const fields = parseMccFields(data.fields || data.insight || '', c);
    fillMccForm(fields);
    // 상태 기반 기본값 고정: New → assign_processor, 나머지 → speedup
    const defaultAction = c.state_code === '1' ? 'assign_processor' : 'speedup';
    const radio = document.querySelector(`input[name="mccAction"][value="${defaultAction}"]`);
    if (radio) radio.checked = true;
  } catch (e) {
    if (cancelled) return;
    // AI 실패시 기본값
    fillMccForm({
      title: `[${c.priority}] ${c.number} — ${c.account}: ${c.short_description.slice(0, 80)}`,
      businessImpact: `Customer ${c.account} is experiencing critical issues with ${c.u_app_component}. Immediate attention required.`,
      affectedProcess: '',
      howAffected: '',
      dueDates: '',
      strategicInvolvement: '',
      involvedParties: `SAP Support, ${c.assigned_to || 'Assigned Engineer'}`
    });
    document.querySelector(`input[name="mccAction"][value="${c.state_code === '1' ? 'assign_processor' : 'speedup'}"]`).checked = true;
  }

  if (cancelled) return;
  document.getElementById('mccGenerating').classList.add('hidden');
  document.getElementById('mccForm').classList.remove('hidden');
  document.getElementById('mccFooter').classList.remove('hidden');

  document.getElementById('mccSubmit').onclick = () => submitMcc(c, backdrop);
}

function parseMccFields(data, c) {
  // data가 이미 객체면 그대로 매핑
  const json = typeof data === 'object' && data !== null ? data
    : (() => { try { return JSON.parse(data); } catch { return null; } })();
  if (json) {
    return {
      title: json.request_title || json.title || `[${c.priority}] ${c.number} — ${c.account}`,
      businessImpact: json.business_impact || '',
      affectedProcess: json.affected_business_process || '',
      howAffected: json.how_they_are_affected || '',
      dueDates: json.upcoming_due_dates || '',
      strategicInvolvement: json.strategic_involvement || '',
      involvedParties: json.already_involved_parties || ''
    };
  }
  return {
    title: `[${c.priority}] ${c.number} — ${c.account}: ${c.short_description.slice(0, 80)}`,
    businessImpact: String(data || '').slice(0, 300),
    affectedProcess: '', howAffected: '', dueDates: '',
    strategicInvolvement: '',
    involvedParties: `SAP Support, ${c.assigned_to || ''}`
  };
}

function stripHtml(html) {
  return (html || '').replace(/<[^>]*>/g, '').replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/&amp;/g,'&').trim();
}

function defaultDueDate() {
  const d = new Date();
  d.setDate(d.getDate() + 7);
  return d.toISOString().slice(0, 10); // YYYY-MM-DD
}

function fillMccForm(f) {
  document.getElementById('mccTitle').value = f.title || '';
  document.getElementById('mccBi').value = stripHtml(f.businessImpact || '');
  document.getElementById('mccProcess').value = f.affectedProcess || '';
  document.getElementById('mccAffected').value = f.howAffected || '';
  document.getElementById('mccDue').value = f.dueDates || defaultDueDate();
  document.getElementById('mccStrategic').value = f.strategicInvolvement || '';
  document.getElementById('mccParties').value = f.involvedParties || '';
}

async function submitMcc(c, backdrop) {
  const btn = document.getElementById('mccSubmit');
  btn.disabled = true;
  btn.textContent = t('mccSubmitting');

  const selectedAction = document.querySelector('input[name="mccAction"]:checked')?.value || '';
  const speedup = selectedAction === 'speedup';
  const veryHigh = selectedAction === 'very_high';
  const assignProcessor = selectedAction === 'assign_processor';
  const fields = {
    title: document.getElementById('mccTitle').value,
    businessImpact: document.getElementById('mccBi').value,
    affectedProcess: document.getElementById('mccProcess').value,
    howAffected: document.getElementById('mccAffected').value,
    dueDates: document.getElementById('mccDue').value,
    strategicInvolvement: document.getElementById('mccStrategic').value,
    involvedParties: document.getElementById('mccParties').value
  };

  // MCC 제출 (직접 POST)
  console.log('[CSM] MCC 제출 요청 - accountSysId:', c.account_sys_id, 'caseSysId:', c.sys_id);

  (async () => {
    try {
      // accountSysId가 없으면 조회
      let accSysId = c.account_sys_id;
      if (!accSysId) {
        try {
          const r = await itsmFetch(
            `/api/now/table/sn_customerservice_case?sysparm_query=number=${encodeURIComponent(c.number)}&sysparm_fields=account&sysparm_limit=1&sysparm_display_value=false`
          );
          const link = r?.result?.[0]?.account?.link || '';
          accSysId = link.split('/').pop() || '';
        } catch (e) {
          console.warn('[CSM] accountSysId 조회 실패 (계속 진행):', e.message);
        }
      }

      // MCC 검증
      try {
        const gck = await getGck();
        const qs = new URLSearchParams({
          sysparm_processor: 'SAP_MCC_SOS_RP_Utils',
          sysparm_scope: 'x_sapda_mccsos_app',
          sysparm_name: 'validateFormOnSubmission',
          sysparm_account_id: accSysId || '',
          sysparm_escalation_type: 'CIM_TBE_Request',
          sysparm_u_escalation_solution_area: '1',
          sysparm_case: c.sys_id,
          sysparm_cases: '',
          sysparm_is_this_a_business_down_situation: 'false',
          sysparm_exclude_reference_link: 'true'
        });
        await fetch(`${ITSM_BASE}/xmlhttp.do?${qs}`, {
          credentials: 'include',
          headers: { Accept: 'application/json', 'X-UserToken': gck }
        });
      } catch (e) {
        console.warn('[CSM] MCC 검증 실패 (계속 진행):', e.message);
      }

      // MCC 제출
      const itemGuid = crypto.randomUUID();
      const casePriority = (c.priority || '3').toString().charAt(0);
      const body = {
        sysparm_item_guid: itemGuid,
        variables: {
          u_escalation_type: 'CIM_TBE_Request',
          case_s: c.sys_id,
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

      const gck = await getGck();
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

      if (r.status === 401) throw new Error('ITSM 세션 만료');
      if (!r.ok) {
        const txt = await r.text().catch(() => '');
        throw new Error(`MCC 제출 ${r.status}: ${txt.slice(0, 200)}`);
      }

      const result = await r.json();
      const ritm = result?.result?.number || result?.result?.sys_id || '';
      if (!ritm || ritm === '-1') {
        throw new Error(`MCC 제출 응답에 유효한 RITM 번호 없음`);
      }

      // 성공 처리
      if (selectedCase && selectedCase.sys_id === c.sys_id) selectedCase.mcc_escalated = true;
      const item = document.querySelector(`.case-item[data-sysid="${c.sys_id}"]`);
      if (item && !item.querySelector('.mcc-badge')) {
        const badges = item.querySelector('.case-badges');
        const badge = document.createElement('span');
        badge.className = 'mcc-badge';
        badge.textContent = '⚡ MCC';
        badges.insertBefore(badge, badges.querySelector('.watch-btn'));
      }
      backdrop.remove();
      showToast(`${t('mccSuccess')}: ${ritm}`, 'success');

    } catch (e) {
      console.error('[CSM] MCC 제출 실패:', e);
      btn.disabled = false;
      btn.textContent = t('mccSubmit');
      showToast(t('mccFailed') + ': ' + e.message, 'error');
    }
  })();
}

// ── 자동완성 ─────────────────────────────────────────────────────────
let acTimer = null;
async function handleAccountInput(e) {
  const q = e.target.value.trim();
  const ac = document.getElementById('autocomplete');
  clearTimeout(acTimer);
  if (q.length < 2) { ac.classList.add('hidden'); return; }

  const isCasePattern = /^CS\d{6,}/i.test(q) || /^\d+\/\d{4}$/.test(q) || /^\d{14,}$/.test(q);

  // 명확한 케이스 번호 패턴 (CS접두사, 연도형, 14자리+)
  if (isCasePattern) {
    const rect = e.target.getBoundingClientRect();
    ac.style.top = (rect.bottom + 4) + 'px';
    ac.style.left = rect.left + 'px';
    ac.style.width = rect.width + 'px';
    ac.innerHTML = `<div class="autocomplete-item autocomplete-unified" data-q="${escHtml(q)}">
      <div class="autocomplete-name">🔍 <strong>${escHtml(q)}</strong> ${t('searchDirectLabel')}</div>
      <div class="autocomplete-id">${t('searchDirectHint')}</div>
    </div>`;
    ac.classList.remove('hidden');
    ac.querySelector('.autocomplete-unified').addEventListener('click', () => {
      ac.classList.add('hidden');
      searchCaseDirectly(q);
    });
    return;
  }

  // 숫자 또는 텍스트 → 통합검색 힌트 즉시 표시 + 고객사명 실시간 검색
  const rect = e.target.getBoundingClientRect();
  ac.style.top = (rect.bottom + 4) + 'px';
  ac.style.left = rect.left + 'px';
  ac.style.width = rect.width + 'px';

  // 즉시: 통합검색 힌트
  ac.innerHTML = `<div class="autocomplete-item autocomplete-unified" data-q="${escHtml(q)}">
    <div class="autocomplete-name">🔍 <strong>${escHtml(q)}</strong> ${t('searchUnifiedLabel')}</div>
    <div class="autocomplete-id">${t('searchUnifiedHint')}</div>
  </div>`;
  ac.classList.remove('hidden');
  ac.querySelector('.autocomplete-unified').addEventListener('click', () => {
    ac.classList.add('hidden');
    searchUnified(q);
  });

  // 텍스트 입력 시: 고객사명 실시간 후보도 추가
  if (!/^\d+$/.test(q)) {
    acTimer = setTimeout(async () => {
      try {
        const path = `/api/now/table/customer_account?sysparm_query=nameCONTAINS${encodeURIComponent(q)}^ORDERBYDESCu_sap_crm_bp_number&sysparm_fields=name,number,u_sap_crm_bp_number&sysparm_exclude_reference_link=true`;
        const resp = await new Promise((resolve, reject) => {
          itsmFetch(path).then(resolve).catch(reject);
        });
        if (document.getElementById('accountInput').value.trim() !== q) return;
        const results = (resp?.result || [])
          .sort((a, b) => (b.u_sap_crm_bp_number ? 1 : 0) - (a.u_sap_crm_bp_number ? 1 : 0));
        if (!results.length) return;

        const itemsHtml = results.map(a => {
          const crmId = a.u_sap_crm_bp_number || a.number || '';
          const erpId = a.number || '';
          const name = a.name || '';
          const crmStr = crmId.replace(/^0+/, '');
          const erpStr = erpId.replace(/^0+/, '');
          const idDisplay = crmId !== erpId && crmStr && erpStr
            ? `<span class="id-label">CRM</span> ${crmStr} <span class="id-sep">·</span> <span class="id-label">ERP</span> ${erpStr}`
            : `<span class="id-label">ERP</span> ${erpStr}`;
          const displayName = name.replace(/\s*\([^)]*\)\s*$/, '').trim();
          return `<div class="autocomplete-item" data-crmid="${escHtml(crmId)}" data-erpid="${escHtml(erpId)}" data-name="${escHtml(name)}">
            <div class="autocomplete-name">${escHtml(displayName)}</div>
            <div class="autocomplete-id">${idDisplay}</div>
          </div>`;
        }).join('');

        // 통합검색 힌트 아래에 고객사 후보 추가
        const existing = ac.innerHTML;
        ac.innerHTML = existing + itemsHtml;

        ac.querySelectorAll('.autocomplete-item:not(.autocomplete-unified)').forEach(item => {
          item.addEventListener('click', () => {
            const cleanName = (item.dataset.name || '').replace(/\s*\([^)]*\)\s*$/, '').trim();
            document.getElementById('accountInput').value = cleanName;
            ac.classList.add('hidden');
            doSearch([item.dataset.crmid], cleanName);
          });
        });
      } catch { /* 무시 */ }
    }, 300);
  }
}

// ── 초기화 ────────────────────────────────────────────────────────────
async function init() {
  // ── 팀 설정 로드 (owners, aiBase) ────────────────────────────────
  await new Promise(resolve => {
    browserAPI.storage.local.get(['owners', 'aiBase'], ({ owners, aiBase }) => {
      console.log('[CSM] storage.get owners:', owners ? `${owners.length}명` : 'null');
      if (Array.isArray(owners) && owners.length > 0) _owners = owners;
      if (aiBase) _aiBase = aiBase;
      resolve();
    });
  });
  renderOwnerTabs();

  // background에서 push하는 SSO 부트스트랩 단계를 진행상태 바에 표시
  const BOOTSTRAP_STEPS = {
    sso_start:   () => t('ssoStart'),
    sso_idp:     () => t('ssoIdp'),
    itsm_return: () => t('itsmReturn'),
  };
  browserAPI.runtime.onMessage.addListener((msg) => {
    if (msg.type === 'BOOTSTRAP_STATUS' && BOOTSTRAP_STEPS[msg.step]) {
      setProgress(BOOTSTRAP_STEPS[msg.step]());
    }
  });

  loadMyUser().catch(() => {});
  loadFavourites();
  loadSeenStates();

  // ── UI 언어 초기화 ────────────────────────────────────────────────
  browserAPI.storage.local.get('uiLang', ({ uiLang }) => {
    _uiLang = uiLang || detectBrowserLang();
    document.getElementById('uiLangSelect').value = _uiLang;
    applyI18n();
  });
  // UI 언어 변경 → AI 캐시 무효화 후 재실행
  document.getElementById('uiLangSelect').addEventListener('change', () => {
    _uiLang = document.getElementById('uiLangSelect').value;
    browserAPI.storage.local.set({ uiLang: _uiLang });
    applyI18n();
    if (selectedCase && _lastAiLang !== _uiLang) {
      _lastAiInsight = null;
      _lastAiLang = null;
      runAiInsight();
    }
  });


  // ── 설정 패널 ────────────────────────────────────────────────────
  const settingsPanel = document.getElementById('settingsPanel');
  document.getElementById('btnSettings').onclick = (e) => {
    e.stopPropagation();
    settingsPanel.classList.toggle('hidden');
  };
  document.getElementById('btnSettingsClose').onclick = () => {
    settingsPanel.classList.add('hidden');
  };
  document.addEventListener('click', (e) => {
    if (!settingsPanel.classList.contains('hidden') &&
        !e.target.closest('#settingsPanel') &&
        !e.target.closest('#btnSettings') &&
        !e.target.closest('#ownerEditorModal')) {
      settingsPanel.classList.add('hidden');
    }
  });

  // AI URL 입력 초기값 표시
  document.getElementById('settingsAiUrl').value = _aiBase === DEFAULT_AI_BASE ? '' : _aiBase;
  document.getElementById('settingsAiUrl').placeholder = DEFAULT_AI_BASE;

  initTeamSettings();

  // ── 테마 ─────────────────────────────────────────────────────────
  function applyTheme(theme) {
    if (theme === 'light') {
      document.documentElement.removeAttribute('data-theme');
    } else {
      document.documentElement.setAttribute('data-theme', theme);
    }
    document.querySelectorAll('.theme-btn').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.theme === theme);
    });
  }

  browserAPI.storage.local.get('theme', ({ theme }) => {
    applyTheme(theme || 'light');
  });

  document.querySelectorAll('.theme-btn').forEach(btn => {
    btn.onclick = () => {
      const theme = btn.dataset.theme;
      applyTheme(theme);
      browserAPI.storage.local.set({ theme });
    };
  });

  // ── 시작 탭 설정 ──────────────────────────────────────────────────
  // startTab 저장값: 'all' | 'favourite' | 'owner:N' (N = _owners 인덱스)

  function applyStartTab(key) {
    document.querySelectorAll('.start-tab-btn').forEach(b =>
      b.classList.toggle('active', b.dataset.key === key));
  }

  browserAPI.storage.local.get('startTab', async ({ startTab }) => {
    const key = startTabToOwnerKey(startTab);
    applyStartTab(key);
    document.querySelectorAll('.owner-tab').forEach(t => t.classList.remove('active'));
    const tab = document.querySelector(`.owner-tab[data-key="${key}"]`);
    if (tab) tab.classList.add('active');
    selectedOwnerKey = key;

    // 시작 탭 렌더링 완료까지 대기 (Notifications 제거: 알림 분기 없음)
    try {
      if (key === 'favourite') {
        await renderFavouriteList();
      } else {
        const owner = _owners.find(o => o.key === key);
        const ids = owner ? owner.ids : [...new Set(_owners.flatMap(o => o.ids))];
        await renderAccountList(ids);
      }
    } catch (error) {
      console.error('[CSM] Start tab render failed:', error);
    }

    // Notifications 제거(모바일): 로드 시 ITSM 케이스 폴링(checkUpdatesBackground)을 하지 않는다.
    // 세션 없을 때 저장 케이스 N개가 동시에 itsmFetch→probe(401)를 찍어 콘솔을 도배하고
    // storage quota를 넘기던 원인. 알림 기능 자체를 모바일에서 뺀다.
  });

  document.querySelectorAll('.start-tab-btn').forEach(btn => {
    btn.onclick = () => {
      const key = btn.dataset.key;
      applyStartTab(key);
      browserAPI.storage.local.set({ startTab: ownerKeyToStartTab(key) });
    };
  });

  // ── Favourite 백업/복원 ───────────────────────────────────────────
  document.getElementById('btnExportFav').onclick = () => {
    const data = JSON.stringify({ version: 1, favourites: _favourites }, null, 2);
    const blob = new Blob([data], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `csm-favourites-${new Date().toISOString().slice(0,10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  document.getElementById('importFavInput').onchange = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const obj = JSON.parse(ev.target.result);
        const imported = Array.isArray(obj.favourites) ? obj.favourites : (Array.isArray(obj) ? obj : null);
        if (!imported) { alert(t('favImportInvalid')); return; }
        const merged = [..._favourites];
        let added = 0;
        for (const f of imported) {
          const isDup = f.type === 'case'
            ? merged.some(m => m.type === 'case' && m.sysId === f.sysId)
            : merged.some(m => m.type !== 'case' && String(m.crmId) === String(f.crmId));
          if (!isDup) { merged.push(f); added++; }
        }
        _favourites = merged;
        saveFavourites();
        alert(`${t('favImportDone')}: ${added}${t('favImportAdded')} ${_favourites.length}${t('favImportTotal')}`);
        if (selectedOwnerKey === 'favourite') renderFavouriteList();
        updateFavouriteBtn();
      } catch { alert(t('favImportError')); }
    };
    reader.readAsText(file);
    e.target.value = '';
  };

  // 이벤트
  document.getElementById('btnRefresh').onclick = () => {
    const btn = document.getElementById('btnRefresh');
    btn.style.transition = 'transform 0.4s';
    btn.style.transform = 'rotate(360deg)';
    setTimeout(() => { btn.style.transition = ''; btn.style.transform = ''; }, 420);

    if (_currentView === 'account') {
      // 고객사 목록 화면 → 목록 재렌더
      if (selectedOwnerKey === 'favourite') {
        renderFavouriteList();
      } else {
        const owner = _owners.find(o => o.key === selectedOwnerKey);
        const ids = owner ? owner.ids : [...new Set(_owners.flatMap(o => o.ids))];
        renderAccountList(ids);
      }
    } else if (_lastTargets && _lastTargets.length) {
      // 케이스 목록 화면 → 현재 고객사 케이스 재조회
      doSearch(_lastTargets.map(t => t.crmId), _lastTargets.length === 1 ? _lastTargets[0].name : undefined);
    }
  };

  document.getElementById('btnSearch').onclick = async () => {
    const q = document.getElementById('accountInput').value.trim();
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('[CSM] 🔍 btnSearch 클릭');
    console.log('[CSM] 입력값:', JSON.stringify(q));
    console.log('[CSM] 길이:', q.length);
    console.log('[CSM] 패턴 테스트:');
    console.log('  /^\\d{6,7}$/.test(q):', /^\d{6,7}$/.test(q));
    console.log('  /^CS\\d{6,}/i.test(q):', /^CS\d{6,}/i.test(q));
    console.log('  /^\\d+\\/\\d{4}$/.test(q):', /^\d+\/\d{4}$/.test(q));
    console.log('[CSM] koreaAccounts:', koreaAccounts ? '로드됨' : 'null');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

    document.getElementById('autocomplete').classList.add('hidden');
    if (!q) {
      if (_lastTargets) doSearch(_lastTargets.map(t => t.crmId), _lastTargets.length === 1 ? _lastTargets[0].name : undefined);
      return;
    }

    // 세션 확인 — 없으면 획득 후 재실행
    if (!myUserId) {
      console.log('[CSM] 세션 없음, loadMyUser 시작');
      setProgress(t('ssoStart') || '세션 획득 중…');
      try {
        await loadMyUser();
        setProgress('');
      } catch (e) {
        setProgress('');
        alert(t('loginError') || '로그인 실패. 페이지를 새로고침하세요.');
        return;
      }
      if (!myUserId) {
        alert(t('loginError') || '세션을 가져올 수 없습니다.');
        return;
      }
    }

    // 명확한 케이스 번호 패턴(CS접두사, 연도형, 14자리+) → 케이스 직접 검색
    if (/^CS\d{6,}/i.test(q) || /^\d+\/\d{4}$/.test(q) || /^\d{14,}$/.test(q)) {
      console.log('[CSM] → searchCaseDirectly (CS/연도형/14자리)');
      searchCaseDirectly(q);
      return;
    }

    // 6~7자리 숫자 → 케이스 번호로만 간주 (CRM ID는 고객사 리스트에서만)
    if (/^\d{6,7}$/.test(q)) {
      console.log('[CSM] → searchCaseDirectly (6~7자리 케이스)');
      searchCaseDirectly(q);
      return;
    }

    // 그 외 모두 → 통합 검색 (고객사 + 케이스 혼합)
    console.log('[CSM] → searchUnified');
    searchUnified(q);
  };

  // status 필터 변경 → 클라이언트 재필터 (서버 재조회 없음)
  document.querySelectorAll('.status-chk').forEach(chk => {
    chk.addEventListener('change', () => {
      applyComponentFilter();
    });
  });

  // 기간 필터 변경 → 서버 재조회
  document.getElementById('periodSelect').addEventListener('change', () => {
    if (_lastTargets?.length) {
      doSearch(_lastTargets.map(t => t.crmId), _lastTargets.length === 1 ? _lastTargets[0].name : undefined);
    }
  });

  // component 필터 변경 → 클라이언트 재필터 (서버 재조회 없음) + ONE360 탭 재로드
  document.querySelectorAll('.comp-chk').forEach(chk => {
    chk.addEventListener('change', () => {
      // BDC/BTP/Other 3개 독립 토글. 상호배제 없음(전부 체크=전체).
      // Cases 탭에서만 case 재필터. ONE360 탭에선 캐시 기반 클라 재렌더만
      // (renderCaseList→showView('cases')가 탭을 바꾸므로 cases 탭 점프 방지).
      if (_accountDetailTab === 'cases') {
        if (_rawCases.length) applyComponentFilter();
      } else if (_selectedAccount) {
        if (_accountDetailTab === 'contract' && _contractAll) renderContract();
        else if (_accountDetailTab === 'cacv' && _cacvAll) renderCACV();
        else if (_accountDetailTab === 'consumption' && _consumptionAll) renderConsumption();
      }
    });
  });

  // 고객사 상세 탭(Contract/cACV/Consumption/Cases) 전환
  document.querySelectorAll('.account-detail-tab').forEach(tab => {
    tab.addEventListener('click', () => {
      if (!_selectedAccount) return;
      _accountDetailTab = tab.dataset.tab;
      applyDetailTabVisibility();
      if (_accountDetailTab === 'contract') loadContract();
      else if (_accountDetailTab === 'cacv') loadCACV();
      else if (_accountDetailTab === 'consumption') loadConsumption();
      else if (_accountDetailTab === 'cases') { if (currentCases.length) renderCaseList(currentCases); }
    });
  });

  document.getElementById('btnBackMain').onclick = () => {
    currentCases = [];
    document.getElementById('resultCount').textContent = '';
    _selectedAccount = null;              // 고객사 컨텍스트 초기화
    _accountDetailTab = 'cases';
    _contractAll = _cacvAll = _consumptionAll = null; // ONE360 캐시 무효화
    if (selectedOwnerKey === 'favourite') {
      renderFavouriteList();
      return;
    }
    const owner = _owners.find(o => o.key === selectedOwnerKey);
    const ids = owner ? owner.ids : [...new Set(_owners.flatMap(o => o.ids))];
    renderAccountList(ids);
  };

  document.getElementById('accountInput').addEventListener('input', handleAccountInput);
  document.getElementById('accountInput').addEventListener('keydown', e => {
    if (e.key === 'Enter') document.getElementById('btnSearch').click();
    if (e.key === 'Escape') document.getElementById('autocomplete').classList.add('hidden');
  });
  document.addEventListener('click', e => {
    if (!e.target.closest('#accountInput') && !e.target.closest('#autocomplete')) {
      document.getElementById('autocomplete').classList.add('hidden');
    }
  });

  // 담당자 탭 동적 렌더 + 이벤트 바인딩 (renderOwnerTabs 에서 처리)

  // Favourite 추가/해제 버튼
  document.getElementById('btnAddFavourite').addEventListener('click', () => {
    if (!_lastTargets || _lastTargets.length !== 1) return;
    const { crmId, name } = _lastTargets[0];
    if (isFavourite(crmId)) {
      removeFavourite(crmId);
    } else {
      addFavourite(crmId, name);
    }
    updateFavouriteBtn();
  });

  // 상세 패널
  document.getElementById('btnCloseDetail').onclick = closeDetail;
  document.getElementById('btnRefreshDetail').onclick = () => {
    if (!selectedCase) return;
    const btn = document.getElementById('btnRefreshDetail');
    btn.style.transition = 'transform 0.4s';
    btn.style.transform = 'rotate(360deg)';
    setTimeout(() => { btn.style.transition = ''; btn.style.transform = ''; }, 420);
    const tab = _activeDetailTab;
    if (tab === 'attachments') {
      loadAttachments(selectedCase.sys_id);
    } else {
      openDetail(selectedCase).then(() => switchDetailTab(tab));
    }
  };
  document.getElementById('btnAi').onclick = runAiInsight;
  document.getElementById('btnCopyAi').addEventListener('click', async (e) => {
    e.stopPropagation();
    copyAiFull(_lastAiInsight);
    const btn = document.getElementById('btnCopyAi');
    const orig = btn.innerHTML;
    btn.textContent = t('copied2');
    setTimeout(() => { btn.innerHTML = orig; }, 1400);
  });

  // 케이스 제목 복사 (correlation_display + short_description)
  document.getElementById('btnCopyTitle').addEventListener('click', (e) => {
    e.stopPropagation();
    if (!selectedCase) return;
    const caseNum = selectedCase.correlation_display || selectedCase.number || '';
    const title = selectedCase.short_description || '';
    const copyVal = `${caseNum} ${title}`.trim();
    if (!copyVal) return;
    navigator.clipboard.writeText(copyVal).then(() => {
      const btn = document.getElementById('btnCopyTitle');
      btn.textContent = '✅';
      setTimeout(() => { btn.innerHTML = `<svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor"><path d="M11 2H5a1 1 0 0 0-1 1v9a1 1 0 0 0 1 1h6a1 1 0 0 0 1-1V3a1 1 0 0 0-1-1zM5 1h6a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V3a2 2 0 0 1 2-2z"/><path d="M3 4H2a1 1 0 0 0-1 1v9a1 1 0 0 0 1 1h6a1 1 0 0 0 1-1v-1H8v1H2V5h1V4z"/></svg>`; }, 1200);
    });
  });

  // 담당자 이메일 복사
  document.getElementById('btnCopyAssignee').addEventListener('click', (e) => {
    e.stopPropagation();
    // 이메일 있으면 이메일, 없으면 사번(괄호 안 I-number) 추출
    let copyVal = selectedCase?._assigneeEmail || '';
    if (!copyVal) {
      const raw = selectedCase?.assigned_to || '';
      const m = raw.match(/\(([A-Za-z0-9]+)\)\s*$/);
      copyVal = m ? m[1] : raw;
    }
    if (!copyVal) return;
    navigator.clipboard.writeText(copyVal).then(() => {
      const btn = document.getElementById('btnCopyAssignee');
      btn.textContent = '✅';
      setTimeout(() => { btn.innerHTML = `<svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor"><path d="M11 2H5a1 1 0 0 0-1 1v9a1 1 0 0 0 1 1h6a1 1 0 0 0 1-1V3a1 1 0 0 0-1-1zM5 1h6a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V3a2 2 0 0 1 2-2z"/><path d="M3 4H2a1 1 0 0 0-1 1v9a1 1 0 0 0 1 1h6a1 1 0 0 0 1-1v-1H8v1H2V5h1V4z"/></svg>`; }, 1200);
    });
  });

  // 메모 타입 토글
  document.querySelectorAll('.memo-type-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.memo-type-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      _memoType = btn.dataset.type;
      document.getElementById('memoTypeNotice').textContent = _memoType === 'internal'
        ? t('memoInternal')
        : t('memoExternal');
    });
  });

  // 메모 저장 → ITSM PATCH
  document.getElementById('btnSaveMemo').onclick = async () => {
    if (!selectedCase) return;
    const text = document.getElementById('memoInput').value.trim();
    if (!text) return;
    const btn = document.getElementById('btnSaveMemo');
    btn.disabled = true;
    btn.textContent = '…';
    const field = _memoType === 'internal' ? 'work_notes' : 'comments';
    try {
      await itsmFetch(`/api/now/table/sn_customerservice_case/${selectedCase.sys_id}__PATCH__${JSON.stringify({ [field]: text })}`);
      // journal에 임시 append → 히스토리 즉시 반영
      const typeLabel = _memoType === 'internal' ? 'Work notes' : 'Additional comments';
      const now = new Date().toISOString().replace('T', ' ').slice(0, 19);
      const newEntry = `\n${now} - ${myUserName || 'Me'} (${typeLabel})\n${text}`;
      if (selectedCase) {
        selectedCase._journal = newEntry + '\n' + (selectedCase._journal || '');
        renderMemoHistory(selectedCase._journal);
      }
      document.getElementById('memoInput').value = '';
      btn.textContent = '✅';
      setTimeout(() => { btn.textContent = t('add'); btn.disabled = false; }, 1500);
    } catch (e) {
      btn.disabled = false;
      btn.textContent = t('add');
      alert(`${t('memoFailed')}: ${e.message}`);
    }
  };

  // Retrieve Case — External Info 메시지 입력 후 케이스를 In Progress로 전환
  document.getElementById('btnRetrieveCase').onclick = () => {
    if (!selectedCase) return;
    const DEFAULT_MSG = 'Returning to SAP for further processing.';
    const overlay = document.createElement('div');
    overlay.className = 'retrieve-overlay';
    overlay.innerHTML = `
      <div class="retrieve-modal">
        <div class="retrieve-modal-title">Retrieve Case</div>
        <p class="retrieve-modal-desc">External Info로 저장되며 케이스가 In Progress로 변경됩니다.</p>
        <textarea id="retrieveMsgInput" class="memo-input" rows="3">${DEFAULT_MSG}</textarea>
        <div class="retrieve-modal-actions">
          <button id="btnRetrieveSubmit" class="btn-primary btn-sm">Retrieve</button>
          <button id="btnRetrieveCancel" class="btn-ghost btn-sm">Cancel</button>
        </div>
      </div>`;
    document.body.appendChild(overlay);
    document.getElementById('btnRetrieveCancel').onclick = () => overlay.remove();
    overlay.onclick = (e) => { if (e.target === overlay) overlay.remove(); };
    document.getElementById('btnRetrieveSubmit').onclick = async () => {
      const msg = document.getElementById('retrieveMsgInput').value.trim();
      if (!msg) return;
      const submitBtn = document.getElementById('btnRetrieveSubmit');
      submitBtn.disabled = true;
      submitBtn.textContent = '…';
      try {
        const r = await fetch(getRetrieveCaseUrl(), {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ sysCaseId: selectedCase.sys_id, message: msg })
        });
        const data = await r.json();
        if (!r.ok) throw new Error(data.error || r.status);
        overlay.remove();
        alert('✅ Retrieve Case 완료 — 케이스가 In Progress로 변경되었습니다.');
      } catch (e) {
        submitBtn.disabled = false;
        submitBtn.textContent = 'Retrieve';
        alert('❌ 실패: ' + e.message);
      }
    };
  };

  // 첨부 파일 선택
  document.getElementById('attachFileInput').addEventListener('change', (e) => {
    const files = e.target.files;
    const nameEl = document.getElementById('attachFileName');
    const uploadBtn = document.getElementById('btnUploadAttach');
    if (files.length) {
      nameEl.textContent = files.length === 1 ? files[0].name : `${files.length}${t('filesCount')}`;
      uploadBtn.disabled = false;
    } else {
      nameEl.textContent = '';
      uploadBtn.disabled = true;
    }
  });

  // 첨부 업로드 버튼
  document.getElementById('btnUploadAttach').addEventListener('click', async () => {
    if (!selectedCase) return;
    const input = document.getElementById('attachFileInput');
    const files = Array.from(input.files);
    if (!files.length) return;
    const progress = document.getElementById('attachUploadProgress');
    const uploadBtn = document.getElementById('btnUploadAttach');
    uploadBtn.disabled = true;
    progress.classList.remove('hidden');
    for (let i = 0; i < files.length; i++) {
      progress.textContent = `${t('uploadProgress')} (${i + 1}/${files.length}) ${files[i].name}`;
      try {
        await uploadAttachment(selectedCase.sys_id, files[i]);
      } catch (e) {
        alert(`${files[i].name} ${t('uploadFailed')}: ${e.message}`);
      }
    }
    progress.classList.add('hidden');
    input.value = '';
    document.getElementById('attachFileName').textContent = '';
    uploadBtn.disabled = true;
    // 목록 새로고침
    _attachSysId = null;
    loadAttachments(selectedCase.sys_id);
  });

  // 상세 탭 전환
  document.querySelectorAll('.detail-tab').forEach(btn => {
    btn.addEventListener('click', () => switchDetailTab(btn.dataset.tab));
  });

  // MCC / Watch 버튼 — HTML에 정적으로 있음
  document.getElementById('btnMcc').onclick = openMccModal;
  document.getElementById('btnWatch').onclick = toggleWatchPanel;
  document.getElementById('btnWatchClose').onclick = () => {
    document.getElementById('watchPanel').classList.add('hidden');
  };

  // 상세화면 Favourite 버튼
  document.getElementById('btnFavCase').onclick = async () => {
    if (!selectedCase) return;
    const btn = document.getElementById('btnFavCase');
    if (isFavouriteCase(selectedCase.sys_id)) {
      await removeFavouriteCase(selectedCase.sys_id);
      btn.textContent = '☆'; btn.classList.remove('active');
    } else {
      await addFavouriteCase(selectedCase);
      btn.textContent = '⭐'; btn.classList.add('active');
    }
    // 목록 아이템 별표도 동기화
    document.querySelectorAll(`.case-fav-btn[data-sysid="${selectedCase.sys_id}"]`).forEach(b => {
      b.textContent = isFavouriteCase(selectedCase.sys_id) ? '⭐' : '☆';
      b.classList.toggle('active', isFavouriteCase(selectedCase.sys_id));
    });
  };
}

document.addEventListener('DOMContentLoaded', init);

// ── 담당자 탭 동적 렌더 ─────────────────────────────────────────────
function renderOwnerTabs() {
  const scrollEl = document.getElementById('ownerTabsScroll');
  scrollEl.innerHTML = '';
  _owners.forEach((o, idx) => {
    const btn = document.createElement('button');
    btn.className = 'owner-tab';
    btn.dataset.key = o.key;
    btn.dataset.idx = idx;
    btn.textContent = o.name.split(' ')[0];
    btn.addEventListener('click', async () => {
      document.querySelectorAll('.owner-tab').forEach(t => t.classList.remove('active'));
      btn.classList.add('active');
      selectedOwnerKey = o.key;
      currentCases = [];
      document.getElementById('resultCount').textContent = '';
      // 고객사 상세 컨텍스트 초기화 — 진행 중이던 ONE360 로드 결과가 리스트에
      // 섞여 렌더되는 것 방지(btnBackMain과 동일). 로드 함수의 stale 가드와 병행.
      _selectedAccount = null;
      _accountDetailTab = 'cases';
      _contractAll = _cacvAll = _consumptionAll = null;
      await renderAccountList(o.ids);
    });
    scrollEl.appendChild(btn);
  });

  // 고정 탭(all, favourite) 이벤트 바인딩
  document.querySelectorAll('.owner-tab-fixed').forEach(tab => {
    tab.onclick = async () => {
      document.querySelectorAll('.owner-tab').forEach(t => t.classList.remove('active'));
      tab.classList.add('active');
      selectedOwnerKey = tab.dataset.key;
      currentCases = [];
      document.getElementById('resultCount').textContent = '';
      // 고객사 상세 컨텍스트 초기화(위 담당자 탭과 동일 이유).
      _selectedAccount = null;
      _accountDetailTab = 'cases';
      _contractAll = _cacvAll = _consumptionAll = null;
      if (selectedOwnerKey === 'favourite') {
        await renderFavouriteList();
      } else {
        const ids = [...new Set(_owners.flatMap(o => o.ids))];
        await renderAccountList(ids);
      }
    };
  });

  // 시작탭 버튼도 동적으로 재구성
  renderStartTabButtons();
}

// ── 시작탭 버튼 동적 렌더 ──────────────────────────────────────────
function renderStartTabButtons() {
  const row = document.getElementById('startTabRow');
  row.innerHTML = '';

  const fixed = [
    { key: 'all', label: () => t('tabAll') },
    { key: 'favourite', label: () => '⭐ Favourite' }
  ];

  const addBtn = (key, label) => {
    const btn = document.createElement('button');
    btn.className = 'start-tab-btn';
    btn.dataset.key = key;
    btn.textContent = label;
    btn.onclick = () => {
      document.querySelectorAll('.start-tab-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      browserAPI.storage.local.set({ startTab: ownerKeyToStartTab(key) });
    };
    row.appendChild(btn);
    return btn;
  };

  addBtn('all', t('tabAll'));
  _owners.forEach(o => addBtn(o.key, o.name.split(' ')[0]));
  addBtn('favourite', '⭐ Favourite');

  // 현재 저장된 시작탭 active 표시
  browserAPI.storage.local.get('startTab', ({ startTab }) => {
    const key = startTabToOwnerKey(startTab);
    document.querySelectorAll('.start-tab-btn').forEach(b =>
      b.classList.toggle('active', b.dataset.key === key));
  });
}

// ── 설정 — 팀원 관리 UI ────────────────────────────────────────────
function initTeamSettings() {
  renderTeamList();

  document.getElementById('btnAddOwner').onclick = () => openOwnerEditor(null);
  document.getElementById('btnResetOwners').onclick = () => {
    const btn = document.getElementById('btnResetOwners');
    if (btn.dataset.confirmPending === '1') {
      browserAPI.storage.local.remove('owners', () => {
        _owners = [...DEFAULT_OWNERS.map(o => ({ ...o, ids: [...o.ids] }))];
        renderTeamList();
        renderOwnerTabs();
        btn.textContent = '↺ Reset';
        btn.style.color = '';
        delete btn.dataset.confirmPending;
      });
    } else {
      btn.dataset.confirmPending = '1';
      btn.textContent = '✓ Sure?';
      btn.style.color = 'var(--error)';
    }
  };
  document.getElementById('settingsAiUrl').addEventListener('change', e => {
    _aiBase = e.target.value.trim().replace(/\/$/, '') || DEFAULT_AI_BASE;
    browserAPI.storage.local.set({ aiBase: _aiBase });
  });
}

function renderTeamList() {
  const list = document.getElementById('ownerList');
  list.innerHTML = '';
  _owners.forEach((o, idx) => {
    const row = document.createElement('div');
    row.className = 'owner-list-row';
    row.innerHTML = `
      <div class="owner-list-info">
        <span class="owner-list-name">${escHtml(o.name)}</span>
        <span class="owner-list-count">${o.ids.length} accounts</span>
      </div>
      <div class="owner-list-actions">
        <button class="btn-ghost btn-xs" data-idx="${idx}" data-action="edit">✏️</button>
        <button class="btn-ghost btn-xs owner-del-btn" data-idx="${idx}" data-action="delete">🗑</button>
      </div>`;
    list.appendChild(row);
  });

  list.querySelectorAll('[data-action="edit"]').forEach(btn => {
    btn.onclick = (e) => {
      e.stopPropagation();
      openOwnerEditor(parseInt(btn.dataset.idx));
    };
  });
  list.querySelectorAll('[data-action="delete"]').forEach(btn => {
    btn.onclick = (e) => {
      e.stopPropagation();
      const idx = parseInt(btn.dataset.idx);
      const row = btn.closest('.owner-list-row');
      // 인라인 확인 — confirm() 쓰면 포커스 이동으로 설정패널이 닫힘
      if (row.dataset.confirmPending === '1') {
        _owners.splice(idx, 1);
        saveOwners();
        renderTeamList();
        renderOwnerTabs();
      } else {
        row.dataset.confirmPending = '1';
        btn.textContent = '✓ Sure?';
        btn.style.color = 'var(--error)';
      }
    };
  });
}

async function doAccSearch(q, owner, searchInput, resultsEl, onSelect) {
  try {
    // ITSM customer_account 글로벌 검색 (메인 autocomplete와 동일 패턴)
    const isNumeric = /^\d+$/.test(q);
    const query = isNumeric
      ? `u_sap_crm_bp_numberSTARTSWITH${encodeURIComponent(q)}^ORnumberSTARTSWITH${encodeURIComponent(q)}`
      : `nameCONTAINS${encodeURIComponent(q)}`;
    const path = `/api/now/table/customer_account?sysparm_query=${query}^ORDERBYDESCu_sap_crm_bp_number&sysparm_fields=name,number,u_sap_crm_bp_number&sysparm_exclude_reference_link=true&sysparm_limit=10`;
    const resp = await new Promise((resolve, reject) => {
      itsmFetch(path).then(resolve).catch(reject);
    });
    if (searchInput.value.trim() !== q) return; // stale
    const results = (resp?.result || [])
      .sort((a, b) => (b.u_sap_crm_bp_number ? 1 : 0) - (a.u_sap_crm_bp_number ? 1 : 0));
    if (!results.length) {
      resultsEl.innerHTML = '<div class="acc-result-searching">No results</div>';
      return;
    }
    resultsEl.innerHTML = results.map(a => {
      const crmId = a.u_sap_crm_bp_number || a.number || '';
      const name = (a.name || '').replace(/\s*\([^)]*\)\s*$/, '').trim();
      const crmStr = crmId.replace(/^0+/, '');
      return `<div class="acc-result-item" data-crmid="${escHtml(crmId)}" data-name="${escHtml(a.name || '')}">
        <span class="acc-result-name">${escHtml(name)}</span>
        <span class="acc-result-id">CRM ${escHtml(crmStr)}</span>
      </div>`;
    }).join('');
    resultsEl.querySelectorAll('.acc-result-item').forEach(el => {
      el.onclick = (e) => { e.stopPropagation(); onSelect(el.dataset.crmid); };
    });
  } catch (err) {
    if (searchInput.value.trim() === q) {
      resultsEl.innerHTML = `<div class="acc-result-searching">Error: ${escHtml(err.message)}</div>`;
    }
  }
}

function openOwnerEditor(idx) {
  const isNew = idx === null;
  const owner = isNew ? { key: '', name: '', ids: [] } : { ..._owners[idx], ids: [..._owners[idx].ids] };

  const modal = document.getElementById('ownerEditorModal');
  // 모달 내부 클릭이 document까지 bubbling되면 settingsPanel 닫힘 — 차단
  document.querySelector('#ownerEditorModal .modal-box').onclick = (e) => e.stopPropagation();
  document.getElementById('ownerEditorTitle').textContent = isNew ? 'Add Member' : 'Edit Member';
  document.getElementById('ownerNameInput').value = owner.name;
  renderOwnerAccountList(owner.ids);

  // 계정 검색
  const searchInput = document.getElementById('ownerAccSearch');
  searchInput.value = '';
  document.getElementById('ownerAccResults').innerHTML = '';

  let _accSearchTimer = null;
  searchInput.oninput = () => {
    clearTimeout(_accSearchTimer);
    const q = searchInput.value.trim();
    const resultsEl = document.getElementById('ownerAccResults');
    if (q.length < 2) { resultsEl.innerHTML = ''; return; }
    resultsEl.innerHTML = '<div class="acc-result-searching">Searching…</div>';
    _accSearchTimer = setTimeout(() => doAccSearch(q, owner, searchInput, resultsEl, (crmId) => {
      if (!owner.ids.includes(crmId)) {
        owner.ids.push(crmId);
        renderOwnerAccountList(owner.ids);
      }
      searchInput.value = '';
      resultsEl.innerHTML = '';
    }), 350);
  };

  document.getElementById('btnOwnerEditorSave').onclick = (e) => {
    e.stopPropagation();
    const name = document.getElementById('ownerNameInput').value.trim();
    if (!name) { alert('Name is required'); return; }
    const key = name.toLowerCase().replace(/\s+/g, '_').replace(/[^a-z0-9_]/g, '');
    if (isNew) {
      _owners.push({ key, name, ids: owner.ids });
    } else {
      _owners[idx] = { key: _owners[idx].key, name, ids: owner.ids };
    }
    saveOwners();
    renderTeamList();
    // renderOwnerTabs 후 현재 선택 탭 active 복원
    const prevKey = selectedOwnerKey;
    renderOwnerTabs();
    document.querySelectorAll('.owner-tab').forEach(t => {
      t.classList.toggle('active', t.dataset.key === prevKey || (prevKey === 'all' && t.dataset.key === 'all'));
    });
    // account 뷰일 때만 재렌더 (케이스/상세 보는 중이면 건드리지 않음)
    if (_currentView === 'account') {
      const updatedOwner = _owners.find(o => o.key === prevKey);
      if (updatedOwner) renderAccountList(updatedOwner.ids);
    }
    modal.classList.add('hidden');
  };

  document.getElementById('btnOwnerEditorCancel').onclick = (e) => { e.stopPropagation(); modal.classList.add('hidden'); };
  document.getElementById('btnOwnerEditorCancel2').onclick = (e) => { e.stopPropagation(); modal.classList.add('hidden'); };
  modal.classList.remove('hidden');

  function renderOwnerAccountList(ids) {
    document.getElementById('ownerAccList').innerHTML = ids.length === 0
      ? '<span class="owner-acc-empty">No accounts yet</span>'
      : ids.map((id, i) => {
          const accs = koreaAccounts || [];
          const acc = accs.find(a => String(a.crmId) === String(id));
          const label = acc ? acc.name.replace(/\s*\([^)]*\)\s*$/, '').trim() : id;
          return `<span class="owner-acc-chip">${escHtml(label)} <button class="chip-del" data-i="${i}">×</button></span>`;
        }).join('');

    document.getElementById('ownerAccList').querySelectorAll('.chip-del').forEach(btn => {
      btn.onclick = (e) => {
        e.stopPropagation();
        owner.ids.splice(parseInt(btn.dataset.i), 1);
        renderOwnerAccountList(owner.ids);
      };
    });
  }
}

function saveOwners() {
  browserAPI.storage.local.set({ owners: _owners }, () => {
    if (browserAPI.runtime.lastError) {
      console.error('[CSM] saveOwners 실패:', browserAPI.runtime.lastError.message);
    } else {
      console.log('[CSM] saveOwners OK, count:', _owners.length, _owners.map(o => `${o.name}(${o.ids.length})`));
    }
  });
}

// Notifications 제거(모바일): 폴백/기본 시작탭을 'all'로. 'notifications'가 저장돼 있던
// 기존 사용자도 'all'로 수렴시켜 알림 렌더 경로로 못 들어가게 한다.
function ownerKeyToStartTab(key) {
  if (key === 'all' || key === 'favourite') return key;
  const idx = _owners.findIndex(o => o.key === key);
  return idx >= 0 ? `owner:${idx}` : 'all';
}

function startTabToOwnerKey(val) {
  if (val === 'notifications') return 'all';
  if (!val || val === 'all' || val === 'favourite') return val || 'all';
  if (val.startsWith('owner:')) {
    const idx = parseInt(val.slice(6), 10);
    return _owners[idx] ? _owners[idx].key : 'all';
  }
  const owner = _owners.find(o => o.key === val);
  return owner ? owner.key : 'all';
}

// ═══════════ Notifications 탭 로직 ═══════════
let _notifications = [];  // {id, caseNum, priority, summary, type, timestamp}

// 백그라운드 체크 (UI 업데이트 없이 조용히 실행)
async function checkUpdatesBackground() {
  try {
    await loadFavourites();
    const cases = _favourites.filter(f => f.type === 'case');

    // Favourite 케이스만 변경 체크
    if (cases.length > 0) {
      await checkCaseUpdates(cases);
    }

  } catch (error) {
    console.warn('[CSM] Background check error:', error);
  }
}

// 케이스 변경 체크 — Extension에서 직접 ITSM 조회
async function checkCaseUpdates(cases) {
  console.log(`[checkCaseUpdates] 요청: ${cases.length}개 케이스`);
  cases.forEach(c => console.log(`  - ${c.number}`));

  const { lastState } = await browserAPI.storage.local.get('lastState') || {};
  console.log(`[checkCaseUpdates] lastState 키: ${Object.keys(lastState || {}).length}개`);

  // Step 1: ITSM 직접 조회 (병렬)
  const currentStates = {};
  const chunks = chunkArray(cases, 5);

  // 케이스 번호 → 케이스 객체 맵 (고객명 등 정보 필요)
  const caseMap = {};
  cases.forEach(c => { caseMap[c.number] = c; });

  for (const chunk of chunks) {
    await Promise.all(chunk.map(async (c) => {
      try {
        const fields = 'state,priority,sys_updated_on,comments_and_work_notes,account,assigned_to,short_description';
        const data = await itsmFetch(
          `/api/now/table/sn_customerservice_case/${c.sysId}?sysparm_fields=${fields}&sysparm_display_value=true`
        );
        const raw = data?.result || {};

        currentStates[c.number] = {
          state: getStr(raw.state),
          priority: getStr(raw.priority),
          sys_updated_on: getStr(raw.sys_updated_on),
          last_journal: getStr(raw.comments_and_work_notes),
          account: getStr(raw.account),
          assignedTo: getStr(raw.assigned_to),
          title: getStr(raw.short_description)
        };
      } catch (error) {
        console.error(`[checkCaseUpdates] ${c.number} 조회 실패:`, error.message);
        currentStates[c.number] = null;
      }
    }));
  }

  console.log(`[checkCaseUpdates] 조회 완료: ${Object.keys(currentStates).length}개`);

  // Step 2: Diff 계산
  const changes = [];
  for (const [caseNum, current] of Object.entries(currentStates)) {
    if (!current) continue;
    const prev = (lastState || {})[caseNum];
    if (!prev) continue; // 첫 조회는 변경 아님

    const baseChange = {
      caseNum,
      title: current.title,
      priority: current.priority,
      account: current.account,
      assignedTo: current.assignedTo,
      timestamp: new Date().toISOString()
    };

    if (prev.state !== current.state) {
      changes.push({
        ...baseChange,
        type: 'state_change',
        oldState: prev.state,
        newState: current.state
      });
    } else if (prev.last_journal !== current.last_journal) {
      changes.push({
        ...baseChange,
        type: 'journal_update',
        newJournal: current.last_journal
      });
    } else if (prev.priority !== current.priority) {
      changes.push({
        ...baseChange,
        type: 'priority_change',
        oldPriority: prev.priority,
        newPriority: current.priority
      });
    }
  }

  console.log(`[checkCaseUpdates] 변경 감지: ${changes.length}건`);
  if (changes.length > 0) {
    changes.forEach(c => console.log(`  - ${c.caseNum}: ${c.type}`));
  }

  // Step 3: lastState 업데이트 (항상 업데이트 - 다음 조회 기준점)
  await browserAPI.storage.local.set({ lastState: currentStates });

  if (changes.length === 0) {
    console.log(`[checkCaseUpdates] 변경 없음`);
    return;
  }

  // Step 4: AI 분석 (의미있는 변경만 필터링)
  try {
    const response = await fetch(`${_aiBase}/api/ai/analyze-changes`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ changes })
    });

    if (!response.ok) {
      const errorText = await response.text().catch(() => 'unknown');
      console.warn('[checkCaseUpdates] AI 분석 실패:', response.status, errorText);
      return;
    }

    const { updates } = await response.json();
    console.log(`[checkCaseUpdates] AI 분석 완료: ${updates.length}건 의미있는 변경`);

    if (updates && updates.length > 0) {
      updates.forEach(u => console.log(`  [알림] ${u.caseNum}: ${u.type} - ${u.summary}`));
      await addNotifications(updates);
    }
  } catch (error) {
    console.error('[checkCaseUpdates] AI 분석 오류:', error);
  }
}

function chunkArray(arr, size) {
  const chunks = [];
  for (let i = 0; i < arr.length; i += size) {
    chunks.push(arr.slice(i, i + size));
  }
  return chunks;
}

// 알림 추가 헬퍼
async function addNotifications(updates) {
  const { notifications } = await browserAPI.storage.local.get('notifications') || {};
  const existing = notifications || [];

  const newNotifs = updates.map(u => ({
    id: `${u.caseNum}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
    ...u
  }));

  // 같은 케이스의 기존 알림 제거 (최신 것만 유지)
  const newCaseNums = new Set(newNotifs.map(n => n.caseNum));
  const filtered = existing.filter(n => !newCaseNums.has(n.caseNum));

  _notifications = [...newNotifs, ...filtered].slice(0, 50);
  await browserAPI.storage.local.set({ notifications: _notifications });
  updateNotifBadge();
}

async function checkUpdates() {
  const notifBusy = document.getElementById('notifBusy');
  const notifEmpty = document.getElementById('notifEmpty');
  const notifList = document.getElementById('notifList');

  // 로딩 표시
  notifBusy.classList.remove('hidden');
  notifEmpty.classList.add('hidden');
  notifList.classList.add('hidden');

  try {
    // 즐겨찾기 케이스 목록
    const cases = _favourites.filter(f => f.type === 'case');
    if (cases.length === 0) {
      notifBusy.classList.add('hidden');
      notifEmpty.classList.remove('hidden');
      return;
    }

    // checkCaseUpdates 호출 (ITSM 조회 + AI 분석)
    await checkCaseUpdates(cases);

    notifBusy.classList.add('hidden');

  } catch (error) {
    console.error('Check updates failed:', error);
    notifBusy.classList.add('hidden');
    notifEmpty.textContent = t('itsmError');
    notifEmpty.classList.remove('hidden');
  }
}

async function renderNotifications() {
  const startKey = selectedOwnerKey;

  const tabContent = document.getElementById('tabNotifications');
  const accountList = document.getElementById('accountList');
  const caseList = document.getElementById('caseList');
  const emptyState = document.getElementById('emptyState');
  const errorState = document.getElementById('errorState');
  const notifBusy = document.getElementById('notifBusy');
  const notifEmpty = document.getElementById('notifEmpty');
  const notifList = document.getElementById('notifList');
  const notifItems = document.getElementById('notifItems');

  // 다른 탭 숨기기
  accountList.classList.add('hidden');
  caseList.classList.add('hidden');
  emptyState.classList.add('hidden');
  errorState.classList.add('hidden');
  tabContent.classList.remove('hidden');

  // Favourite 케이스가 있으면 업데이트 체크 실행
  await loadFavourites();

  // ⚠️ 탭 변경 감지 → 렌더링 중단
  if (selectedOwnerKey !== startKey) {
    console.log(`[renderNotifications] 탭 변경 감지, 렌더링 중단`);
    return;
  }

  const favCases = _favourites.filter(f => f.type === 'case');
  if (favCases.length > 0) {
    notifBusy.classList.remove('hidden');
    notifEmpty.classList.add('hidden');
    notifList.classList.add('hidden');
    await checkUpdates();

    // ⚠️ checkUpdates 완료 후에도 탭 확인
    if (selectedOwnerKey !== startKey) {
      console.log(`[renderNotifications] checkUpdates 완료 후 탭 변경 감지, 렌더링 중단`);
      return;
    }

    notifBusy.classList.add('hidden');
  }

  // 저장된 알림 로드
  const { notifications } = await browserAPI.storage.local.get('notifications') || {};
  _notifications = notifications || [];

  if (_notifications.length === 0) {
    notifEmpty.classList.remove('hidden');
    notifList.classList.add('hidden');
    return;
  }

  // 알림 렌더링
  notifEmpty.classList.add('hidden');
  notifList.classList.remove('hidden');

  notifItems.innerHTML = '';
  _notifications.forEach(n => {
    notifItems.appendChild(createNotificationItem(n));
  });

  // Clear All 버튼
  document.getElementById('btnClearAllNotif').onclick = clearAllNotifications;
}

function createNotificationItem(notif) {
  const div = document.createElement('div');
  div.className = 'notif-item';
  div.dataset.priority = notif.priority;
  div.dataset.id = notif.id;

  // 우선순위 아이콘
  const icons = { high: '🔴', medium: '🟡', low: '🟢' };
  const icon = document.createElement('span');
  icon.className = 'notif-icon';
  icon.textContent = icons[notif.priority] || '⚪';

  // 본문
  const body = document.createElement('div');
  body.className = 'notif-body';

  const caseNum = document.createElement('div');
  caseNum.className = 'notif-case';
  caseNum.textContent = notif.caseNum;

  // 케이스 제목
  const title = document.createElement('div');
  title.className = 'notif-title';
  title.textContent = notif.title || '(제목 없음)';

  const summary = document.createElement('div');
  summary.className = 'notif-summary';
  summary.textContent = notif.summary;

  // 추가 정보 (고객명, 담당자)
  const info = document.createElement('div');
  info.className = 'notif-info';
  const infoParts = [];
  if (notif.account) infoParts.push(`🏢 ${notif.account}`);
  if (notif.assignedTo) infoParts.push(`👤 ${notif.assignedTo}`);
  info.textContent = infoParts.join(' | ');

  const meta = document.createElement('div');
  meta.className = 'notif-meta';

  const time = document.createElement('span');
  time.className = 'notif-time';
  time.textContent = `🕐 ${formatTimeAgo(notif.timestamp)}`;

  const type = document.createElement('span');
  type.className = 'notif-type';
  type.textContent = t(`notifType${capitalize(notif.type)}`);

  meta.appendChild(time);
  meta.appendChild(type);

  body.appendChild(caseNum);
  body.appendChild(title);
  body.appendChild(summary);
  if (info.textContent) body.appendChild(info);
  body.appendChild(meta);

  // 삭제 버튼
  const actions = document.createElement('div');
  actions.className = 'notif-actions';

  const delBtn = document.createElement('button');
  delBtn.className = 'notif-del';
  delBtn.textContent = '✕';
  delBtn.onclick = (e) => {
    e.stopPropagation();
    deleteNotification(notif.id);
  };

  actions.appendChild(delBtn);

  // 클릭 시 케이스 상세 열기 (알림은 유지 - 사용자가 X로 명시적 삭제만 가능)
  div.onclick = () => {
    navigateToCase(notif.caseNum, notif);
  };

  div.appendChild(icon);
  div.appendChild(body);
  div.appendChild(actions);

  return div;
}

async function deleteNotification(id) {
  _notifications = _notifications.filter(n => n.id !== id);
  await browserAPI.storage.local.set({ notifications: _notifications });
  updateNotifBadge();

  // DOM에서 해당 알림만 제거 (전체 새로고침 안 함)
  const notifItem = document.querySelector(`.notif-item[data-id="${id}"]`);
  if (notifItem) {
    notifItem.remove();
  }

  // 알림이 모두 삭제되면 빈 상태 표시
  if (_notifications.length === 0) {
    document.getElementById('notifEmpty').classList.remove('hidden');
    document.getElementById('notifList').classList.add('hidden');
  }
}

async function clearAllNotifications() {
  _notifications = [];
  await browserAPI.storage.local.set({ notifications: [] });
  updateNotifBadge();
  await renderNotifications();
}

function updateNotifBadge() {
  const badge = document.getElementById('notifBadge');
  if (!badge) return; // DOM이 아직 준비 안 됐거나 사이드패널이 닫힌 상태
  const count = _notifications.length;
  badge.textContent = count;
  badge.dataset.count = count;
}

async function navigateToCase(caseNum, notifObj = null) {
  // 케이스 상세 열기
  // 1. 현재 목록(currentCases)에서 찾기
  let caseObj = currentCases.find(c => c.number === caseNum);

  // 2. 없으면 _favourites에서 찾기
  if (!caseObj) {
    const fav = _favourites.find(f => f.type === 'case' && f.number === caseNum);
    if (fav) {
      // favourite 객체는 title 필드를 사용하지만, openDetail은 short_description을 기대
      caseObj = {
        ...fav,
        short_description: fav.title,
        sys_id: fav.sysId
      };
    }
  }

  // 3. 여전히 없으면 ITSM 직접 조회
  if (!caseObj) {
    try {
      console.log(`[navigateToCase] ${caseNum} ITSM 조회 중...`);
      const data = await itsmFetch(
        `/api/now/table/sn_customerservice_case?sysparm_query=number=${caseNum}&sysparm_display_value=true&sysparm_fields=number,short_description,state,priority,account.name,sys_id,sys_updated_on`
      );

      if (data?.result && data.result.length > 0) {
        const raw = data.result[0];
        caseObj = normalizeCase(raw);
      } else {
        console.error(`[navigateToCase] ${caseNum} 조회 결과 없음`);
        alert(`케이스를 찾을 수 없습니다: ${caseNum}`);
        return;
      }
    } catch (error) {
      console.error('[navigateToCase] ITSM 조회 실패:', error);
      alert(`케이스 조회 실패: ${error.message}`);
      return;
    }
  }

  // 케이스 상세 화면 열기 (기존 openDetail 함수 사용)
  // loadCaseDetail은 c.sys_id를 사용하지만, 일부 케이스 객체는 sysId (카멜케이스) 사용
  if (!caseObj.sys_id && caseObj.sysId) {
    caseObj.sys_id = caseObj.sysId;
  }

  await openDetail(caseObj);
  await loadCaseDetail(caseObj);
}

function capitalize(str) {
  return str.charAt(0).toUpperCase() + str.slice(1);
}

function formatTimeAgo(isoString) {
  const now = new Date();
  const time = new Date(isoString);
  const diffMs = now - time;
  const diffMins = Math.floor(diffMs / 60000);
  if (diffMins < 1) return '방금 전';
  if (diffMins < 60) return `${diffMins}분 전`;
  const diffHours = Math.floor(diffMins / 60);
  if (diffHours < 24) return `${diffHours}시간 전`;
  const diffDays = Math.floor(diffHours / 24);
  return `${diffDays}일 전`;
}

// Notifications 제거(모바일): 새로고침 시 백그라운드 케이스 체크를 하지 않는다.


// ══════════════════════════════════════════════════════════════════════════
// ── ONE360 탭 (Contract / cACV / Consumption) — Chrome 원본에서 포팅 ──────
//    데이터 조회는 background.js의 ONE360 핸들러(직접 fetch) 경유.
//    chrome.* → browserAPI.* 치환됨. 렌더 서브시스템(_viewStack)을 먼저 선언.
// ══════════════════════════════════════════════════════════════════════════

// ── ONE360 Drilldown (Obsidian Sidebar Pattern) ──────────────────────────
// ══════════════════════════════════════════════════════════════════════════

/**
 * Navigation stack for drilldown UI.
 * stack[0] = root panel (SA cards)
 * stack[1+] = drilled panels (metric details, charts)
 */
const _viewStack = [];

// ══════════════════════════════════════════════════════════════════════════
// ── ONE360 직접 fetch 인프라 (ITSM itsmFetch와 동일: popup 컨텍스트 직접 fetch) ──
//    iOS Safari는 background hidden 탭/service worker가 없으므로 ITSM처럼
//    popup에서 직접 fetch(credentials:'include')로 one360.for.sap 쿠키를 쓴다.
//    세션 없음(401/403) 시 ITSM retriggerSso와 동일하게 현재 탭을 one360으로
//    리다이렉트해 SAP SSO 쿠키를 세팅한 뒤 재시도한다.
// ══════════════════════════════════════════════════════════════════════════
const ONE360_HOST = 'one360.for.sap';
const ONE360_APP_ID = 'a65523c8-ea3d-4cfb-ada1-7aa8c137998b';

// ONE360 세션 확보/유효성/대기는 통합 SessionManager(window.CSMSession)가 담당한다.
// ONE360 config 등록은 one360FilterBlock/one360Params 정의 뒤에서 수행한다(아래 참조).

// ONE360 API 필터 블록 생성 (background 원본과 동일)
function one360FilterBlock(values) {
  return [{
    connectionOperator: 'AND', operator: 'AND',
    properties: { immutable: false, showInFrontend: true },
    values: values.map((v, i) => ({
      column: v.column, operator: v.operator || 'IN', values: v.values,
      isFilledFromContext: true, filterBlockId: 'runtimeFilterBlock',
      isDatablockFilter: false, connectionOperator: 'AND',
      isNucleusFilter: true, nucleusFilterId: `nucleus_id_${i}`,
    })),
    filterBlockId: 'runtimeFilterBlock', isFilledFromContext: false,
  }];
}

// ONE360 API 파라미터 생성 (background 원본과 동일)
function one360Params(extras = []) {
  return [
    { parameter: 'RESPONSIBILITY_SCENARIO', values: ['381'], isNucleusParameterValue: true, nucleusParameterId: 'p_rs' },
    { parameter: 'IN_CURRENCY', values: ['EUR'], isNucleusParameterValue: true, nucleusParameterId: 'p_cur' },
    ...extras,
  ];
}

// SA 키 → 컴포넌트 버킷('BDC'|'BTP'|'OTHER'). 응답 row에 _saBucket 태깅용.
function saBucketOf(saKey) {
  const s = String(saKey || '').toUpperCase();
  if (s.startsWith('SADA') || s.includes('DATA & AI') || s.includes('DATA AND AI') || s.includes('BAIP')) return 'BDC';
  if (s.startsWith('SABTP') || s.includes('BUSINESS TECHNOLOGY') || /\bBTP\b/.test(s)) return 'BTP';
  return 'OTHER';
}

// ── ONE360 config 등록 (통합 SessionManager에 주입) ──────────────────────
// 세션 확보/유효성/대기는 window.CSMSession이 담당. ONE360는 토큰 없이 쿠키만 쓰므로
// 유효성 프로브 = 검증된 ACCOUNT datablock의 축소판(CRMAccountID 1컬럼, limit:1, redirect:'manual').
// ssoDomainsRe에 itsm 도메인을 포함시켜 ITSM 탭/IdP를 뺏지 않게 한다(상호 조정).
const ONE360_ACCOUNT_DB = 'cc604004-e0ba-427c-828f-4898564b2987';
window.CSMSession.registerSystem({
  key: 'one360',
  loginUrl: 'https://one360.for.sap/',
  ssoDomainsRe: window.CSMSession.makeSsoDomainsRe(['one360\\.for\\.sap', 'itsm\\.services\\.sap']),
  needsToken: false,
  probe: async (cfg) => {
    const payload = {
      columns: ['CRMAccountID'],
      filters: one360FilterBlock([{ column: 'CRMAccountID', values: ['0000000001'] }]),
      sortSteps: [], parameterValues: one360Params(), offset: 0, limit: 1,
    };
    let r;
    try {
      r = await fetch(
        `https://${ONE360_HOST}/api/datablocks/v1/apps/${ONE360_APP_ID}/datablocks/${ONE360_ACCOUNT_DB}/fetch-data?version=453`,
        {
          method: 'POST', credentials: 'include', redirect: 'manual',
          headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
          body: JSON.stringify(payload),
        }
      );
    } catch (_) { return { state: 'invalid' }; }
    const state = window.CSMSession._classifyProbe({
      status: r.status, type: r.type, finalUrl: r.url, ssoDomainsRe: cfg.ssoDomainsRe,
      contentType: r.headers && r.headers.get ? r.headers.get('content-type') : null,
    });
    return { state };
  },
});

// datablock fetch 1회. 상태코드/Response를 그대로 돌려줌(판정은 상위 one360Fetch).
async function one360FetchOnce(dbId, payload, host, version) {
  const url = `https://${host}/api/datablocks/v1/apps/${ONE360_APP_ID}/datablocks/${dbId}/fetch-data?version=${version}`;
  const r = await fetch(url, {
    method: 'POST',
    credentials: 'include',
    redirect: 'manual',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify(payload),
  });
  return r;
}

// ONE360 datablock fetch (popup 직접 호출). 세션 확보/대기는 CSMSession.ensureSession이 담당.
// 세션 확보 후 실제 조회 → 그 사이 끊겼으면(401/403/400/405/opaqueredirect) 1회 재확보+재시도.
// 반환: rows 배열. 세션 확보 실패/HTML 응답이면 throw.
async function one360Fetch(dbId, payload, host = ONE360_HOST, version = '453') {
  if (!(await window.CSMSession.ensureSession('one360'))) {
    throw new Error('ONE360 세션 확보 실패 — Safari에서 one360.for.sap 로그인 상태를 확인하세요.');
  }
  let r;
  try {
    r = await one360FetchOnce(dbId, payload, host, version);
  } catch (e) {
    throw new Error(`ONE360 네트워크 오류: ${e.message}`);
  }
  // ensureSession 직후 세션이 끊긴 희박한 경우 1회 재확보 + 재시도.
  if (r.type === 'opaqueredirect' || r.status === 0
      || r.status === 400 || r.status === 401 || r.status === 403 || r.status === 405) {
    if (await window.CSMSession.ensureSession('one360')) {
      try { r = await one360FetchOnce(dbId, payload, host, version); }
      catch (e) { throw new Error(`ONE360 네트워크 오류: ${e.message}`); }
    }
  }
  if (!r.ok) {
    const txt = await r.text().catch(() => '');
    throw new Error(`ONE360 ${r.status}: ${txt.slice(0, 200)}`);
  }
  const ct = r.headers && r.headers.get ? r.headers.get('content-type') : null;
  if (ct && /text\/html/i.test(ct)) {
    throw new Error('ONE360 로그인 필요(HTML 응답)');
  }
  const data = await r.json();
  return data?.rows || [];
}

// ── ONE360 조회 래퍼 (background 핸들러 로직을 popup으로 이식. 반환 형태 {ok,...} 유지) ──
async function one360GetAccount(crmId) {
  const paddedId = String(crmId).replace(/^0+/, '').padStart(10, '0');
  const payload = {
    columns: ['SAPViewTopParent', 'CRMAccountName_title', 'CRMAccountID'],
    filters: one360FilterBlock([{ column: 'CRMAccountID', values: [paddedId] }]),
    sortSteps: [], parameterValues: one360Params(), offset: 0, limit: 1,
  };
  const rows = await one360Fetch('cc604004-e0ba-427c-828f-4898564b2987', payload);
  if (!rows.length) throw new Error(`CRM ${crmId} not found (padded: ${paddedId})`);
  const v = rows[0].values;
  return { ok: true, account: { accountId: v.CRMAccountID, customerName: v.CRMAccountName_title, guAccountId: v.SAPViewTopParent } };
}

async function one360GetContract(accountId) {
  const payload = {
    columns: ['Account_ID', 'InitialOrder', 'Order', 'SalesDocumentType', 'Item_Past_Current_Future',
              'Status', 'Contract_Start_Date_Item_', 'Contract_End_Date_Item_', 'MaterialID',
              'Quantity', 'Sales_Doc_Type_value', 'Renewal_Type',
              'Active_ACV_Restricted', 'TCV_Restricted', 'Sub_Solution_Area', 'Solution_Area_ID'],
    filters: one360FilterBlock([
      { column: 'Account_ID', values: [accountId] },
      { column: 'Item_Past_Current_Future', values: ['Current', 'Future'] },
    ]),
    sortSteps: [
      { column: 'InitialOrder', direction: 'ASC', alwaysApply: true, properties: {}, isDatablockSortStep: false },
      { column: 'Order', direction: 'ASC', alwaysApply: true, properties: {}, isDatablockSortStep: false },
      { column: 'Contract_Start_Date_Item_', direction: 'ASC', alwaysApply: true, properties: {}, isDatablockSortStep: false },
    ],
    parameterValues: one360Params(), offset: 0, limit: 500,
  };
  const rows = await one360Fetch('b00b40d0-317e-429b-8047-c590c7be7285', payload);
  (rows || []).forEach(r => { r._saBucket = saBucketOf((r.values || r).Solution_Area_ID || ''); });
  return { ok: true, rows: rows || [] };
}

async function one360GetConsumption(accountId, guId) {
  const payload = {
    columns: ['Account_ID', 'Solution_Area', 'Solution_Area_ID', 'MetricID', 'MetricText',
              '_Used_1CSW', '_Licensed', '_ActualMeasured', 'Metric_Status_Text', 'Unlimited_Entitlement_Flag'],
    filters: one360FilterBlock([
      { column: 'Account_ID', values: [accountId] },
      { column: 'GU_Account', values: [guId] },
      { column: 'Current_Record', values: ['X'] },
      { column: 'Current_Record_Valid', values: ['Yes'] },
    ]),
    sortSteps: [{ column: 'MetricID', direction: 'ASC', alwaysApply: true, properties: {}, isDatablockSortStep: false }],
    parameterValues: [{ parameter: 'RESPONSIBILITY_SCENARIO', values: ['381'], isNucleusParameterValue: true, nucleusParameterId: 'p_rs' }],
    offset: 0, limit: 500,
  };
  const rows = await one360Fetch('3d52861e-19c1-4812-b474-263af39b8385', payload);
  (rows || []).forEach(r => {
    const saId = (r.values || r).Solution_Area_ID || '';
    r._saBucket = saBucketOf(saId); r._saId = saId;
  });
  return { ok: true, rows: rows || [] };
}

async function one360GetConsumptionTrend(accountId, saId, metricId) {
  const filterCols = [
    { column: 'Account_ID', values: [accountId] },
    { column: 'Solution_Area_ID', values: [saId] },
  ];
  if (metricId) filterCols.push({ column: 'MetricID', values: [metricId] });
  const payload = {
    columns: ['No_Utilized_Max_', 'No_Entitled_Max_', 'CalendarMonthYYYYMM', 'MetricID'],
    filters: one360FilterBlock(filterCols),
    sortSteps: [{ column: 'CalendarMonthYYYYMM', direction: 'ASC', alwaysApply: true, properties: {}, isDatablockSortStep: false }],
    parameterValues: [{ parameter: 'RESPONSIBILITY_SCENARIO', values: ['381'], isNucleusParameterValue: true, nucleusParameterId: 'p_rs' }],
    offset: 0, limit: 500,
  };
  const rows = await one360Fetch('3d52861e-19c1-4812-b474-263af39b8385', payload, ONE360_HOST, '456');
  return { ok: true, rows };
}

async function one360GetCACV(accountId, saFilter, year) {
  const filterConditions = [{ column: 'Account_ID', values: [accountId] }];
  if (saFilter.length > 0 && !(saFilter.includes('BDC') && saFilter.includes('BTP'))) {
    saFilter.forEach(sa => {
      const saKey = sa === 'BDC' ? `SADA.${year}` : (sa === 'BTP' ? `SABTP.${year}` : sa);
      filterConditions.push({ column: 'Solution_Area_ID', operator: 'IN', values: [saKey] });
    });
  }
  const payload = {
    columns: ['Month', 'Logical_Product_ID', 'Solution_Area_ID', 'Monthly_CACV_EUR_Budget_Current_Year_Financial_Restricted'],
    filters: one360FilterBlock(filterConditions),
    sortSteps: [{ column: 'Month', direction: 'DESC', alwaysApply: true, properties: {}, isDatablockSortStep: false }],
    parameterValues: [{ parameter: 'RESPONSIBILITY_SCENARIO', values: ['381'], isNucleusParameterValue: true, nucleusParameterId: 'p_rs' }],
    offset: 0, limit: 500,
  };
  const rows = await one360Fetch('e83fabf4-5ce6-4de4-856c-fadc14f5d1be', payload, ONE360_HOST, 'latest');
  (rows || []).forEach(r => { r._saBucket = saBucketOf((r.values || r).Solution_Area_ID || ''); });
  return { ok: true, rows };
}

/**
 * Panel structure (Obsidian pattern)
 * @typedef {Object} Panel
 * @property {string} heading - Panel title
 * @property {string} [subtitle] - Optional subtitle
 * @property {Section[]} sections - Content sections
 */

/**
 * Section structure (clickable card or detail view)
 * @typedef {Object} Section
 * @property {string} title - Section title
 * @property {string} [subtitle] - Optional subtitle
 * @property {Block[]} blocks - Content blocks
 * @property {Panel} [detail] - Drilldown target (makes section clickable)
 * @property {string} [sa] - Solution Area (for filtering)
 * @property {string} [group] - Category group (contract/cacv/consumption)
 */

/**
 * Block types (content primitives)
 * @typedef {Object} Block
 * @property {'kv'|'table'|'chart'|'text'|'spinner'} kind
 * @property {Array} [rows] - For kv/table
 * @property {Array} [columns] - For table
 * @property {string} [text] - For text/spinner
 * @property {Array} [labels] - For chart (x-axis)
 * @property {Array} [series] - For chart (datasets)
 * @property {'bar'|'line'} [mode] - Chart type
 * @property {'eur'|'int'} [valueFmt] - Value formatter
 */

/**
 * Navigate to a panel (push onto stack)
 */
function navigateTo(panel) {
  // 드릴다운 패널은 부모와 같은 탭 컨테이너에 그려야 한다.
  // 부모(현재 top)의 containerGroup을 상속시켜 renderCurrentPanel이 컨테이너를 찾도록 한다.
  const parent = _viewStack[_viewStack.length - 1];
  if (parent && !panel.containerGroup) {
    panel.containerGroup = resolveContainerGroup(parent);
  }
  _viewStack.push(panel);
  renderCurrentPanel();

  // 지연 로드 훅: 드릴다운 진입 시 1회 실행(예: Consumption 월별 트렌드 조회).
  // onEnter는 panel.sections를 채운 뒤 renderCurrentPanel()을 다시 부른다.
  if (typeof panel.onEnter === 'function' && !panel._entered) {
    panel._entered = true;
    Promise.resolve(panel.onEnter(panel)).then(() => {
      // 사용자가 그새 Back을 눌렀으면 재렌더하지 않는다.
      if (_viewStack[_viewStack.length - 1] === panel) renderCurrentPanel();
    }).catch(err => console.error('[navigateTo onEnter] 실패:', err));
  }
}

/**
 * 패널이 그려질 탭 컨테이너의 group 키를 결정한다.
 * 우선순위: panel.containerGroup → 첫 섹션의 group.
 */
function resolveContainerGroup(panel) {
  if (panel.containerGroup) return panel.containerGroup;
  const firstSection = panel.sections && panel.sections[0];
  return firstSection && firstSection.group;
}

/**
 * Go back (pop from stack)
 */
function goBack() {
  if (_viewStack.length > 1) {
    _viewStack.pop();
    renderCurrentPanel();
  }
}

/**
 * Render the current top panel
 */
function renderCurrentPanel() {
  if (_viewStack.length === 0) {
    console.warn('[renderCurrentPanel] viewStack 비어있음');
    return;
  }

  const panel = _viewStack[_viewStack.length - 1];
  const isRoot = _viewStack.length === 1;

  // Determine container based on group (contract/cacv/consumption).
  // 드릴다운 패널은 섹션에 group이 없을 수 있으므로 containerGroup(부모 상속)을 우선 사용한다.
  let container;
  const group = resolveContainerGroup(panel);
  console.log('[renderCurrentPanel] group:', group, 'isRoot:', isRoot);

  if (group === 'contract') {
    container = document.querySelector('#contractTab .overview-section-body');
  } else if (group === 'cacv') {
    container = document.querySelector('#cacvTab .overview-section-body');
  } else if (group === 'consumption') {
    container = document.querySelector('#consumptionTab .overview-section-body');
  }

  console.log('[renderCurrentPanel] container:', container ? 'found' : 'NOT FOUND');
  if (!container) return;

  // Clear and rebuild
  container.innerHTML = '';

  // Back button (only for drilled panels)
  if (!isRoot) {
    const backBtn = document.createElement('button');
    backBtn.className = 'one360-back-btn';
    backBtn.innerHTML = '← Back';
    backBtn.onclick = goBack;
    container.appendChild(backBtn);
  }

  // Panel heading
  if (panel.heading) {
    const headingDiv = document.createElement('div');
    headingDiv.className = 'one360-panel-heading';
    headingDiv.textContent = panel.heading;
    if (panel.subtitle) {
      const subtitleSpan = document.createElement('div');
      subtitleSpan.className = 'one360-panel-subtitle';
      subtitleSpan.textContent = panel.subtitle;
      headingDiv.appendChild(subtitleSpan);
    }
    container.appendChild(headingDiv);
  }

  // Render sections
  console.log('[renderCurrentPanel] sections:', panel.sections.length, 'isRoot:', isRoot);
  panel.sections.forEach((section, idx) => {
    console.log(`[renderSection#${idx}] title:`, section.title, 'hasDetail:', !!section.detail);
    const sectionEl = renderSection(section);
    container.appendChild(sectionEl);
  });
}

/**
 * Render a single section
 */
function renderSection(section) {
  const div = document.createElement('div');
  div.className = 'one360-section';

  // Make clickable if detail exists
  if (section.detail) {
    console.log('[renderSection] 드릴다운 클릭 이벤트 등록:', section.title);
    div.classList.add('one360-section-clickable');
    div.onclick = () => {
      console.log('[navigateTo] 드릴다운:', section.title);
      navigateTo(section.detail);
    };
  }

  // Title row
  const titleDiv = document.createElement('div');
  titleDiv.className = 'one360-section-title';
  titleDiv.textContent = section.title;
  div.appendChild(titleDiv);

  // Subtitle
  if (section.subtitle) {
    const subtitleDiv = document.createElement('div');
    subtitleDiv.className = 'one360-section-subtitle';
    subtitleDiv.textContent = section.subtitle;
    div.appendChild(subtitleDiv);
  }

  // Blocks
  if (section.blocks) {
    section.blocks.forEach(block => {
      const blockEl = renderBlock(block);
      if (blockEl) div.appendChild(blockEl);
    });
  }

  return div;
}

/**
 * Render a single block
 */
function renderBlock(block) {
  switch (block.kind) {
    case 'kv': return renderKvBlock(block);
    case 'table': return renderTableBlock(block);
    case 'chart': return renderChartBlock(block);
    case 'text': return renderTextBlock(block);
    case 'spinner': return renderSpinnerBlock(block);
    default: return null;
  }
}

/**
 * Render key-value pairs
 */
function renderKvBlock(block) {
  const div = document.createElement('div');
  div.className = 'one360-kv-block';

  block.rows.forEach(row => {
    const rowDiv = document.createElement('div');
    rowDiv.className = 'one360-kv-row';

    const labelSpan = document.createElement('span');
    labelSpan.className = 'one360-kv-label';
    labelSpan.textContent = row.label;

    const valueSpan = document.createElement('span');
    valueSpan.className = 'one360-kv-value';
    valueSpan.textContent = row.value;
    if (row.tone === 'warn') valueSpan.style.color = '#d32f2f';
    if (row.tone === 'ok') valueSpan.style.color = '#388e3c';

    rowDiv.appendChild(labelSpan);
    rowDiv.appendChild(valueSpan);
    div.appendChild(rowDiv);
  });

  return div;
}

/**
 * Render table
 */
function renderTableBlock(block) {
  const table = document.createElement('table');
  table.className = 'one360-table';

  // Header
  const thead = document.createElement('thead');
  const headerRow = document.createElement('tr');
  block.columns.forEach(col => {
    const th = document.createElement('th');
    th.textContent = col;
    headerRow.appendChild(th);
  });
  thead.appendChild(headerRow);
  table.appendChild(thead);

  // Body
  const tbody = document.createElement('tbody');
  block.rows.forEach(row => {
    const tr = document.createElement('tr');
    row.forEach(cell => {
      const td = document.createElement('td');
      td.textContent = typeof cell === 'object' ? cell.value : cell;
      tr.appendChild(td);
    });
    tbody.appendChild(tr);
  });
  table.appendChild(tbody);

  return table;
}

/**
 * Render chart (Chart.js)
 */
function renderChartBlock(block) {
  const wrapper = document.createElement('div');
  wrapper.className = 'one360-chart-wrapper';

  const canvas = document.createElement('canvas');
  wrapper.appendChild(canvas);

  // Format values
  const formatValue = (val) => {
    if (val == null) return null;
    if (block.valueFmt === 'eur') return Number(val).toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 });
    if (block.valueFmt === 'int') return Number(val).toLocaleString('en-US', { maximumFractionDigits: 0 });
    return val;
  };

  // Chart.js config
  const datasets = block.series.map(s => ({
    label: s.label,
    data: s.values,
    backgroundColor: s.tone === 'ok' ? '#4caf50' : s.tone === 'warn' ? '#ff9800' : '#0078d4',
    borderColor: s.tone === 'ok' ? '#388e3c' : s.tone === 'warn' ? '#f57c00' : '#005a9e',
    borderWidth: 1,
    tension: block.mode === 'line' ? 0.3 : 0
  }));

  const config = {
    type: block.mode === 'line' ? 'line' : 'bar',
    data: {
      labels: block.labels,
      datasets
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: datasets.length > 1 },
        tooltip: {
          callbacks: {
            label: (ctx) => {
              let label = ctx.dataset.label || '';
              if (label) label += ': ';
              const formatted = formatValue(ctx.parsed.y);
              label += block.valueFmt === 'eur' ? `€${formatted}` : formatted;
              return label;
            }
          }
        }
      },
      scales: block.showAxis ? {
        y: {
          beginAtZero: true,
          ticks: {
            callback: (val) => {
              const formatted = formatValue(val);
              return block.valueFmt === 'eur' ? `€${formatted}` : formatted;
            }
          }
        }
      } : false
    }
  };

  // Render after next tick (canvas needs to be in DOM)
  setTimeout(() => {
    new Chart(canvas, config);
  }, 0);

  return wrapper;
}

/**
 * Render text block
 */
function renderTextBlock(block) {
  const div = document.createElement('div');
  div.className = 'one360-text-block';
  div.textContent = block.text;
  return div;
}

/**
 * Render spinner (loading indicator)
 */
function renderSpinnerBlock(block) {
  const div = document.createElement('div');
  div.className = 'one360-spinner-block';
  div.innerHTML = `<div class="spinner"></div><span>${block.text || ''}</span>`;
  return div;
}


// ── ONE360 탭 공통 헬퍼 ──────────────────────────────────────────────
// 현재 체크된 컴포넌트 필터(BDC/BTP/OTHER)를 반환. 미선택이면 전체(안전 기본값).
function selectedComponents() {
  const checked = Array.from(document.querySelectorAll('.comp-chk:checked')).map(c => c.value);
  if (checked.length === 0) return ['BDC', 'BTP', 'OTHER'];
  return checked;
}

// 체크된 컴포넌트 → SA 매칭용 집합. BDC=Data&AI(SADA), BTP=BTP(SABTP), OTHER=그 외 전체.
function selectedSaNames() {
  const comps = selectedComponents();
  return { bdc: comps.includes('BDC'), btp: comps.includes('BTP'), other: comps.includes('OTHER') };
}

// row가 체크된 컴포넌트에 속하는지. background가 태깅한 _saBucket을 1순위로,
// 없으면(레거시 응답) SA 문자열 키워드 매칭(saMatches)으로 폴백.
function bucketMatches(row, active) {
  const bucket = row && row._saBucket;
  if (bucket === 'BDC') return active.bdc;
  if (bucket === 'BTP') return active.btp;
  if (bucket === 'OTHER') return active.other;
  // _saBucket 없음 → SA 문자열로 폴백.
  const v = (row && (row.values || row)) || {};
  const l = (row && row.labels) || {};
  const sa = l.Solution_Area_ID || v.Solution_Area_ID || v.Sub_Solution_Area || v.Solution_Area || '';
  return saMatches(sa, active);
}

// row의 SA 식별자(코드 SADA/SABTP 또는 이름)가 체크된 컴포넌트에 속하는지.
function saMatches(saValue, active) {
  const s = String(saValue || '').toUpperCase();
  const isBdc = s.includes('SADA') || s.includes('DATA & AI') || s.includes('DATA AND AI') || s.includes('BAIP');
  const isBtp = s.includes('SABTP') || s.includes('BUSINESS TECHNOLOGY') || s.includes('BTP');
  if (isBdc) return active.bdc;
  if (isBtp) return active.btp;
  // SA를 BDC/BTP로 분류 못하면(기타 SA) Other 버킷으로 취급.
  return active.other;
}

// _viewStack을 루트 패널로 리셋하고 렌더. (최초 로드/필터 변경 시 루트로 복귀)
function resetRootPanel(group, heading, sections) {
  _viewStack.length = 0;
  _viewStack.push({ heading, containerGroup: group, sections });
  renderCurrentPanel();
}

// 진입점: 캐시 없으면 서버 조회(BDC+BTP 전체) 후 렌더, 있으면 바로 렌더.
async function loadContract() {
  if (!_selectedAccount) return;
  const contractTab = document.getElementById('contractTab');
  if (!contractTab) return;
  const body = contractTab.querySelector('.overview-section-body');
  // stale 가드: 로드 시작 시점의 고객/탭을 캡처. await 후 바뀌었으면 render 중단
  // (담당자/탭 전환 중 뒤늦게 끝난 응답이 바뀐 화면에 섞여 그려지는 것 방지).
  const _crmId = _selectedAccount.crmId;
  const isStale = () => !_selectedAccount || _selectedAccount.crmId !== _crmId || _accountDetailTab !== 'contract';

  try {
    if (!_contractAll || _contractAll.crmId !== _selectedAccount.crmId) {
      body.textContent = '계약 정보 로딩 중...';
      // 항상 BDC+BTP 전체를 받아 캐시. SA 필터는 렌더 단계에서 클라이언트 적용.
      const accResp = await one360GetAccount(_crmId);
      if (isStale()) return;
      if (!accResp.ok) throw new Error(accResp.error);
      // 선택 고객(CRM) 기준으로만 조회. GU로 하면 계열사 전체가 섞임.
      const accountId = accResp.account.accountId;
      const resp = await one360GetContract(accountId);
      if (isStale()) return;
      if (!resp.ok) throw new Error(resp.error);
      _contractAll = { rows: resp.rows || [], accountId, crmId: _crmId };
    }
    if (isStale()) return;
    renderContract();
  } catch (err) {
    if (isStale()) return;
    console.error('[CSM] Contract 로드 실패:', err);
    body.innerHTML = `<div style="color: #c2185b; font-size: 12px;">오류: ${err.message}</div>`;
  }
}

// SA 필터(현재 체크된 컴포넌트) → 클라이언트 필터 → 상태별 그룹핑 → 루트 패널 build.
function renderContract() {
  const contractTab = document.getElementById('contractTab');
  if (!contractTab || !_contractAll) return;
  const body = contractTab.querySelector('.overview-section-body');

  const activeSaNames = selectedSaNames();
  const rows = (_contractAll.rows || []).filter(row => bucketMatches(row, activeSaNames));

  if (!rows.length) {
    body.innerHTML = '<div style="color: var(--text-muted); font-size: 12px;">계약 정보가 없습니다.</div>';
    resetRootPanel('contract', `${_selectedAccount.name} — Contract`, []);
    return;
  }

  // SA별 그룹핑. values(코드값)/labels(사람이 읽는 이름) 함께 보존.
  const bySa = {};
  rows.forEach(row => {
    const v = row.values || {};
    const l = row.labels || {};
    const sa = v.Sub_Solution_Area || 'Unknown';
    if (!bySa[sa]) bySa[sa] = [];
    bySa[sa].push({ v, l });
  });

  const sections = Object.entries(bySa).map(([sa, contracts]) => {
    // Root card: Material별 Order·수량·기간·상태·ACV 1줄 요약.
    const materialRows = contracts.map(({ v: c, l }) => {
      const acv = c.Active_ACV_Restricted || c.ACV || 0;
      const name = l.MaterialID || c.MaterialID || '-';
      const order = c.Order || c.InitialOrder || '-';
      const qty = Number(c.Quantity || 0).toLocaleString('en-US');
      const start = (c.Contract_Start_Date_Item_ || '').slice(0, 10) || '?';
      const end = (c.Contract_End_Date_Item_ || '').slice(0, 10) || '?';
      const status = c.Status || '-';
      return {
        label: `${name} (Order ${order})`,
        value: `Qty ${qty} · ${start} ~ ${end} · ${status} · ACV €${Number(acv).toLocaleString('en-US', { maximumFractionDigits: 0 })}`
      };
    });

    // Detail panel: 계약 상세 전체 필드. Order/Initial Order 포함(기본화면↔상세 매핑용).
    const detailSections = contracts.map(({ v: c, l }) => ({
      title: `${l.MaterialID || c.MaterialID || '-'} (Order ${c.Order || c.InitialOrder || '-'})`,
      blocks: [
        {
          kind: 'kv',
          rows: [
            { label: 'Order ID', value: c.Order || '-' },
            { label: 'Initial Order', value: c.InitialOrder || '-' },
            { label: 'Type', value: l.SalesDocumentType || c.SalesDocumentType || '-' },
            { label: 'Status', value: c.Status || '-' },
            { label: 'Start', value: c.Contract_Start_Date_Item_ || '-' },
            { label: 'End', value: c.Contract_End_Date_Item_ || '-' },
            { label: 'Quantity', value: (c.Quantity || 0).toLocaleString('en-US') },
            { label: 'ACV', value: `€${Number(c.Active_ACV_Restricted || c.ACV || 0).toLocaleString('en-US')}` },
            { label: 'TCV', value: `€${Number(c.TCV_Restricted || c.TCV || 0).toLocaleString('en-US')}` }
          ]
        }
      ]
    }));

    return {
      title: `계약 — ${sa}`,
      group: 'contract',
      sa,
      blocks: [
        { kind: 'kv', rows: materialRows },
        { kind: 'text', text: `계약 ${contracts.length}건 (클릭하여 상세)` }
      ],
      detail: { heading: `${sa} — 계약`, sections: detailSections }
    };
  });

  resetRootPanel('contract', `${_selectedAccount.name} — Contract`, sections);
}

// ── cACV 탭 데이터 로드 ──────────────────────────────────────────────
// 진입점: 캐시 없으면 서버 조회(BDC+BTP 전체) 후 렌더, 있으면 바로 렌더.
async function loadCACV() {
  if (!_selectedAccount) return;
  const cacvTab = document.getElementById('cacvTab');
  if (!cacvTab) return;
  const body = cacvTab.querySelector('.overview-section-body');
  // stale 가드(loadContract와 동일): await 후 고객/탭 바뀌었으면 render 중단.
  const _crmId = _selectedAccount.crmId;
  const isStale = () => !_selectedAccount || _selectedAccount.crmId !== _crmId || _accountDetailTab !== 'cacv';

  try {
    if (!_cacvAll || _cacvAll.crmId !== _selectedAccount.crmId) {
      body.textContent = 'cACV 정보 로딩 중...';
      const year = new Date().getFullYear();
      const accResp = await one360GetAccount(_crmId);
      if (isStale()) return;
      if (!accResp.ok) throw new Error(accResp.error);
      const accountId = accResp.account.accountId;  // Account ID (NOT GU ID!)
      // 항상 BDC+BTP 전체를 받아 캐시.
      const resp = await one360GetCACV(accountId, ['BDC', 'BTP'], year);
      if (isStale()) return;
      if (!resp.ok) throw new Error(resp.error);
      _cacvAll = { rows: resp.rows || [], accountId, crmId: _crmId };
    }
    if (isStale()) return;
    renderCACV();
  } catch (err) {
    if (isStale()) return;
    console.error('[CSM] cACV 로드 실패:', err);
    body.innerHTML = `<div style="color: #c2185b; font-size: 12px;">오류: ${err.message}</div>`;
  }
}

// SA 필터 → 클라이언트 필터 → 제품별 집계 → 루트 패널 build.
function renderCACV() {
  const cacvTab = document.getElementById('cacvTab');
  if (!cacvTab || !_cacvAll) return;
  const body = cacvTab.querySelector('.overview-section-body');

  const activeSaNames = selectedSaNames();
  const cacv = (_cacvAll.rows || []).filter(row => bucketMatches(row, activeSaNames));

  if (!cacv.length) {
    body.innerHTML = '<div style="color: var(--text-muted); font-size: 12px;">cACV 데이터가 없습니다.</div>';
    resetRootPanel('cacv', `${_selectedAccount.name} — cACV`, []);
    return;
  }

  {
    // SA별로 그룹핑 + 제품별 집계
    const bySa = {};
    cacv.forEach(row => {
      const v = row.values || row;
      const l = row.labels || {};
      // 제품명·SA는 사람이 읽는 label 우선 (one360-extract.js fetchCacv와 동일),
      // label 없으면 raw value(코드값)로 폴백.
      const sa = l.Solution_Area_ID || v.Solution_Area_ID || 'Unknown';
      const product = l.Logical_Product_ID || v.Logical_Product_ID || '(미상 제품)';
      const month = v.Month ? String(v.Month).slice(0, 7) : v.Month;
      const cacvValue = Number(v.Monthly_CACV_EUR_Budget_Current_Year_Financial_Restricted || 0);

      if (!bySa[sa]) {
        bySa[sa] = { products: {}, totalsByMonth: {}, months: new Set() };
      }

      if (!bySa[sa].products[product]) {
        bySa[sa].products[product] = { totalsByMonth: {}, months: new Set() };
      }

      bySa[sa].products[product].totalsByMonth[month] = (bySa[sa].products[product].totalsByMonth[month] || 0) + cacvValue;
      bySa[sa].products[product].months.add(month);
      bySa[sa].totalsByMonth[month] = (bySa[sa].totalsByMonth[month] || 0) + cacvValue;
      bySa[sa].months.add(month);
    });

    // Build root panel (Obsidian pattern)
    const sections = Object.entries(bySa).map(([sa, saData]) => {
      const months = Array.from(saData.months).sort();
      const latestMonth = months[months.length - 1];

      // Root card: 제품별 최근월 cACV
      const productRows = Object.entries(saData.products).map(([product, pData]) => {
        const latestValue = pData.totalsByMonth[latestMonth] || 0;
        return {
          label: product,
          value: `€${latestValue.toLocaleString('en-US', { maximumFractionDigits: 0 })} (${latestMonth})`
        };
      }).sort((a, b) => {
        const aVal = parseFloat(a.value.replace(/[€,]/g, ''));
        const bVal = parseFloat(b.value.replace(/[€,]/g, ''));
        return bVal - aVal;
      });

      // Detail panel: SA 전체 차트 + 제품별 차트
      const saChartSection = {
        title: '월별 추이',
        blocks: [
          {
            kind: 'chart',
            mode: 'bar',
            valueFmt: 'eur',
            showAxis: true,
            showValueLabels: true,
            labels: months,
            series: [{
              label: `${sa} cACV`,
              values: months.map(m => saData.totalsByMonth[m] || null),
              tone: 'ok'
            }]
          },
          {
            kind: 'table',
            columns: ['Month', 'SA Total (EUR)'],
            rows: months.map(m => [m, saData.totalsByMonth[m]?.toLocaleString('en-US') || '0'])
          }
        ]
      };

      const productSections = Object.entries(saData.products).map(([product, pData]) => {
        const pMonths = Array.from(pData.months).sort();
        return {
          title: product,
          blocks: [
            {
              kind: 'chart',
              mode: 'bar',
              valueFmt: 'eur',
              showAxis: true,
              showValueLabels: true,
              labels: pMonths,
              series: [{
                label: product,
                values: pMonths.map(m => pData.totalsByMonth[m] || null),
                tone: 'ok'
              }]
            },
            {
              kind: 'table',
              columns: ['Month', 'cACV (EUR)'],
              rows: pMonths.map(m => [m, pData.totalsByMonth[m]?.toLocaleString('en-US') || '0'])
            }
          ]
        };
      });

      return {
        title: `cACV — ${sa}`,
        group: 'cacv',
        sa,
        blocks: [
          { kind: 'kv', rows: productRows },
          { kind: 'text', text: `제품 ${Object.keys(saData.products).length}개 · 최근월 ${latestMonth} (클릭하여 추이)` }
        ],
        detail: {
          heading: `${sa} — cACV`,
          sections: [saChartSection, ...productSections]
        }
      };
    });

    resetRootPanel('cacv', `${_selectedAccount.name} — cACV`, sections);
  }
}

// ── Consumption 탭 데이터 로드 ────────────────────────────────────────
// 진입점: 캐시 없으면 서버 조회(BDC+BTP 전체) 후 렌더, 있으면 바로 렌더.
async function loadConsumption() {
  if (!_selectedAccount) return;
  const consumptionTab = document.getElementById('consumptionTab');
  if (!consumptionTab) return;
  const body = consumptionTab.querySelector('.overview-section-body');
  // stale 가드(loadContract와 동일): await 창이 가장 길어(트렌드 병렬 선조회) 레이스 위험 최대.
  const _crmId = _selectedAccount.crmId;
  const isStale = () => !_selectedAccount || _selectedAccount.crmId !== _crmId || _accountDetailTab !== 'consumption';

  try {
    if (!_consumptionAll || _consumptionAll.crmId !== _selectedAccount.crmId) {
      body.textContent = '사용량 정보 로딩 중...';
      const accResp = await one360GetAccount(_crmId);
      if (isStale()) return;
      if (!accResp.ok) throw new Error(accResp.error);
      const accountId = accResp.account.accountId;
      const guId = accResp.account.guAccountId;
      // 1단계: 메트릭 목록(항상 BDC+BTP 전체).
      const resp = await one360GetConsumption(accountId, guId);
      if (isStale()) return;
      if (!resp.ok) throw new Error(resp.error);
      const rows = resp.rows || [];

      // 2단계: 각 메트릭의 월별 트렌드를 병렬 선조회(sap-notepad 2단계 플로우).
      // 기본 카드 수치(used/sub)와 드릴다운 차트 모두 트렌드 최신월을 쓴다.
      body.textContent = '사용량 추이 조회 중...';
      const uniq = [];
      const seen = new Set();
      rows.forEach(r => {
        const v = r.values || r;
        const key = `${r._saId || v.Solution_Area_ID || ''}|${v.MetricID}`;
        if (v.MetricID && !seen.has(key)) { seen.add(key); uniq.push({ saId: r._saId || v.Solution_Area_ID, metricId: v.MetricID, bucket: r._saBucket }); }
      });
      const trendByMetric = {};
      await Promise.all(uniq.map(async ({ saId, metricId, bucket }) => {
        try {
          const tr = await one360GetConsumptionTrend(accountId, saId, metricId);
          if (tr.ok && tr.rows) trendByMetric[`${saId}|${metricId}`] = { rows: tr.rows, bucket, saId };
        } catch (_) { /* 개별 실패는 무시, 폴백 처리 */ }
      }));
      if (isStale()) return;

      _consumptionAll = { rows, accountId, guId, crmId: _crmId, trendByMetric };
    }
    if (isStale()) return;
    renderConsumption();
  } catch (err) {
    if (isStale()) return;
    console.error('[CSM] Consumption 로드 실패:', err);
    body.innerHTML = `<div style="color: #c2185b; font-size: 12px;">오류: ${err.message}</div>`;
  }
}

// SA 필터 → 클라이언트 필터 → SA별 그룹핑 → 루트 패널 build.
// 서비스(메트릭) 클릭 시 월별 트렌드를 지연 로드(onEnter)해 Chart.js 라인 차트로 표시.
function renderConsumption() {
  const consumptionTab = document.getElementById('consumptionTab');
  if (!consumptionTab || !_consumptionAll) return;
  const body = consumptionTab.querySelector('.overview-section-body');

  const activeSaNames = selectedSaNames();
  const metrics = (_consumptionAll.rows || []).filter(row => bucketMatches(row, activeSaNames));

  if (!metrics.length) {
    body.innerHTML = '<div style="color: var(--text-muted); font-size: 12px;">사용량 데이터가 없습니다.</div>';
    resetRootPanel('consumption', `${_selectedAccount.name} — Consumption`, []);
    return;
  }

  const trendByMetric = (_consumptionAll && _consumptionAll.trendByMetric) || {};

  // SA별로 그룹핑
  const bySa = {};
  metrics.forEach(row => {
    const v = row.values || {};
    const sa = v.Solution_Area || 'Unknown';
    const saId = row._saId || v.Solution_Area_ID || sa;
    if (!bySa[sa]) bySa[sa] = { saId, list: [] };
    bySa[sa].list.push({ v, saId });
  });

  const sections = Object.entries(bySa).map(([sa, { saId: saGroupId, list: mList }]) => {
    // Root card: 서비스별 트렌드 최신월 Used / Entitled (ratio%).
    // sap-notepad metricLatestEntry와 동일 — 메트릭 목록의 _Used_1CSW(비율)가 아니라
    // 트렌드 최신월 No_Utilized_Max_ / No_Entitled_Max_를 쓴다.
    const serviceRows = mList.map(({ v: m, saId }) => {
      const label = m.MetricText || m.MetricID;
      const unlimited = m.Unlimited_Entitlement_Flag === 'X';
      const latest = latestTrendPoint(trendByMetric[`${saId}|${m.MetricID}`]);
      // 트렌드 최신월 우선, 없으면 메트릭 목록의 실제값(_ActualMeasured) 폴백. _Used_1CSW(비율)는 미사용.
      const used = latest ? latest.used : Number(m._ActualMeasured ?? 0);
      const sub = latest ? latest.sub : Number(m._Licensed ?? 0);
      if (unlimited) return { label, value: '무제한', tone: undefined };
      const ratio = sub > 0 ? Math.round((used / sub) * 100) : undefined;
      const parts = [used.toLocaleString('en-US'), sub.toLocaleString('en-US')].join(' / ');
      const value = parts + (ratio != null ? ` (${ratio}%)` : '');
      return { label, value, tone: ratioTone(ratio) };
    });

    // 메트릭별 드릴다운 섹션 — 선조회 캐시로 즉시 차트 구성(지연 로드 불필요).
    const detailSections = mList.map(({ v: m, saId }) => {
      const cached = trendByMetric[`${saId}|${m.MetricID}`];
      const title = m.MetricText || m.MetricID;
      if (!cached || !cached.rows || !cached.rows.length) {
        return { title, blocks: [{ kind: 'text', text: '월별 추이 데이터가 없습니다.' }] };
      }
      const pts = cached.rows
        .map(r => r.values || r)
        .sort((a, b) => String(a.CalendarMonthYYYYMM).localeCompare(String(b.CalendarMonthYYYYMM)));
      const months = pts.map(p => fmtMonth(p.CalendarMonthYYYYMM));
      const measured = pts.map(p => Number(p.No_Utilized_Max_ || 0));
      const subscribed = pts.map(p => Number(p.No_Entitled_Max_ || 0));
      return {
        title,
        blocks: [
          {
            kind: 'chart', mode: 'line', showAxis: true, labels: months,
            series: [
              { label: 'Used', values: measured, tone: 'ok' },
              { label: 'Entitled', values: subscribed, tone: 'warn' }
            ]
          },
          {
            kind: 'table', columns: ['Month', 'Used', 'Entitled', '%'],
            rows: pts.map((p, i) => {
              const r = subscribed[i] > 0 ? Math.round((measured[i] / subscribed[i]) * 100) + '%' : '';
              return [months[i], measured[i].toLocaleString('en-US'), subscribed[i].toLocaleString('en-US'), r];
            })
          }
        ]
      };
    });

    return {
      title: `사용량 — ${sa}`,
      group: 'consumption',
      sa,
      blocks: [
        { kind: 'kv', rows: serviceRows },
        { kind: 'text', text: `서비스 ${mList.length}개 (클릭하여 추이)` }
      ],
      detail: { heading: `${sa} — 사용량`, sections: detailSections }
    };
  });

  resetRootPanel('consumption', `${_selectedAccount.name} — Consumption`, sections);
}

// 트렌드 캐시 엔트리 → 최신월 { used, sub }. (No_Utilized_Max_ / No_Entitled_Max_)
function latestTrendPoint(entry) {
  if (!entry || !entry.rows || !entry.rows.length) return null;
  const pts = entry.rows
    .map(r => r.values || r)
    .sort((a, b) => String(a.CalendarMonthYYYYMM).localeCompare(String(b.CalendarMonthYYYYMM)));
  const last = pts[pts.length - 1];
  if (!last) return null;
  return { used: Number(last.No_Utilized_Max_ || 0), sub: Number(last.No_Entitled_Max_ || 0) };
}

// 사용률 톤 (sap-notepad ratioTone과 동일): >=100 danger, >=85 warn, else ok.
function ratioTone(ratio) {
  if (ratio == null) return undefined;
  if (ratio >= 100) return 'warn';
  if (ratio >= 85) return 'warn';
  return 'ok';
}

// YYYYMM 또는 YYYY-MM-DD → YYYY-MM
function fmtMonth(raw) {
  const s = String(raw || '');
  if (/^\d{6}$/.test(s)) return `${s.slice(0, 4)}-${s.slice(4, 6)}`;
  return s.slice(0, 7);
}

// 페이지 로드 시 notifications 배지 초기화
(async () => {
  const { notifications } = await browserAPI.storage.local.get('notifications') || {};
  _notifications = notifications || [];
  updateNotifBadge();
})();
