# 서버 연결과 앱 등록 순서

이 문서는 2026-09-20 기준의 준비 절차입니다. 외부 프로젝트·유료 계정·서명키를 생성하거나 스토어에 제출한 상태가 아닙니다. 비용과 배포 지역은 실제 계정 설정 시 확인합니다.

## 1. 소유 계정과 운영 정보

제니가 소유하는 Supabase·Firebase·스토어 개발자 계정을 사용합니다. 앱 ID는 `com.example.seonmul`을 고유한 값으로 바꿔야 합니다. 앱 ID를 서비스 계정에 등록하기 전에 운영 주체를 정합니다.

```sh
node scripts/set-app-id.mjs 본인이정한.고유한.앱아이디
```

위 인수는 형식 예시입니다. 실제로는 영문 소문자로 된 고유 reverse-domain ID를 전달합니다. 이 스크립트는 Capacitor·Android 패키지·iOS Bundle ID를 함께 바꿉니다.

필수 운영 정보: 상담 담당 선배 계정, 문의 이메일, 개인정보 처리방침 URL, 보관/삭제 기준, 계정 삭제 요청 웹페이지, 상담·재사용 동의 문구. 역할 승격은 운영자가 사용자 ID를 확인한 후 서버에서 수행합니다. 경력은 자기 입력만으로 검증된 자격이라고 표시하지 않습니다.

## 2. Supabase

1. 프로젝트와 원하는 데이터 지역을 정합니다. 이메일 확인과 발송 SMTP, 비밀번호 정책, 서비스 URL 및 인증 redirect 허용 목록을 설정합니다.
2. `supabase/migrations/`의 SQL을 파일명 순서대로 적용합니다. `202609200001_human_first.sql`은 상담 기본 구조, `202609200002_profile_bio.sql`은 선택 입력 소개글입니다. 기존 운영 DB라면 먼저 적용 이력과 충돌을 확인하고 미적용 파일만 실행합니다.
3. 테스트용 후배 두 계정과 선배 계정을 직접 가입합니다. 실제 환경에서도 계정 간 RLS 차단과 권한 회수를 검사합니다. RLS는 단순 화면 숨김과 별개로 DB에 적용됩니다. [Supabase 공식 RLS 안내](https://supabase.com/docs/guides/database/postgres/row-level-security)
4. 선배의 가입 ID를 확인하고 서버 SQL에서 `profiles.role`을 `mentor` 또는 운영자 `admin`으로 변경합니다. `mentors`에 같은 ID·표시 이름·`accepting=true`를 등록합니다. 초기 선배는 한 명 운영을 가정하며 자동 업무량 분배는 없습니다.
5. `.env.example`을 `.env.local`로 복사하고 `VITE_SUPABASE_URL`, **공개 publishable/anon 키**, 개인정보 URL, 문의 이메일을 입력합니다. 운영용 `VITE_ENABLE_PREVIEW=false`를 설정합니다. service_role/secret 키는 클라이언트에 절대 넣지 않습니다.
6. 프로젝트에 `delete-account`, `dispatch-notifications` Edge Functions를 배포합니다. 실제 서버의 계정 삭제 cascade도 테스트합니다.
7. 같은 계정으로 PC와 휴대폰에 로그인해 같은 상담이 불러와지는지 확인합니다. 이 단계부터 기록이 서버에 저장되며, 로컬 체험 데이터는 자동 이전하지 않습니다.

`supabase/config.toml`은 두 함수의 gateway 검증을 꺼두고 각각 **auth.getUser() 검증**과 **서버 전용 secret 검증**을 수행하게 합니다. 함수 내부 검증을 제거해서 공개 endpoint로 만들지 않습니다. [Supabase 함수 인증 안내](https://supabase.com/docs/guides/functions/auth)

## 3. 양방향 푸시

앱 안 알림과 휴대폰 푸시는 구분됩니다. 질문·답변 저장 시 `notifications`는 즉시 생성하고, 등록된 기기가 있으면 `private.notification_outbox`에 발송 작업을 넣습니다. 푸시 권한이 없어도 앱 안에서 상담과 알림을 볼 수 있습니다.

### Android

Firebase에 실제 앱 ID로 Android 앱을 등록하고 `google-services.json`을 `android/app/`에 배치합니다. FCM HTTP v1 권한이 있는 전용 서비스 계정의 JSON은 **Edge Function secret `FCM_SERVICE_ACCOUNT_JSON`**에만 보관합니다. 이 파일과 키는 코드 압축본에 포함되지 않습니다. [Capacitor 푸시 설정](https://capacitorjs.com/docs/apis/push-notifications), [FCM 전송 API](https://firebase.google.com/docs/cloud-messaging/send/v1-api)

앱의 설정 → 휴대폰 알림 켜기에서 권한을 요청합니다. Android 알림 채널 `consultations`를 생성하며, foreground·background·앱 종료 상태를 각각 검사합니다. 앱 강제 중지나 OS 정책 등에 따라 즉시 수신을 보장할 수는 없습니다.

### iOS

Apple Developer에서 App ID·Push Notifications capability·서명 프로필을 설정합니다. `AppDelegate.swift`에 APNs token callback이 포함되어 있습니다. Xcode에서 Push Notifications capability를 켜고 provisioning을 확인합니다.

서버 secret은 `APNS_PRIVATE_KEY`, `APNS_KEY_ID`, `APNS_TEAM_ID`, `APNS_BUNDLE_ID`, `APNS_ENVIRONMENT`입니다. 개발 빌드에는 `sandbox`, TestFlight/배포에는 `production`을 사용합니다. Capacitor iOS token은 APNs token이므로 Android FCM API로 보내지 않습니다. [Apple APNs 토큰 인증](https://developer.apple.com/documentation/usernotifications/establishing-a-token-based-connection-to-apns)

### Worker 정기 실행

32자 이상의 임의 `CRON_SECRET`을 Edge Function 서버에 설정합니다. Supabase Cron 또는 서버용 scheduler가 매분 `POST /functions/v1/dispatch-notifications`를 호출하도록 연결합니다. 호출 헤더 `x-worker-secret`에 같은 값을 넣습니다. scheduler에 키를 안전하게 보관하고 브라우저나 앱에서는 호출하지 않습니다. secret 값은 로그에 출력하지 않습니다.

Worker는 10개 작업을 한 번에 가져와 5개씩 전송합니다. 실패는 최대 8회까지 지수형 간격으로 재시도하며 임대는 3분입니다. `sent`는 **provider 수락**이며 휴대폰 도착 확인이 아닙니다. 네트워크 응답 유실 시 재전송 가능성이 있으므로 알림 ID를 유지하고 provider의 tag/collapse ID로 중복 표시를 줄입니다. 정확히 한 번의 푸시 도착을 보장하지 않습니다.

`failed` 및 장기간 대기 작업을 운영자가 모니터링해야 합니다. scheduler 자체가 실행되지 않으면 자동 전송도 이루어지지 않습니다. 기기 token 만료, provider 인증 오류, 알림 권한 거부, 두 기기 동시 로그인, 계정 전환, 로그아웃 후 알림 차단을 실제로 확인하세요.

## 4. Android·iOS 빌드

기존 웹 화면은 Capacitor 네이티브 프로젝트로 연결했습니다. 처음부터 별도 UI를 새로 만들지 않았습니다. [Capacitor 공식 안내](https://capacitorjs.com/docs)

```sh
npm ci
npm run build:release
npx cap sync
npx cap open android
# iOS는 Mac에서
npx cap open ios
```

Android Studio에서 실제 기기 테스트와 signed AAB를 만듭니다. iOS는 Mac/Xcode에서 실기기와 Archive/TestFlight를 사용합니다. `dist`에는 운영 화면만 넣으며 `prototype/`, `demo-dist/`, 독립 체험 HTML을 스토어용 앱에 넣지 않습니다. 생성된 기본 서명·예시 앱 ID로 제출하지 않습니다.

## 5. 스토어 준비

- 후배/선배 심사용 계정, 실제 동작하는 서버, 앱 아이콘과 실기기 화면, 서비스 설명, 문의 및 개인정보 URL을 준비합니다.
- 앱 내 계정 삭제를 실제로 시험하고 앱 밖에서도 삭제를 요청할 수 있는 웹 경로를 공개합니다. Google Play는 앱 가입 기능이 있는 경우 앱 내 삭제 경로와 외부 웹 경로를 요구합니다. [Google Play 계정 삭제 안내](https://support.google.com/googleplay/android-developer/answer/13327111)
- 신고·차단 및 운영 대응 범위를 확인하고 반영합니다. 현재는 문의 연락처 연결과 담당 선배 구조이며, 별도 신고 접수·차단 기능은 구현하지 않았습니다. 스토어 UGC 심사 적용 범위를 출시 전에 확인해야 합니다.
- 새 개인 Google Play 개발자 계정 중 해당 대상은 최소 12명이 연속 14일 참여하는 비공개 테스트 후 프로덕션 액세스를 신청해야 합니다. 모든 계정에 같은 조건이 적용되는 것은 아닙니다. [Google Play 테스트 요건](https://support.google.com/googleplay/android-developer/answer/14151465)
- Apple은 앱 기능과 계정 삭제 등을 심사합니다. 웹 화면을 포장했다는 사실만으로 등록이 보장되지 않습니다. 실제 상담·로그인·푸시·기록 기능이 완성된 빌드를 제출합니다. [Apple 앱 심사 지침](https://developer.apple.com/app-store/review/guidelines/)

## 권장 실행 범위

먼저 Android 비공개 테스트에서 후배·선배 두 계정의 질문 및 답변 푸시를 확인한 뒤 첫 공개 등록을 진행할 수 있습니다. iOS 프로젝트도 함께 준비되어 있으므로 원하는 출시 대상에 따라 병행합니다. 이번 작업에서는 외부 프로젝트 생성·과금·개발자 가입·앱 업로드·공개 배포를 수행하지 않았습니다.
