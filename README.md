# Arc

[![Arc CI](https://github.com/jujoycode/Arc/actions/workflows/ci.yml/badge.svg)](https://github.com/jujoycode/Arc/actions/workflows/ci.yml)

Arc는 소규모 팀이 하나의 티켓을 WBS, 간트, 타임라인, 테이블, 칸반, 스프린트에서 함께 관리하는 웹 앱입니다. Epic·Story·Task·Bug·하위 작업은 티켓의 유형이며, 기존 이슈 키로 일정·관계·진행률을 연결합니다.

### 간트 차트

프로젝트·버전·Epic·하위 작업의 일정과 집계 완료율, 이슈 관계와 진행선을 함께 표시합니다.

![실제 프로젝트 데이터로 표시한 Arc 간트 차트](docs/screenshots/gantt.png)

### 칸반 보드

동일한 이슈를 상태별로 표시합니다. 드래그, 상태 선택 메뉴, 키보드로 이동할 수 있습니다.

![같은 이슈를 상태별로 표시한 Arc 칸반 보드](docs/screenshots/board.png)

위 화면은 2026-10-07에 실행한 앱을 **1920×1080** 해상도로 촬영한 것입니다. 두 화면은 MySQL에 저장된 같은 11개 데모 이슈를 사용합니다. 새 설치에는 데모 계정이나 데이터가 자동으로 생성되지 않습니다.

## 주요 기능

- **WBS:** 계층 코드·부모 기준 중첩 접기·하위 티켓 생성, 간트와 같은 일정·완료율 집계, 말단 완료 수·포인트·미추정 수
- **타임라인:** 월/3개월 일정 개요, Epic·버전 그룹, 미계획·기간 밖·상속 일정 충돌 목록, 상세 편집 반영
- **테이블:** 서버 검색·필터·정렬·페이지, 시작일·완료율·포인트를 포함한 열 선택과 보기 이동 중 설정 유지
- **간트:** 프로젝트·버전·Epic·하위 이슈 계층, 일정·완료율·오늘 선·주말·선행/차단 관계, 월 이동·확대, 필터·개인 보기 저장, PNG/PDF 출력
- **이슈:** Epic/Story/Task/Bug/하위 작업, 담당자·우선순위·기한·버전, 댓글·변경 기록·이슈 관계, 검색·필터
- **칸반과 스크럼:** 상태별 보드, 백로그 정렬·스프린트 편성, 스프린트 시작·종료와 이력
- **팀 관리:** 이메일 가입·검증·로그인, 워크스페이스 초대, 역할 및 프로젝트 설정

GitHub·GitLab 저장소를 연결해 커밋과 PR·MR을 이슈의 개발 활동으로 표시합니다. 서버에서 연동 키를 활성화하고 제공자의 웹훅을 설정해야 합니다. [연결 방법과 구현 범위](docs/INTEGRATIONS.md)를 참고하세요. 실제 계정·외부 웹훅은 설치 환경에서 확인합니다.

## Get started

앱 전체를 Docker로 설치하려면 Java·Node를 호스트에 설치할 필요 없이 아래 명령을 사용합니다. `.env.deploy`의 두 DB 비밀번호를 바꾼 뒤 실행하세요. 웹은 http://localhost:8085, 확인 메일은 http://localhost:8026에서 볼 수 있습니다. 운영 도메인·SMTP·백업은 [배포 문서](docs/DEPLOYMENT.md)를 따릅니다.

```bash
cp deploy.env.example .env.deploy
chmod 600 .env.deploy
docker compose --env-file .env.deploy -f compose.deploy.yaml --profile local-mail up -d --build --wait
```

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

Docker Compose 기반 자체 서버 배포 구성을 제공합니다. 실제 운영 도메인과 SMTP 계정은 설치할 서버에서 설정합니다. 서버 환경 변수는 [백엔드 실행 문서](backend/README.md)를 참고하세요.

### 첫 프로젝트 사용하기

1. 웹 앱에서 이메일과 12자 이상의 비밀번호로 가입합니다. Mailpit의 확인 메일 링크를 열어 검증하고 로그인합니다.
2. 워크스페이스와 프로젝트를 만듭니다. 프로젝트 키는 `ARC`처럼 대문자로 시작하는 2~10자의 영문 대문자·숫자입니다.
3. 설정에서 팀원을 초대합니다. 초대받은 팀원은 해당 이메일 계정으로 가입·검증·로그인한 뒤 초대 링크를 엽니다.
4. 버전을 만들고 Epic·Story·Task·하위 작업을 등록합니다. 담당자, 시작일·완료일, 완료율, 스토리 포인트와 관계를 지정합니다.
5. WBS에서 작업 범위를 분해하고 하위 티켓을 추가합니다. 타임라인에서 일정 개요를, 간트에서 관계와 정밀 일정을 확인합니다. 간트는 개인 보기 저장과 PNG/PDF 출력을 제공하며 일정 수정은 공통 상세에서 합니다.
6. 칸반에서 상태를 변경합니다. 검색·필터는 프로젝트 안에서 보기 전환 시 유지됩니다.
7. 백로그에서 이슈를 스프린트에 편성합니다. 관리자가 시작·종료하면 완료/미완료 이슈와 포인트 결과, 과거 참여 이력이 보존됩니다.

멤버는 이슈와 백로그를 관리할 수 있고, 팀·프로젝트 설정과 스프린트 시작·종료는 관리자 이상에게 제공됩니다. 보관한 프로젝트는 읽기 전용입니다.

테이블은 프로젝트 메뉴의 ‘이슈 목록’에서 엽니다. ‘표시할 열’에서 선택한 설정과 공통 필터는 같은 프로젝트 안의 보기 이동 동안 유지됩니다. 새로고침 후의 복원·사용자별 서버 저장은 후속 범위입니다. WBS 코드는 계층 위치이며 구성 변경 시 바뀔 수 있으므로, 영구 참조에는 티켓 키를 사용합니다.

`frontend/index.html`은 Vite가 React를 불러오는 시작 파일입니다. 파일을 직접 열면 브라우저 모듈 제한으로 앱이 표시되지 않을 수 있으므로 개발 서버 주소를 사용하세요. 로그인 없이 화면 구조를 검토하려면 [독립형 디자인 시안](frontend/public/design-preview.html)을 직접 열거나 개발 서버의 `/design-preview.html`로 접속할 수 있습니다. 재기획 방향은 [디자인 재기획 v2](docs/DESIGN_REPLAN.md)에 기록했습니다.

## 기술 구성

| 영역 | 기술 |
| --- | --- |
| 웹 | React 19, TypeScript, Vite, Tailwind CSS v4, shadcn/ui, TanStack Query·Table·Router |
| 패키지 관리 | pnpm 11.19.0, 고정 잠금 파일 설치 |
| API | Kotlin, Spring Boot 4, Exposed DSL, Flyway |
| 저장·메일 | MySQL 8.4, 로컬 Mailpit |
| 디자인 | KRDS를 바탕으로 확장한 [Arc 디자인 가이드](docs/DESIGN_GUIDE.md) |

프런트는 `app / features / shared`, 백엔드는 기능별 `api / internal / web` 경계를 사용합니다. 프런트의 기능 간 참조는 공개 `index.ts`로 제한합니다. 모든 저장소를 Exposed DSL로 전환하고 Arc 디자인 시스템 v2를 적용했습니다. 후속 작업은 [작업 목록](docs/TODO.md)에서 추적합니다.

## 검증과 문서

GitHub Actions는 PR과 main 변경에서 프런트·백엔드를 검사한 뒤, 생성한 웹 번들과 실행 JAR를 새 MySQL·Mailpit에서 API·브라우저로 검증합니다. [CI 구성과 운영 방법](docs/CI.md)에서 검사 범위와 실패 자료 확인 방법을 설명합니다.

```bash
(cd frontend && pnpm build)
(cd backend && ./gradlew check)  # Python 3 필요: 패키지 경계 검사 포함
python3 scripts/smoke.py  # API, MySQL, Mailpit 실행 필요
(cd frontend && pnpm exec playwright install chromium)
(cd frontend && pnpm check:browser)  # 웹 앱·API·MySQL·Mailpit 실행 필요
```

빌드는 프런트 경계 검사와 TypeScript 검사를 포함합니다. `gradlew check`는 백엔드 경계 검사와 트랜잭션 커밋·롤백·중복 키 변환 테스트를 수행합니다. 실제 API와 화면 동작은 MySQL 수용 스크립트로 확인하며, 잘못된 백로그 정렬의 부분 변경도 전체 롤백되는지 검사합니다. 각 스크립트는 별도 테스트 워크스페이스를 만들고 정상 종료 또는 브라우저 테스트 정리 단계에서 삭제합니다.

브라우저 검증은 가입·초대, 티켓·댓글·관계, 공통 필터, WBS 코드·중첩 접기·하위 생성, 타임라인 경계·그룹·미계획·상속·상세 편집, 테이블 열·정렬·설정 유지, 간트 집계·저장 보기·출력, 이동 실패 복원, 편집 충돌, 스프린트 결과, 멤버 권한, 모바일 키보드 조작을 확인합니다. 생성 대화상자와 8개 주요 화면의 자동 접근성 검사, 360/768/1280px·확대 재배치·고대비 검사도 포함합니다. [디자인 검증 범위](docs/DESIGN_VERIFICATION.md)를 참고하세요. 다른 포트를 사용하면 `ARC_WEB_URL`, `ARC_API_URL`, `ARC_MAIL_URL`을 지정하세요. API·메일 주소는 각각 `/api/`, `/api/v1/`까지 포함합니다. 시스템 Chromium을 사용하려면 `CHROMIUM_PATH`를 지정할 수 있습니다.

### 실행 문제 확인

- 앱이 표시되지 않으면 파일 대신 Vite 주소를 열고, API의 `/actuator/health`와 터미널 로그를 확인합니다.
- DB 접속이 실패하면 `.env`와 API 프로세스의 `DB_PASSWORD`, Compose의 MySQL 상태를 확인합니다. 기본 DB 포트는 `3307`입니다.
- 확인·초대 메일은 로컬 Mailpit에서 확인합니다. 이 링크의 기본 웹 주소는 `localhost:5173`이며 `ARC_PUBLIC_URL`로 바꿀 수 있습니다.

- [기능 명세](docs/FUNCTIONAL_SPEC.md) · [명세 대비 구현 현황](docs/STATUS.md)
- [Redmine 간트 기준](docs/GANTT_REFERENCE.md) · [팀용 MVP 계획](docs/PLAN.md)
- [티켓·WBS·다양한 뷰 기획과 명세](docs/WORK_VIEWS_PLAN.md)
- [마일스톤 공식 기능 비교](docs/MILESTONE_RESEARCH.md) · [Arc 마일스톤 기획 — 구현 대기](docs/MILESTONE_PLAN.md)
- [백엔드 구조](docs/BACKEND_ARCHITECTURE.md) · [프런트 구조와 pnpm 선택](docs/FRONTEND_ARCHITECTURE.md)
- [작업 목록](docs/TODO.md) · [디자인 재기획](docs/DESIGN_REPLAN.md)

대량 데이터는 [성능 점검](docs/PERFORMANCE.md)에 측정 범위와 재현 명령을 기록했습니다. 5,000개 실제 이슈와 20,000개 간트 모델, 백로그 페이지·전체 정렬·실패 재시도를 확인했습니다.
