# Arc

[![Arc CI](https://github.com/jujoycode/Arc/actions/workflows/ci.yml/badge.svg)](https://github.com/jujoycode/Arc/actions/workflows/ci.yml)

Arc는 소규모 팀이 하나의 이슈를 간트 차트, 칸반 보드, 스프린트에서 함께 관리하는 웹 앱입니다. Epic·Story·Task·Bug·하위 작업의 계층, 버전과 이슈 관계, 일정과 진행률을 연결합니다.

### 간트 차트

프로젝트·버전·Epic·하위 작업의 일정과 집계 완료율, 이슈 관계와 진행선을 함께 표시합니다.

![실제 프로젝트 데이터로 표시한 Arc 간트 차트](docs/screenshots/gantt.png)

### 칸반 보드

동일한 이슈를 상태별로 표시합니다. 드래그, 상태 선택 메뉴, 키보드로 이동할 수 있습니다.

![같은 이슈를 상태별로 표시한 Arc 칸반 보드](docs/screenshots/board.png)

위 화면은 2026-10-05에 실행한 앱에서 MySQL에 저장된 11개 데모 이슈를 촬영한 것입니다. 새 설치에는 데모 계정이나 데이터가 자동으로 생성되지 않습니다.

## 주요 기능

- **간트:** 프로젝트·버전·Epic·하위 이슈 계층, 일정·완료율·오늘 선·주말·선행/차단 관계, 월 이동·확대, 필터·개인 보기 저장, PNG/PDF 출력
- **이슈:** Epic/Story/Task/Bug/하위 작업, 담당자·우선순위·기한·버전, 댓글·변경 기록·이슈 관계, 검색·필터
- **칸반과 스크럼:** 상태별 보드, 백로그 정렬·스프린트 편성, 스프린트 시작·종료와 이력
- **팀 관리:** 이메일 가입·검증·로그인, 워크스페이스 초대, 역할 및 프로젝트 설정

GitHub·GitLab 연결은 [설계 기준](docs/INTEGRATIONS.md)을 마련한 후속 기능입니다. 현재 릴리스에서 저장소 연결이나 웹훅은 제공하지 않습니다.

## Get started

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

운영 환경의 SMTP와 배포 대상은 아직 확정하지 않았습니다. 서버 환경 변수는 [백엔드 실행 문서](backend/README.md)를 참고하세요.

### 첫 프로젝트 사용하기

1. 웹 앱에서 이메일과 12자 이상의 비밀번호로 가입합니다. Mailpit의 확인 메일 링크를 열어 검증하고 로그인합니다.
2. 워크스페이스와 프로젝트를 만듭니다. 프로젝트 키는 `ARC`처럼 대문자로 시작하는 2~10자의 영문 대문자·숫자입니다.
3. 설정에서 팀원을 초대합니다. 초대받은 팀원은 해당 이메일 계정으로 가입·검증·로그인한 뒤 초대 링크를 엽니다.
4. 버전을 만들고 Epic·Story·Task·하위 작업을 등록합니다. 담당자, 시작일·완료일, 완료율, 스토리 포인트와 관계를 지정합니다.
5. 간트에서 일정과 관계를 읽고 개인 보기를 저장하거나 PNG/PDF로 내보냅니다. 일정 수정은 이슈 상세에서 합니다.
6. 칸반에서 상태를 변경합니다. 검색·필터는 프로젝트 안에서 보기 전환 시 유지됩니다.
7. 백로그에서 이슈를 스프린트에 편성합니다. 관리자가 시작·종료하면 완료/미완료 이슈와 포인트 결과, 과거 참여 이력이 보존됩니다.

멤버는 이슈와 백로그를 관리할 수 있고, 팀·프로젝트 설정과 스프린트 시작·종료는 관리자 이상에게 제공됩니다. 보관한 프로젝트는 읽기 전용입니다.

`frontend/index.html`은 Vite가 React를 불러오는 시작 파일입니다. 파일을 직접 열면 브라우저 모듈 제한으로 앱이 표시되지 않을 수 있으므로 개발 서버 주소를 사용하세요. 로그인 없이 화면 구조를 검토하려면 [독립형 디자인 시안](frontend/public/design-preview.html)을 직접 열거나 개발 서버의 `/design-preview.html`로 접속할 수 있습니다. 재기획 방향은 [디자인 재기획 v2](docs/DESIGN_REPLAN.md)에 기록했습니다.

## 기술 구성

| 영역 | 기술 |
| --- | --- |
| 웹 | React 19, TypeScript, Vite, Tailwind CSS v4, shadcn/ui, TanStack Query·Table·Router |
| 패키지 관리 | pnpm 11.19.0, 고정 잠금 파일 설치 |
| API | Kotlin, Spring Boot 4, Exposed DSL 및 Spring JDBC, Flyway |
| 저장·메일 | MySQL 8.4, 로컬 Mailpit |
| 디자인 | KRDS를 바탕으로 확장한 [Arc 디자인 가이드](docs/DESIGN_GUIDE.md) |

프런트는 `app / features / shared`, 백엔드는 기능별 `api / internal / web` 경계를 사용합니다. 프런트의 기능 간 참조는 공개 `index.ts`로 제한합니다. 저장소 계층은 현재 Exposed와 JDBC를 함께 사용하며, 남은 Exposed 전환과 디자인 시스템 재구성은 [작업 목록](docs/TODO.md)에서 추적합니다.

## 검증과 문서

GitHub Actions는 PR과 main 변경에서 프런트·백엔드를 검사한 뒤, 생성한 웹 번들과 실행 JAR를 새 MySQL·Mailpit에서 API·브라우저로 검증합니다. [CI 구성과 운영 방법](docs/CI.md)에서 검사 범위와 실패 자료 확인 방법을 설명합니다.

```bash
(cd frontend && pnpm build)
(cd backend && ./gradlew check)  # Python 3 필요: 패키지 경계 검사 포함
python3 scripts/smoke.py  # API, MySQL, Mailpit 실행 필요
(cd frontend && pnpm exec playwright install chromium)
(cd frontend && pnpm check:browser)  # 웹 앱·API·MySQL·Mailpit 실행 필요
```

빌드는 프런트 경계 검사와 TypeScript 검사를 포함합니다. `gradlew check`는 백엔드 경계 검사와 컴파일을 수행하며, 별도 단위 테스트는 아직 없습니다. 실제 API와 화면 동작은 수용 스크립트로 확인합니다. 각 스크립트는 별도 테스트 워크스페이스를 만들고 정상 종료 또는 브라우저 테스트 정리 단계에서 삭제합니다.

브라우저 검증은 가입·초대, 이슈·댓글·관계, 공통 필터, 간트 집계·저장 보기·출력, 이동 실패 복원, 편집 충돌, 스프린트 결과, 멤버 권한, 모바일 키보드 조작을 확인합니다. 생성 대화상자와 6개 화면의 자동 접근성 검사, 360/768/1280px·확대 재배치·고대비 검사도 포함합니다. [디자인 검증 범위](docs/DESIGN_VERIFICATION.md)를 참고하세요. 다른 포트를 사용하면 `ARC_WEB_URL`, `ARC_API_URL`, `ARC_MAIL_URL`을 지정하세요. API·메일 주소는 각각 `/api/`, `/api/v1/`까지 포함합니다. 시스템 Chromium을 사용하려면 `CHROMIUM_PATH`를 지정할 수 있습니다.

### 실행 문제 확인

- 앱이 표시되지 않으면 파일 대신 Vite 주소를 열고, API의 `/actuator/health`와 터미널 로그를 확인합니다.
- DB 접속이 실패하면 `.env`와 API 프로세스의 `DB_PASSWORD`, Compose의 MySQL 상태를 확인합니다. 기본 DB 포트는 `3307`입니다.
- 확인·초대 메일은 로컬 Mailpit에서 확인합니다. 이 링크의 기본 웹 주소는 `localhost:5173`이며 `ARC_PUBLIC_URL`로 바꿀 수 있습니다.

- [기능 명세](docs/FUNCTIONAL_SPEC.md) · [명세 대비 구현 현황](docs/STATUS.md)
- [Redmine 간트 기준](docs/GANTT_REFERENCE.md) · [팀용 MVP 계획](docs/PLAN.md)
- [백엔드 구조](docs/BACKEND_ARCHITECTURE.md) · [프런트 구조와 pnpm 선택](docs/FRONTEND_ARCHITECTURE.md)
- [작업 목록](docs/TODO.md) · [디자인 재기획](docs/DESIGN_REPLAN.md)
