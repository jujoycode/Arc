# Arc 프런트 구조

> React 19 / TypeScript / Vite / pnpm 11.19.0 · 2026-10-05

## 패키지 관리

Arc는 Node 기반 Vite와 TypeScript를 사용하며, Kotlin 서버와 브라우저 앱으로 구성된다. 현재 프런트에 Bun 런타임에 의존하는 기능은 없다. 설치와 실행의 차이가 제품에 주는 이점이 작으므로 사용자 기본 선택에 따라 pnpm을 채택했다.

- `packageManager`에 pnpm 11.19.0을 고정하고 Node 22.13 이상을 사용한다.
- npm 잠금 파일의 버전을 `pnpm-lock.yaml`로 가져왔다. 설치는 `pnpm install --frozen-lockfile`로 재현한다.
- `pnpm-workspace.yaml`은 의존성 설치 스크립트 설정을 보관한다. 현재 앱은 단일 패키지다.
- UI 클래스 병합은 로컬 `shared/lib/cn.ts`의 clsx·tailwind-merge를 사용한다.

## 구조

```text
frontend/src/
├── main.tsx                         # DOM 진입점
├── app/
│   ├── App.tsx                     # TanStack Router 경로 조립
│   ├── layouts/ProjectLayout.tsx   # 앱 셸과 보기 선택
│   └── providers/AppProviders.tsx # QueryClient 수명·정책
├── features/
│   ├── auth/                       # 가입·이메일 확인·로그인
│   ├── workspace/                  # 팀·프로젝트 선택
│   ├── project/                    # 프로젝트 계약·접근 상태
│   ├── issue/                      # 이슈·댓글·관계·공통 필터
│   ├── kanban/                     # 상태별 보드
│   ├── gantt/                      # 일정 집계·관계·출력
│   ├── sprint/                     # 백로그·스프린트
│   └── settings/                   # 팀·프로젝트 설정 화면 조립
└── shared/
    ├── api/client.ts               # HTTP·토큰 저장
    ├── ui/                         # shadcn/ui 기본 컴포넌트
    ├── lib/                        # cn·지역 시간 표시
    └── styles/                     # KRDS 기반 Arc 토큰·전역 스타일
```

각 기능은 실제 필요한 부분만 다음처럼 둔다.

```text
features/issue/
├── index.ts                         # 외부 모듈이 사용할 공개 진입점
├── api/
│   ├── types.ts                     # 이슈·댓글·관계 계약
│   ├── useIssues.ts                 # 여러 화면이 사용하는 조회
│   └── issueActions.ts              # 경로·변경 후 캐시 갱신
└── internal/
    ├── model/                       # 필터 상태·표시 규칙
    └── ui/                          # 폼·목록·상세·필터 입력
```

## 경계 규칙

| 위치 | 책임 | 허용되는 참조 |
| --- | --- | --- |
| `app` | 라우팅, 전역 provider, 여러 기능의 화면 조립 | 기능의 공개 index와 shared |
| 기능 `index.ts` | 외부에 공개하는 컴포넌트·훅·계약 | 자기 기능의 api/internal |
| 기능 `api` | DTO, 재사용할 조회·변경 계약, 캐시 갱신 | 자기 기능, shared, 다른 기능의 공개 index |
| `internal/model` | 화면 상태와 순수 계산 | 자기 기능 계약·모델, 공개 타입; 직접 HTTP 호출 금지 |
| `internal/ui` | 표시와 사용자 입력 처리 | 자기 기능, shared, 다른 기능의 공개 index |
| `shared` | 기능에 의존하지 않는 UI·통신·스타일 | shared 및 외부 라이브러리 |

- 다른 기능의 `internal` 또는 `api` 파일을 직접 import하지 않는다. `@/features/issue`처럼 공개 진입점을 사용한다.
- 동일 기능 안에서는 상대 경로를 사용한다. 공통 UI는 `@/shared/ui/button`처럼 직접 가져올 수 있다.
- 런타임 기능 의존 순환을 금지한다. DTO의 type-only 참조는 런타임 의존 관계와 구분한다.
- 재사용되는 조회 훅과 계약은 api로 옮긴다. 작은 화면의 단순 변경 요청까지 별도 Service/Handler를 의무화하지 않는다.
- 역할·보관 상태는 UI에서도 표시하되, 실제 권한과 데이터 검증은 서버에서 수행한다.
- QueryClient는 app에서 생성한다. 이슈 변경에 따른 목록·간트·상세·활동 갱신은 issue 공개 API가 담당한다.
- shadcn 설정은 shared UI와 스타일 경로를 따른다. 기능 전용 컴포넌트를 shared로 이동시키지 않는다.

간트의 일정 집계는 `gantt/internal/model/ganttRows.ts`, 날짜·필터 계산은 `gantt.ts`에 둔다. 공통 이슈 조회는 issue API가 소유한다. 백로그와 스프린트는 각각의 UI 파일로 분리한다. 사용하지 않는 샘플 데이터와 전체 보기를 묶던 중간 export 파일은 제거했다.

## 검증

```bash
cd frontend
pnpm install --frozen-lockfile
pnpm check:boundaries
pnpm build
pnpm check:browser  # API·MySQL·Mailpit·Chromium 필요
```

경계 검사는 디렉터리 규칙, 로컬 import 유효성, 기능의 비공개 경로 참조, shared의 기능 의존, 모델의 직접 HTTP 호출, 런타임 의존 순환을 확인한다. 실제 상태 변경·출력·권한·충돌은 브라우저 수용 스크립트가 확인한다.

저장소 연동은 9번째 `integration` 기능으로 추가했다. 공개 `IntegrationSettings`와 `DevelopmentLinks`를 settings·issue에서 조합한다. integration은 project의 권한 조회만 참조하며 issue 기능을 import하지 않아 순환을 만들지 않는다. 자격 증명 입력은 화면의 로컬 상태만 사용하고 조회 캐시에 넣지 않는다.
