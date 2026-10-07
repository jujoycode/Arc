# Arc 백엔드 구조

> 2026-10-06 · Kotlin / Spring Boot · 하나의 Gradle 애플리케이션 안에서 기능별 경계를 유지한다.

## 설계 방향

사용자가 공유한 **백엔드 구조 비교** 대화의 캐시 미리보기를 참고했다. 전체 대화 및 handoff 파일은 이번 환경에서 읽을 수 없었으므로, 확인 가능한 원칙인 기능별 구조, `api/internal` 경계, 필요에 따른 QueryService, 과도한 추상화 방지를 Arc에 적용했다.

Arc는 modular monolith로 시작한다. 배포 단위는 하나이며 기능 모듈은 Kotlin 패키지로 구분한다. 독립적인 빌드·배포나 컴파일 경계가 실제로 필요해질 때 Gradle 모듈로 분리한다.

```text
backend/src/main/kotlin/io/arcapp/backend/
├── ArcBackendApplication.kt
├── bootstrap/config/          # Spring Security, Exposed 연결 구성
├── shared/
│   ├── api/                   # 공통 오류 계약
│   ├── web/                   # HTTP 오류 응답, 인증된 사용자 추출
│   ├── persistence/           # 트랜잭션 참여·값 변환
│   └── security/              # 토큰 생성·해시
├── identity/
│   ├── api/                   # SessionAuthenticator, IdentityDirectory
│   ├── web/                   # AuthController
│   └── internal/
│       ├── IdentityService.kt
│       ├── IdentityCommands.kt
│       └── persistence/       # 사용자·토큰 저장
├── workspace/                 # 팀·멤버·초대·소유권
│   ├── api/                   # WorkspaceAccess
│   ├── web/
│   └── internal/persistence/
├── project/                   # 프로젝트 계층·키·보관·버전
│   ├── api/                   # ProjectAccess, ProjectTimelineQueries
│   ├── web/
│   └── internal/persistence/
├── issue/                     # 이슈·계층·댓글·활동·관계·스프린트 참여 이력
│   ├── api/                   # IssueTimelineQueries, SprintIssueOperations
│   ├── web/
│   └── internal/
│       ├── IssueService.kt
│       ├── IssueQueryService.kt
│       └── persistence/
├── sprint/                    # 계획·시작·종료
│   ├── web/
│   └── internal/persistence/
├── gantt/                     # 공개 조회 계약을 조합한 통합 간트
│   ├── web/
│   └── internal/              # GanttQueryService; 직접 DB 접근 없음
├── savedview/                 # 사용자별 간트 보기
│   ├── web/
│   └── internal/persistence/
├── integration/               # GitHub·GitLab 연결·개발 활동·웹훅 큐
│   ├── api/                   # RepositoryProvider 외부 시스템 경계
│   ├── web/                   # 연결 관리·웹훅 수신
│   └── internal/              # 서비스·worker·암호화·client·persistence
└── mail/
    ├── api/                   # MailSender 외부 시스템 포트
    └── internal/client/       # SMTP 구현
```

## 디렉터리의 의미

| 위치 | 책임 | 규칙 |
| --- | --- | --- |
| `web` | 경로·요청 바인딩·현재 사용자 추출 | 업무 규칙과 DB 처리는 서비스에 위임 |
| `api` | 다른 기능 모듈에 공개하는 호출·데이터 계약 | HTTP API라는 의미가 아님. 외부 모듈은 이 패키지만 참조 |
| `internal` | 유스케이스·권한·검증·트랜잭션 조정 | 같은 기능의 web/api에서만 사용 |
| `internal/persistence` | SQL·Exposed Table·저장·조회·잠금 | 다른 모듈의 저장소나 Table을 import하지 않음 |
| `internal/client` | SMTP·GitHub·GitLab 등의 외부 HTTP/SDK 호출 | 기능 모듈의 공개 포트를 통해 호출 |
| `internal/storage` | 파일 저장소 adapter | 파일 기능이 생길 때 추가 |
| `internal/messaging` | 이벤트 발행·수신 adapter | 비동기 처리가 생길 때 추가 |

필요한 디렉터리만 생성한다. 간트처럼 데이터를 조합하는 기능에는 자체 저장소가 없다. `shared`에는 기능별 정책을 넣지 않는다.

## 요청 흐름과 모듈 경계

```mermaid
flowchart LR
    HTTP[web Controller] --> Service[internal Service]
    Service --> Repository[자기 모듈 persistence]
    Service --> Contract[다른 모듈 api]
    Contract --> Other[그 모듈 internal]
    Repository --> MySQL[(MySQL 8)]
```

- 이슈 생성: `IssueController → IssueService → ProjectAccess / WorkspaceAccess → IssueRepository`.
- 스프린트 종료: `SprintService`가 프로젝트 권한과 상태를 검증한 뒤 `SprintIssueOperations`로 참여 이력·포인트·미완료 이월을 처리한다. 스프린트 모듈이 이슈 저장소를 직접 호출하지 않는다.
- 간트 조회: `GanttQueryService → ProjectTimelineQueries + IssueTimelineQueries`. 프로젝트 하위 트리와 이슈·관계를 통합한다.
- 인증 필터는 `SessionAuthenticator`를 호출하고, 메일 발송은 `MailSender`를 호출한다.

## 트랜잭션과 저장 기술

인증·워크스페이스·멤버·프로젝트·버전·이슈·댓글·관계·활동·스프린트·저장 보기의 저장소는 Exposed DSL을 사용한다. Table과 조회 투영은 각 기능의 persistence 안에 둔다. Flyway가 스키마를 관리하며 런타임에서 테이블을 생성하지 않는다.

- 쓰기 유스케이스의 `@Transactional`은 Service에 둔다. Exposed의 `SpringTransactionManager`가 JDBC와 Exposed에 같은 연결을 제공하므로 전환 중에도 스프린트 종료 이력·이슈 이동·종료 상태가 함께 커밋·롤백된다.
- 프로젝트 변경은 프로젝트 행 잠금으로 직렬화한다. 이슈 번호 발급, 계층·관계 변경, 스프린트 시작·종료의 경합을 보호하고 이슈의 낙관적 버전 검사를 유지한다.
- `ProjectAccess.forUpdate`와 `SprintIssueOperations`의 쓰기는 호출하는 Service의 트랜잭션 안에서 실행한다.
- 계획 권한은 `ProjectAccess.isManager/requireManager`가 기본 OWNER·ADMIN과 `project_managers`의 프로젝트별 지정을 합쳐 판단한다. issue·sprint는 이 공개 계약을 호출하고 프로젝트 저장소를 직접 참조하지 않는다. 실행 권한은 계획 관리자 또는 해당 티켓 담당자다. 상태·완료율 전용 PATCH는 두 실행 필드와 version만 쓰며 계획 PUT은 관리자 전용이다.
- 추가 관리자 지정·해제는 workspace 잠금 → project 잠금 순서에서 OWNER·ADMIN 권한을 검사한다. 티켓 변경과 지정 해제는 동일 project 잠금으로 직렬화한다. V7의 멤버 복합 외래 키는 탈퇴 시 프로젝트 지정을 함께 삭제한다. 부모 프로젝트의 추가 권한을 자식에게 상속하지 않는다.
- Exposed 저장소는 `dbQuery`로 현재 트랜잭션에 참여한다. 인증 필터 등 트랜잭션 밖의 호출만 새 트랜잭션을 연다. 같은 유스케이스 안에서 저장소가 별도로 커밋하지 않는다. 멤버·소유권 변경은 잠금 후 권한과 상태를 재검사한다.
- 조회 조합에 필요한 다른 기능의 테이블 투영은 해당 기능의 persistence 안에 최소 컬럼으로 선언한다. 다른 기능의 Table을 직접 참조하거나 해당 데이터의 쓰기 책임을 가져오지 않는다.
- SQL 중복 키 오류는 Spring 예외로 변환하여 기존 HTTP 409 계약을 유지한다. SQL·바인딩 값은 응답에 포함하지 않는다.
- 스키마 변경은 기존 Flyway 마이그레이션으로 관리한다.

## 구조를 확장하는 기준

- QueryService는 검색·페이지 조회나 여러 기능의 조회 조합에 사용한다. 단순 단건 조회에는 별도 클래스를 의무화하지 않는다.
- Handler는 독립적인 변경 흐름이나 복잡한 분기가 서비스의 책임을 흐릴 때 도입한다. 작업마다 파일을 하나씩 만드는 규칙은 두지 않는다.
- 인터페이스는 외부 시스템 경계나 실제로 여러 구현이 필요할 때 둔다. 모든 Service·Repository에 인터페이스를 만들지 않는다.
- 별도 읽기 DB·이벤트 저장소가 필요하기 전에는 Full CQRS를 도입하지 않는다.
- GitHub·GitLab은 `integration/api` 제공자 계약, `internal/client` HTTP·서명·이벤트 변환, `web` 수신, `internal/persistence` 큐·링크로 분리했다. 이슈 연결은 `IssueDevelopmentQueries`, 프로젝트 상태·잠금은 `ProjectAccess` 공개 계약을 사용한다. 네트워크 호출은 DB 트랜잭션 밖에서 처리하며 worker의 링크·전달 결과는 함께 커밋한다. 상세 범위는 [연동 명세](INTEGRATIONS.md)를 따른다.

## 검증

```bash
python3 scripts/check_backend_boundaries.py
cd backend
./gradlew check
```

경계 검사는 디렉터리와 패키지 일치, 다른 모듈의 internal 참조 금지, web의 DB 직접 접근 금지, HTTP 타입의 서비스 유입 금지, 기능 모듈 의존 순환을 검사한다. 이는 패키지 규칙을 검사하는 정적 도구이며 Gradle의 컴파일 격리를 대신하지 않는다. API 동작은 실행 중인 MySQL·메일 환경에서 `python3 scripts/smoke.py`로 검증한다.
