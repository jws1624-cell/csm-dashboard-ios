# 🚀 5분 만에 iPhone에 설치하기

> GUI 없이 최대한 자동화한 가이드입니다.

## ⚡️ 초간단 3단계

### 1️⃣ Xcode 열기 (30초)

터미널에서:
```bash
cd /Users/woosuk/Projects/csm_dashboard_app/CSMDashboard-iOS
open -a Xcode
```

### 2️⃣ 프로젝트 생성 (2분)

Xcode에서:
1. **Create New Project** 클릭
2. **iOS > App** 선택 > Next
3. 설정 입력:
   ```
   Product Name: CSMDashboard
   Team: (본인 Apple ID 선택)
   Organization Identifier: com.sap.csm
   Interface: SwiftUI
   Language: Swift
   Include Tests: 체크 해제
   ```
4. **저장 위치**: 
   - `/Users/woosuk/Projects/csm_dashboard_app/CSMDashboard-iOS` 선택
   - ⚠️ **중요**: 폴더 안에 생성하지 말고, 이 폴더 자체를 선택!
5. **Create** 클릭

### 3️⃣ Safari Extension 추가 (1분)

Xcode에서:
1. 좌측 **CSMDashboard** 프로젝트 아이콘 (파란색) 클릭
2. 하단 **+** 버튼 (Targets 섹션) 클릭
3. **iOS > Safari Extension** 선택
4. **Product Name**: `Extension`
5. **Finish** 클릭
6. **Activate "Extension" scheme?** → **Activate** 클릭

---

## 🔄 파일 교체 (자동화)

터미널로 돌아와서:

```bash
# 1. Xcode 생성 기본 파일 백업
cd /Users/woosuk/Projects/csm_dashboard_app/CSMDashboard-iOS
mkdir -p .xcode_original
mv CSMDashboard/ContentView.swift .xcode_original/ 2>/dev/null || true
mv Extension/SafariWebExtensionHandler.swift .xcode_original/ 2>/dev/null || true

# 2. 준비된 파일로 교체 (이미 올바른 위치에 있음)
echo "✅ 파일이 이미 준비되어 있습니다!"
ls -lh CSMDashboard/
ls -lh Extension/ | head -10
```

---

## 📲 iPhone에 설치 (1분)

### iPhone 연결 확인

```bash
# iPhone이 연결되었는지 확인
system_profiler SPUSBDataType | grep iPhone
```

### Xcode에서 빌드

1. Xcode 상단 타겟 선택: **CSMDashboard > [본인 iPhone 이름]**
2. **Command + R** (또는 ▶ 버튼)
3. iPhone에서 "신뢰할 수 없는 개발자" 알림 시:
   - **설정 > 일반 > VPN 및 기기 관리**
   - 개발자 앱 > **신뢰**

---

## ✨ Extension 활성화 (30초)

iPhone에서:
1. **설정 > Safari > 확장 프로그램**
2. **CSM Case Dashboard** 켜기
3. **모든 웹사이트** 또는 **itsm.services.sap** 허용

---

## 🎉 완료! 사용하기

1. **Safari** 앱 실행
2. **itsm.services.sap** 접속 (SSO 로그인)
3. 화면 하단 **공유 버튼** (□↑) 탭
4. **CSM Dashboard** 선택
5. 전체 화면으로 대시보드 표시! 🎊

---

## 🐛 문제 해결

### "빌드 실패" 오류

```bash
# Xcode에서
Product > Clean Build Folder (Shift + Command + K)
# 다시 Command + R
```

### "Signing 실패" 오류

Xcode:
1. Project > CSMDashboard 선택
2. **Signing & Capabilities** 탭
3. **Team** 다시 선택
4. Bundle Identifier 수정: `com.yourname.CSMDashboard`

### Extension이 Safari에 안 보임

```bash
# 앱 재설치
# Xcode에서 다시 Command + R
```

---

## 📝 정리

```
✅ Xcode 프로젝트 생성      (2분)
✅ Safari Extension 추가     (1분)
✅ iPhone 빌드 및 설치       (1분)
✅ Extension 활성화          (30초)
✅ 사용 시작                (즉시!)
─────────────────────────────────
   총 소요 시간: 약 5분
```

---

**다음**: 자세한 기술 문서는 `SETUP.md`, 변환 내역은 `CONVERSION_SUMMARY.md` 참조
