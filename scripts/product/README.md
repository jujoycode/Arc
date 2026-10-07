# 제품 사진 재촬영

현재 빌드한 Arc를 실제 MySQL·Mailpit·브라우저에서 실행하고 `docs/product/images`에 **1920×1080 / DPR 1** 원본 PNG를 저장합니다. 이미지 크기 변경이나 화면 합성은 하지 않습니다. `screenshots.json`에는 촬영일·역할·경로·앱 커밋을 남깁니다.

촬영은 공개 제품 자료를 갱신하기 위한 수동 작업입니다. 데모 워크스페이스를 생성·삭제하고 서명된 연동 이벤트·스프린트 종료·보관을 실행하므로 **폐기 가능한 전용 로컬 DB·메일함**을 사용하세요. GitHub·GitLab에는 실제 요청을 보내지 않고 기존 로컬 제공자 모형을 사용합니다. 운영 데이터·자격 증명을 넣지 않습니다.

## 준비

필요 도구: Java 21, Node.js 22.13 이상, pnpm 11.19.0, Python 3, Docker, Linux의 `setsid`·`curl`, Playwright Chromium. 저장소 루트에서 실행합니다.

```bash
pnpm --dir frontend install --frozen-lockfile
pnpm --dir frontend exec playwright install chromium
pnpm --dir frontend build
backend/gradlew -p backend --no-daemon bootJar
```

촬영 전용 서비스 예시입니다. 아래 비밀번호는 폐기용 로컬 예시이며 운영에는 사용하지 않습니다.

```bash
docker run -d --name arc-product-gallery-mysql \
  -p 127.0.0.1:33309:3306 \
  -e MYSQL_ROOT_PASSWORD=arc-gallery-root-password \
  -e MYSQL_DATABASE=arc -e MYSQL_USER=arc \
  -e MYSQL_PASSWORD=arc-gallery-password mysql:8.4
docker run -d --name arc-product-gallery-mail \
  -p 127.0.0.1:11027:1025 -p 127.0.0.1:18027:8025 \
  axllent/mailpit:v1.28
```

MySQL 초기화가 끝난 뒤 촬영을 실행합니다. 실패하면 `.ci-artifacts/product-capture`의 서버 로그·실패 사진을 확인하세요. 프로세스 종료 시 스크립트가 시작한 웹·API·제공자 모형만 종료합니다. 컨테이너는 직접 정리합니다.

```bash
DB_URL='jdbc:mysql://127.0.0.1:33309/arc?useUnicode=true&characterEncoding=utf8' \
DB_PASSWORD=arc-gallery-password \
SMTP_HOST=127.0.0.1 SMTP_PORT=11027 \
ARC_MAIL_URL=http://127.0.0.1:18027/api/v1/ \
bash scripts/product/capture.sh
python3 scripts/product/build_catalog.py
```

```bash
docker rm -fv arc-product-gallery-mysql arc-product-gallery-mail
```

`capture.sh`는 기본 포트 API `18090`, 웹 `15190`, 제공자 모형 `18091`을 사용하며 이미 사용 중인 포트에서는 시작하지 않습니다. `ARC_CAPTURE_API_PORT`, `ARC_CAPTURE_WEB_PORT`, `ARC_CAPTURE_PROVIDER_PORT`로 바꿀 수 있습니다. API·메일·웹·DB는 루프백 주소만 허용합니다. `CHROMIUM_PATH`는 선택적 시스템 Chromium 경로입니다.

## 설명 갱신과 확인

1. `capture.mjs`의 실제 화면 조작, 사진 제목·목적·역할·기능을 앱 구현에 맞게 수정합니다.
2. 빌드 후 다시 촬영합니다. 데모의 일정은 촬영 월에 맞춰 생성됩니다. 비밀번호·인증 토큰·웹훅 비밀값은 사진 목록에 저장하지 않습니다.
3. `build_catalog.py`로 모든 PNG의 원본 크기·목록 일치·중복 ID를 검사하고 5개 화면 설명 문서를 재생성합니다. 화면 설명 문서의 사진별 본문은 생성 파일이므로 원본 캡션은 `capture.mjs`에서 고칩니다.
4. `docs/product/README.md`의 촬영일·범위와 `FEATURES.md`, 루트 README의 기능·권한 설명을 맞춥니다. README에 연결한 대표 화면과 아래쪽 기능·대화상자의 구도를 눈으로 확인합니다.
5. 파일 링크·앵커·모든 사진의 사용 여부를 확인하고 작업 단위로 커밋합니다. 실제 외부 제공자 모형과 아직 구현하지 않은 기능의 구분을 유지합니다.

사진은 앱 화면 상단 또는 해당 기능으로 스크롤한 한 프레임입니다. 긴 화면은 기능별 사진을 나눠 제공하며 `fullPage` 캡처를 줄여 1920×1080처럼 표시하지 않습니다. 제품 코드의 수용 검사는 [개발 안내](../../docs/DEVELOPMENT.md)의 기존 API·브라우저 검사로 수행합니다.
