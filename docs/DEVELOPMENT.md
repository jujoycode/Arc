# Arc 개발과 검증

로컬에서 코드를 수정하고 검증하는 방법입니다. 제품을 둘러보려면 [화면 안내](product/README.md), 전체 앱 설치는 [배포 문서](DEPLOYMENT.md)를 참고하세요.

## 로컬 실행

코드를 수정하며 실행하는 개발 환경은 다음과 같습니다.

필요한 도구: **Java 21**, **Node.js 22.13 이상**, **pnpm 11.19.0**, **Docker Compose**. 로컬 DB는 MySQL 8.4, 개발용 메일함은 Mailpit입니다.

```bash
cp .env.example .env
# .env의 DB_PASSWORD와 MYSQL_ROOT_PASSWORD를 각자 변경
docker compose up -d --wait
```

저장소 루트에서 첫 번째 터미널을 열고 `.env`를 불러온 뒤 API를 실행합니다. Flyway가 필요한 테이블을 생성합니다.

```bash
set -a
source .env
set +a
cd backend
./gradlew bootRun
```

저장소 루트에서 두 번째 터미널을 열고 웹 앱을 실행합니다.

```bash
cd frontend
corepack enable  # pnpm이 이미 설치되어 있으면 생략
# Corepack이 없다면: npm install --global pnpm@11.19.0
pnpm install --frozen-lockfile
pnpm dev
```

| 서비스 | 주소 |
| --- | --- |
| 웹 앱 | http://localhost:5173 |
| 개발용 메일함 | http://localhost:8025 |
| API 상태 확인 | http://localhost:8080/actuator/health |
| MySQL | `localhost:3307` · DB/사용자 `arc` |

Docker Compose 기반 자체 서버 배포 구성을 제공합니다. 실제 운영 도메인과 SMTP 계정은 설치할 서버에서 설정합니다. 서버 환경 변수는 [백엔드 실행 문서](../backend/README.md)를 참고하세요.

## 화면 직접 열기

`frontend/index.html`은 Vite가 React를 불러오는 시작 파일입니다. 개발 서버 주소로 접속하세요. 로그인 없이 설계만 검토하려면 [독립형 디자인 시안](../frontend/public/design-preview.html)을 직접 열거나 `/design-preview.html`로 접속할 수 있습니다. 시안과 실제 제품 사진은 구분되어 있습니다.

## 검사

GitHub Actions는 PR과 main 변경에서 프런트·백엔드를 검사한 뒤, 생성한 웹 번들과 실행 JAR를 새 MySQL·Mailpit에서 API·브라우저로 검증합니다. [CI 구성과 운영 방법](CI.md)에서 검사 범위와 실패 자료 확인 방법을 설명합니다.

```bash
(cd frontend && pnpm build)
(cd backend && ./gradlew check)  # Python 3 필요: 패키지 경계 검사 포함
python3 scripts/smoke.py  # API, MySQL, Mailpit 실행 필요
(cd frontend && pnpm exec playwright install chromium)
(cd frontend && pnpm check:browser)  # 웹 앱·API·MySQL·Mailpit 실행 필요
```

빌드는 프런트 경계 검사와 TypeScript 검사를 포함합니다. `gradlew check`는 백엔드 경계 검사와 트랜잭션 커밋·롤백·중복 키 변환 테스트를 수행합니다. 실제 API와 화면 동작은 MySQL 수용 스크립트로 확인하며, 잘못된 백로그 정렬의 부분 변경도 전체 롤백되는지 검사합니다. 각 스크립트는 별도 테스트 워크스페이스를 만들고 정상 종료 또는 브라우저 테스트 정리 단계에서 삭제합니다.

브라우저 검증은 가입·초대, 티켓·댓글·관계, 공통 필터, WBS 코드·중첩 접기·하위 생성, 타임라인 경계·그룹·미계획·상속·상세 편집, 테이블 열·정렬·설정 유지, 간트 집계·저장 보기·출력, 이동 실패 복원, 편집 충돌, 스프린트 결과, 멤버 권한, 모바일 키보드 조작을 확인합니다. 생성 대화상자와 8개 주요 화면의 자동 접근성 검사, 360/768/1280px·확대 재배치·고대비 검사도 포함합니다. [디자인 검증 범위](DESIGN_VERIFICATION.md)를 참고하세요. 다른 포트를 사용하면 `ARC_WEB_URL`, `ARC_API_URL`, `ARC_MAIL_URL`을 지정하세요. API·메일 주소는 각각 `/api/`, `/api/v1/`까지 포함합니다. 시스템 Chromium을 사용하려면 `CHROMIUM_PATH`를 지정할 수 있습니다.

### 실행 문제 확인

- 앱이 표시되지 않으면 파일 대신 Vite 주소를 열고, API의 `/actuator/health`와 터미널 로그를 확인합니다.
- DB 접속이 실패하면 `.env`와 API 프로세스의 `DB_PASSWORD`, Compose의 MySQL 상태를 확인합니다. 기본 DB 포트는 `3307`입니다.
- 확인·초대 메일은 로컬 Mailpit에서 확인합니다. 이 링크의 기본 웹 주소는 `localhost:5173`이며 `ARC_PUBLIC_URL`로 바꿀 수 있습니다.


## 구조와 화면 자료

- [프런트 구조](FRONTEND_ARCHITECTURE.md) · [백엔드 구조](BACKEND_ARCHITECTURE.md)
- [성능 점검](PERFORMANCE.md) · [디자인 검증](DESIGN_VERIFICATION.md)
- [제품 사진 재촬영](../scripts/product/README.md)
