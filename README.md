# 미친고양이.zip

배포 주소: https://random-crazycat.web.app

루트 주소를 카카오톡·디스코드 등에 공유하면 서버가 임의의 고양이를 골라 Open Graph
미리보기로 제공합니다. `?cat={고양이 ID}` 주소는 지정한 고양이의 미리보기를 제공합니다.

접속하거나 새로고침할 때마다 로컬에 저장된 고양이 사진 16장 중 하나를 무작위로 보여주고,
사진별 Firestore 방명록을 제공하는 Vite 웹 앱입니다.

## 로컬 실행

```bash
npm install
npm run firebase:config
npm run dev
```

`npm run firebase:config`은 현재 Firebase 웹 앱의 API 키를 `.env.local`에 저장합니다.
이 파일은 Git에 커밋되지 않습니다.

## Firestore 준비

Firebase Console에서 `mullohagi-652c3` 프로젝트의 Firestore Database를 먼저 생성하세요.
그다음 로그인한 뒤 규칙을 배포합니다.

```bash
npm run firebase:login
npm run deploy:rules
```

방명록은 `photos/{photoId}/comments/{commentId}` 경로에 저장됩니다. 제공된 규칙은
알려진 사진에 대한 댓글 읽기와 생성을 허용하고, 삭제는 등록된 관리자에게만 허용합니다.

## Google 관리자 로그인 설정

1. Firebase Console의 **Authentication > Sign-in method**에서 Google 공급자를 활성화합니다.
2. 관리자 계정 `silverhyeok.dev@gmail.com`으로 사이트의 **관리자 로그인** 버튼에서 로그인합니다.
3. Firestore 규칙과 사이트를 배포합니다.

관리자 여부는 화면 표시뿐 아니라 Firestore 규칙에서도 이메일 주소와 Google 계정의
이메일 인증 상태를 확인합니다. 다른 Google 계정으로 로그인하면 댓글 삭제 버튼이 나타나지
않으며, Firestore API를 직접 호출해도 삭제가 거부됩니다.

## 전체 배포

```bash
npm run build
npm run deploy
```

`deploy`는 Firestore 규칙과 Firebase Hosting의 `dist` 빌드를 함께 배포합니다.
