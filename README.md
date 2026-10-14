# CSM Case Dashboard - iOS Safari Extension

> 기존 Chrome Extension을 iOS Safari Extension으로 변환한 버전입니다.

## 📱 요구사항

- **Mac**: Xcode 13+ 설치 필요
- **iPhone**: iOS 15 이상
- **Apple ID**: 무료 계정도 가능 (7일마다 재설치 필요)

## 🚀 빠른 시작

### 1. Xcode 프로젝트 생성

```bash
cd /Users/woosuk/Projects/csm_dashboard_app/CSMDashboard-iOS
```

그 다음:
1. Xcode에서 `File > New > Project` 실행
2. `iOS > App` 선택
3. 프로젝트 이름: `CSMDashboard`
4. 저장 위치: 현재 폴더
5. Safari Extension 타겟 추가

**자세한 가이드는 `SETUP.md` 참조**

### 2. iPhone에 설치

1. iPhone을 Mac에 연결
2. Xcode에서 `Command + R` (빌드 및 실행)
3. iPhone 설정 > Safari > 확장 프로그램 > CSM Dashboard 켜기
4. Safari에서 ITSM 사이트 접속 후 Extension 실행!

## 📂 프로젝트 구조

```
CSMDashboard-iOS/
├── CSMDashboard/          # iOS 앱 (Extension 설치용 껍데기)
│   ├── CSMDashboardApp.swift
│   ├── ContentView.swift
│   └── Info.plist
├── Extension/             # Safari Extension (메인 로직)
│   ├── manifest.json      # Extension 설정
│   ├── background.js      # 백그라운드 스크립트 (ITSM API)
│   ├── popup.html         # 메인 UI
│   ├── sidepanel.js       # UI 로직 (168KB)
│   ├── sidepanel.css      # 스타일 (16KB)
│   ├── icons/             # 아이콘
│   ├── korea-accounts.json
│   ├── SafariExtensionHandler.swift
│   └── SafariExtensionViewController.swift
├── SETUP.md               # 📖 설치 가이드
├── CONVERSION_SUMMARY.md  # 📊 변환 내역
└── README.md              # 이 파일
```

## ✨ 주요 기능

- ✅ ITSM 케이스 조회 및 검색
- ✅ AI 인사이트 분석
- ✅ MCC Escalation 제출
- ✅ 케이스 타임라인 복사
- ✅ 다국어 지원 (한/영/중/일)
- ✅ 다크 모드 (5가지 Fiori 테마)
- ✅ SSO 자동 로그인 (Safari 쿠키 공유)

## 🔄 Chrome Extension 대비 변경사항

### 동일한 부분 (95%)
- ITSM API 호출 로직
- AI 분석 로직
- UI/UX (HTML, CSS, JavaScript)
- 데이터 처리 로직

### 변경된 부분 (5%)
- Manifest: v3 → v2 (Safari 호환성)
- API: `chrome` → `browserAPI` 래퍼
- UI: Side Panel → Popup (전체 화면)
- 플랫폼: Desktop → iOS

**자세한 비교는 `CONVERSION_SUMMARY.md` 참조**

## 🎯 사용 방법

### iPhone에서

```
1. Safari 실행
2. itsm.services.sap 접속 (SSO 로그인)
3. 공유 버튼(화면 하단) 또는 aA 버튼(주소창 왼쪽) 탭
4. "CSM Dashboard" 선택
5. 대시보드가 전체 화면으로 표시됨
```

### iPad에서

iPad는 Split View로 Safari와 Extension을 동시에 볼 수 있습니다:
- Safari (왼쪽) + Extension (오른쪽) 분할 화면

## 🔧 개발

### 코드 수정 후 재빌드

```bash
# Xcode에서
Command + B (빌드만)
Command + R (빌드 + 실행)
```

### 로그 확인

Xcode 콘솔에서 Safari Extension 로그 확인:
```
[bg] g_ck 캐시 히트
[bg] REST 200 (234ms)...
```

### 디버깅

Safari Inspector로 Extension 디버깅 가능:
1. Mac Safari > Develop > [iPhone 이름] > Extension
2. 콘솔, 네트워크, 디버거 사용 가능

## 📦 배포

### 개인 사용
- Xcode에서 직접 설치
- 무료 Apple ID: 7일마다 재설치
- Developer 계정 ($99/년): 1년 유효

### 팀 공유
- TestFlight 사용 (최대 10,000명)
- App Store Connect 등록 필요

### 공개 배포
- App Store 등록
- Apple 검수 필요 (1~3일)
- $99/년 Developer 계정 필수

## 🐛 트러블슈팅

### Extension이 목록에 없음
```bash
# Xcode에서
Shift + Command + K (Clean Build Folder)
Command + R (재빌드)
```

### ITSM 세션 오류
- Safari에서 itsm.services.sap 탭을 열어 먼저 로그인
- 쿠키 허용 확인: 설정 > Safari > 방문 기록 차단 OFF

### "허용된 도메인 없음"
- 설정 > Safari > 확장 프로그램 > CSM Dashboard
- 도메인 권한 다시 허용

## 📚 참고 문서

- [SETUP.md](./SETUP.md) - 자세한 설치 가이드
- [CONVERSION_SUMMARY.md](./CONVERSION_SUMMARY.md) - Chrome → Safari 변환 내역
- [Apple Safari Extensions Guide](https://developer.apple.com/documentation/safariservices/safari_web_extensions)

## 📄 라이선스

Internal Use Only - SAP CSM Team

## 👤 Author

WooSuk Jung - SAP CSM Team

---

**버전**: 2.0.0 (iOS Safari Extension)  
**원본**: [csm-dashboard-ext](../csm-dashboard-ext) (Chrome Extension v1.12.6)
