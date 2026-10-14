# CSM Dashboard iOS Safari Extension 설치 가이드

## 📱 준비물
- Mac (Xcode 설치 필요)
- iPhone (iOS 15 이상)
- Apple Developer 계정 (무료 계정 가능)

## 🛠 Xcode 프로젝트 생성

### 1. Xcode에서 새 프로젝트 생성

```
1. Xcode 실행
2. File > New > Project
3. iOS > App 선택
4. Product Name: CSMDashboard
5. Team: 본인 Apple ID 선택
6. Organization Identifier: com.yourname
7. Interface: SwiftUI
8. Language: Swift
9. Storage: None
10. 저장 위치: /Users/woosuk/Projects/csm_dashboard_app/CSMDashboard-iOS
```

### 2. Safari Extension 타겟 추가

```
1. 프로젝트 네비게이터에서 CSMDashboard 프로젝트 선택
2. 하단 + 버튼 클릭 (Add Target)
3. iOS > Safari Extension 선택
4. Product Name: Extension
5. Activate "Extension" scheme? → Activate
```

### 3. 파일 교체

현재 디렉토리에 이미 준비된 파일들이 있습니다:

**앱 파일 교체:**
- `CSMDashboard/CSMDashboardApp.swift` → Xcode의 기본 파일 교체
- `CSMDashboard/ContentView.swift` → Xcode의 기본 파일 교체
- `CSMDashboard/Info.plist` → Xcode의 기본 파일에 병합 (App Transport Security 설정 추가)

**Extension 파일 교체:**
- `Extension/` 폴더의 모든 파일을 Xcode Extension 타겟에 추가:
  - `manifest.json`
  - `background.js`
  - `popup.html`
  - `sidepanel.js`
  - `sidepanel.css`
  - `icons/` 폴더
  - `korea-accounts.json`
  - `Info.plist` (Extension 설정)
  - `SafariExtensionHandler.swift`
  - `SafariExtensionViewController.swift`

### 4. Build Settings 수정

**CSMDashboard (앱) 타겟:**
```
- Bundle Identifier: com.yourname.CSMDashboard
- Deployment Target: iOS 15.0
```

**Extension 타겟:**
```
- Bundle Identifier: com.yourname.CSMDashboard.Extension
- Deployment Target: iOS 15.0
```

### 5. Extension 리소스 추가

Extension 타겟에 다음 파일들이 포함되었는지 확인:
1. Xcode 프로젝트 네비게이터에서 Extension 그룹 선택
2. File > Add Files to "CSMDashboard"...
3. `Extension/` 폴더의 모든 JS, HTML, CSS, JSON, 이미지 파일 추가
4. 대상 선택: ✅ Extension (✅ CSMDashboard는 체크 해제)

## 📲 iPhone에 설치

### 6. 빌드 및 설치

```
1. iPhone을 Mac에 USB로 연결
2. Xcode 상단 타겟: CSMDashboard > 본인 iPhone 선택
3. Command + R (또는 ▶ 버튼) → 빌드 및 설치
4. iPhone에서 "신뢰할 수 없는 개발자" 경고 시:
   설정 > 일반 > VPN 및 기기 관리 > 개발자 앱 > 신뢰
```

### 7. Extension 활성화

```
1. iPhone 설정 > Safari > 확장 프로그램
2. CSM Case Dashboard 켜기
3. 권한 허용:
   - itsm.services.sap ✅
   - *.hana.ondemand.com ✅
```

### 8. 사용

```
1. Safari 앱 실행
2. https://itsm.services.sap 접속 (SSO 로그인)
3. 공유 버튼(또는 주소창 왼쪽 aA 버튼) 탭
4. "CSM Dashboard" 선택
5. 대시보드 표시됨!
```

## 🔧 트러블슈팅

### Extension이 목록에 안 보임
- Xcode에서 Clean Build Folder (Shift + Command + K)
- 앱 재설치

### "허용된 도메인 없음" 오류
- Extension/Info.plist의 SFSafariWebsiteAccess 확인
- 설정에서 도메인 권한 재허용

### ITSM 세션 오류
- Safari에서 itsm.services.sap에 먼저 로그인
- 쿠키 설정 확인 (설정 > Safari > 방문 기록 및 웹사이트 데이터)

## 📝 주요 변경사항

Chrome Extension → Safari Extension 변환 내용:

1. **Manifest v3 → v2**: Safari는 아직 Manifest v2 사용
2. **chrome API → browser API**: `chrome.runtime` → `browserAPI.runtime`
3. **Side Panel → Popup**: iOS에서는 popup.html로 전체 화면 표시
4. **Service Worker → Background Page**: persistent: false로 백그라운드 실행

## 🎯 다음 단계

- [ ] App Store Connect에 앱 등록 (공개 배포 시)
- [ ] TestFlight으로 베타 테스트 (팀 공유 시)
- [ ] iPad 레이아웃 최적화 (Sidebar 지원)
- [ ] Widget 추가 (iOS 14+)

---

**문의:** 오류 발생 시 Xcode 콘솔 로그 확인 (View > Debug Area > Activate Console)
