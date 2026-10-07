# Arc

[![Arc CI](https://github.com/jujoycode/Arc/actions/workflows/ci.yml/badge.svg)](https://github.com/jujoycode/Arc/actions/workflows/ci.yml)

**팀의 계획과 개발자의 실행을 같은 티켓으로 연결하는 프로젝트 관리 도구.**

관리자는 WBS에서 범위를 분해하고 업무를 배정합니다. 개발자는 내 티켓과 팀 진척을 확인하고 상태·완료율을 기록합니다. 일정은 간트와 타임라인으로, 실행은 테이블·칸반·스프린트로 확인합니다. Epic·Story·Task·Bug·하위 작업은 공통 티켓의 유형입니다.

**[전체 제품 화면 둘러보기 →](docs/product/README.md)** · [기능과 권한 확인](docs/product/FEATURES.md) · [설치 방법](#바로-시작하기)

## WBS로 계획하고 팀 진척 확인하기

계층별 업무, 담당자, 일정, 말단 완료 비율과 포인트를 함께 확인합니다. 개발자는 ‘내 업무’로 담당 티켓과 부모 맥락을 볼 수 있습니다.

[![Arc 관리자 WBS — 실제 제품 화면, 1920×1080](docs/product/images/wbs-manager.png)](docs/product/02-planning-and-schedule.md#wbs-manager)

## 간트로 일정과 관계 확인하기

프로젝트·버전·Epic·Story·하위 작업을 계층별로 접고 펼칩니다. 일정·완료율·선행/차단 관계·오늘 선을 표시하고 개인 보기 저장과 PNG/PDF 출력을 제공합니다.

[![Arc 간트 차트 — 실제 제품 화면, 1920×1080](docs/product/images/gantt.png)](docs/product/02-planning-and-schedule.md#gantt)

위 사진은 동일한 데모 팀의 실제 앱 화면입니다. 모든 제품 사진은 **1920×1080 원본**이며, [화면 안내](docs/product/README.md)에 촬영일·사용자 역할·기능 설명을 함께 기록했습니다. 새 설치에는 데모 계정·데이터가 자동으로 생성되지 않습니다.

## 어떤 업무를 할 수 있나요?

| 업무 | 제공 기능 | 화면 안내 |
| --- | --- | --- |
| 팀 시작 | 이메일 가입·확인·로그인, 초대, 워크스페이스·프로젝트 계층 | [팀 공간](docs/product/01-team-and-access.md) |
| 범위와 일정 계획 | 관리자 WBS, 개발자 내 업무, 중첩 간트, Epic/버전 타임라인 | [WBS·일정](docs/product/02-planning-and-schedule.md) |
| 업무 실행과 협업 | 티켓 테이블·열 선택, 칸반, 상세, 댓글, 관계·변경 기록, 충돌 안내 | [티켓·보기](docs/product/03-tickets-and-views.md) |
| 스프린트 운영 | 백로그 정렬·편성, 계획·시작·종료, 미완료 이월, 과거 결과 | [스크럼](docs/product/04-sprints.md) |
| 팀·개발 도구 관리 | 프로젝트 관리자 지정, 버전, 팀 역할, 보관, GitHub·GitLab 커밋/PR/MR | [설정·연동](docs/product/05-settings-and-integrations.md) |

### 역할에 맞는 업무 흐름

1. 워크스페이스 소유자·관리자가 팀과 프로젝트를 만들고 팀원을 초대합니다.
2. 기본 관리자는 소유자·워크스페이스 관리자이며, 프로젝트별 추가 관리자를 지정할 수 있습니다.
3. 관리자가 WBS에서 티켓의 범위·계층·담당자·일정·추정을 정하고 스프린트에 편성합니다.
4. 개발자는 팀 전체와 내 업무를 조회하고 담당 티켓의 상태·완료율을 수정합니다. 댓글은 모든 팀원이 작성합니다.
5. 간트·타임라인에서 일정과 관계를 확인하고, 스프린트 종료 시 미완료 업무를 이월합니다.

프로젝트별 관리자는 지정된 프로젝트의 계획만 관리합니다. 팀 역할·프로젝트 설정·저장소 자격 증명 관리는 워크스페이스 소유자·관리자가 담당합니다. 보관 프로젝트는 읽기 전용입니다. [상세 권한표](docs/product/FEATURES.md#역할과-권한)를 참고하세요.

## 바로 시작하기

Docker Compose로 웹·API·MySQL을 함께 설치할 수 있습니다. `.env.deploy`의 **DB 비밀번호 두 개를 변경**한 뒤 실행하세요.

```bash
cp deploy.env.example .env.deploy
chmod 600 .env.deploy
docker compose --env-file .env.deploy -f compose.deploy.yaml --profile local-mail up -d --build --wait
```

- 웹 앱: http://localhost:8085
- 이메일 확인·초대 메일함: http://localhost:8026

가입 → 확인 메일 링크 → 로그인 → 워크스페이스·프로젝트 생성 → 팀 초대 → 버전·티켓 등록 순서로 시작합니다. 프로젝트 키는 `ARC`처럼 대문자로 시작하는 2~10자의 영문 대문자·숫자입니다.

운영 서버의 도메인·HTTPS·SMTP·백업은 [배포 안내](docs/DEPLOYMENT.md), 코드를 수정하며 실행하는 방법과 검사 명령은 [개발 안내](docs/DEVELOPMENT.md)에 있습니다. `frontend/index.html`은 Vite 시작 파일이므로 실행한 웹 주소로 접속하세요.

## 현재 범위

버전 일정과 목표 날짜 표시는 제공합니다. **독립 마일스톤의 선행 조건·달성·증빙 관리는 기획 완료, 구현 대기**입니다. [마일스톤 기획](docs/MILESTONE_PLAN.md)을 참고하세요.

일정 편집은 티켓 상세에서 합니다. 간트 막대 드래그 편집, WBS 직접 재정렬·시간/원가·기준선은 후속 범위입니다. 공통 필터와 테이블 표시 열은 같은 프로젝트의 보기 이동 중 유지되며, 새로고침 복원은 후속 범위입니다. 간트 개인 보기는 사용자별로 저장합니다.

GitHub·GitLab 연동의 화면 자료는 로컬 제공자 모형으로 촬영했습니다. 실계정·공개 웹훅·운영 SMTP는 설치 환경에서 설정합니다. [지원 범위 전체](docs/product/FEATURES.md#선택하기-전에-확인할-범위)와 [구현 현황](docs/STATUS.md)을 확인하세요.

## 기술과 개발 문서

| 영역 | 기술 |
| --- | --- |
| 프런트엔드 | React 19, TypeScript, Vite, shadcn/ui, Tailwind CSS v4, TanStack Query·Table·Router, pnpm 11.19.0 |
| 백엔드 | Kotlin, Spring Boot 4, Exposed DSL, Flyway |
| 데이터·설치 | MySQL 8.4, Docker Compose, 로컬 Mailpit |
| 디자인 | KRDS를 바탕으로 확장한 [Arc 디자인 시스템](docs/DESIGN_GUIDE.md) |

GitHub Actions는 프런트·백엔드 검사와 빌드, 새 MySQL·Mailpit에서 실제 API·브라우저 수용 검사를 수행합니다. [CI 안내](docs/CI.md)에서 범위와 결과를 확인할 수 있습니다.

- [개발·검증](docs/DEVELOPMENT.md) · [배포](docs/DEPLOYMENT.md) · [저장소 연동](docs/INTEGRATIONS.md)
- [기능 명세](docs/FUNCTIONAL_SPEC.md) · [구현 현황](docs/STATUS.md) · [작업 목록](docs/TODO.md)
- [WBS·티켓·다양한 뷰 기획](docs/WORK_VIEWS_PLAN.md) · [Redmine 간트 기준](docs/GANTT_REFERENCE.md)
- [프런트 구조](docs/FRONTEND_ARCHITECTURE.md) · [백엔드 구조](docs/BACKEND_ARCHITECTURE.md)
- [디자인 검증](docs/DESIGN_VERIFICATION.md) · [디자인 재기획](docs/DESIGN_REPLAN.md) · [성능 점검](docs/PERFORMANCE.md)
