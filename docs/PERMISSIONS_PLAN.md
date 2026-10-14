# arcat 버튼 동작 권한과 OpenFGA 도입 설계

> 작성일: 2026-10-14 KST · 상태: 설계안, 구현 전 · 실행 계획: [작업 단위 계획](plans/2026-10-14-action-permissions.md)

버튼이 실행하는 서버 동작에 이름 있는 권한을 부여한다. 워크스페이스 소유자·관리자가 역할별 기본 정책과 팀원 예외를 설정하며, 화면과 서버가 같은 권한 결과를 사용한다. 접기·정렬·탐색처럼 표시만 바꾸는 버튼은 권한 항목으로 만들지 않는다.

## 1. 현재 구현과 버전 확인

현재 서버는 `WorkspaceAccess`·`ProjectAccess`와 기능 서비스별 가드로 권한을 확인한다. 화면은 `useProjectAccess`와 직접 역할 비교로 OWNER·ADMIN·MEMBER, 프로젝트 관리자, 티켓 담당자·댓글 작성자를 판단한다. 버튼별 정책 편집과 OpenFGA는 아직 구현하지 않았다.

- OWNER·ADMIN: 워크스페이스 관리와 모든 프로젝트의 기본 관리자.
- 별도 프로젝트 관리자: 지정된 프로젝트의 WBS·티켓 계획·스프린트·버전·마일스톤 관리. 부모의 관리 권한을 자식에게 상속하지 않는다.
- 담당자·프로젝트 관리자: 상태·완료율 수정. 댓글은 모든 현재 팀원이 작성하며, 수정은 작성자, 삭제는 작성자 또는 프로젝트 관리자다.
- 소유권 이전·워크스페이스 삭제: OWNER만 수행한다.

요청한 **0.7.x**는 확인할 버전 대상이 있다. [Java SDK 0.7.2](https://github.com/openfga/java-sdk/releases/tag/v0.7.2)는 존재하며 공식 서버의 0.7.x 릴리스는 이번 조사에서 확인하지 못했다. 따라서 **0.7.x를 Java SDK로 해석하고 SDK 0.7.2 + 서버 1.22.0으로 진행한다는 가정**을 명시한다. 사용자에게 버전 확인 답변을 받은 사실로 표현하지 않는다. 확인되지 않은 SDK·엔진 호환성이나 Spring Boot 4에서의 동작을 완료된 사실로 표현하지 않는다. 첫 실행 단계에서 실제 JAR·컨테이너로 Check·contextual tuples·model ID·인증·오류·시간 제한을 검증한 뒤 의존성·이미지 버전을 고정한다.

## 2. 설정 범위와 평가 규칙

첫 버전의 정책 범위는 **워크스페이스**다. 같은 공간의 모든 프로젝트에 역할 정책을 적용하고, 프로젝트 관리자는 현재 프로젝트에서만 해당 역할로 평가한다. 프로젝트별 별도 정책·커스텀 역할·DOM 버튼 ID·임의 정책 코드는 후속 범위다.

설정은 각 액션의 OWNER·ADMIN·PROJECT_MANAGER·MEMBER 행과 팀원별 예외에 `DEFAULT`·`ALLOW`·`DENY`를 제공한다. DEFAULT는 아래 기존 기본값을 사용한다. 저장 시 DEFAULT 항목은 명시적 예외에서 제거한다.

1. 현재 사용자와 실제 리소스를 서버에서 조회하고 워크스페이스 소속·리소스 범위·하드 제한을 확인한다.
2. 해당 리소스의 역할은 OWNER → ADMIN → 해당 프로젝트의 PROJECT_MANAGER → MEMBER 중 하나다. 프로젝트 관리자도 MEMBER 행의 DENY를 중복 적용받지 않는다.
3. DEFAULT 역할 행은 기존 기본값을 제공한다. 실행 담당자·댓글 작성자의 기존 기본 허용은 현재 리소스 사실로 평가한다. ALLOW는 해당 역할이나 팀원에게 후보 허용을 추가한다.
4. 적용되는 역할 DENY 또는 팀원 DENY가 있으면 후보 허용보다 우선한다. 팀원 ALLOW는 역할 DENY를 우회하지 않는다.
5. OpenFGA는 현재 사실·정책의 후보 허용과 DENY를 평가한다. 서버는 요청마다 새로 검사한다.

예: 기본 MEMBER는 자기 담당 티켓의 완료율을 바꿀 수 있다. MEMBER의 `ticket.progress.update`를 DENY하면 담당자 기본 허용도 막힌다. 역할 DENY가 없는 상태에서 특정 팀원에게 `ticket.plan.update`를 ALLOW하면 해당 공간의 티켓 계획을 명시적으로 위임할 수 있다. 이 설정은 그 사람을 프로젝트 관리자나 워크스페이스 관리자로 승격하지 않는다.

## 3. 편집할 수 없는 제한

- 현재 워크스페이스 멤버여야 하며 경로의 프로젝트·티켓·댓글은 실제 같은 범위에 속해야 한다. 팀을 떠난 사람의 남은 담당자·작성자 ID만으로 접근을 허용하지 않는다.
- 상태·완료율은 현재 담당자 또는 프로젝트 관리자만 수정한다. 다른 사람의 댓글 수정은 허용하지 않는다. ALLOW가 있어도 이 제한은 유지한다.
- OWNER만 소유권을 이전하고 공간을 삭제한다. OWNER 역할은 일반 역할 변경·제거로 바꾸지 않는다. 이전 대상은 현재 멤버이며 이전 소유자는 ADMIN이 된다.
- 워크스페이스 초대·역할 변경·멤버 제거·프로젝트 관리자 지정·티켓 양식 설정·연동 자격 증명은 OWNER·ADMIN 범위에서만 조정한다. MEMBER에게 ADMIN 승격·관리자 초대·관리자 지정을 허용하여 정책 관리 권한을 우회 위임하지 않는다.
- 정책 조회·편집·이력 조회는 고정 OWNER·ADMIN, 정책 기본값 복원은 OWNER다. 이 권한은 버튼 매트릭스에 포함하지 않는다. OWNER는 자신의 일반 업무 버튼을 DENY해도 정책을 복원할 수 있다.
- 보관 프로젝트의 티켓·댓글·스프린트·버전·마일스톤·연동 쓰기는 거부한다. 프로젝트 정보 저장·복원은 기존 경로를 유지하고, 개인 저장 보기 작성·삭제와 연동 전달 기록 조회는 보관 상태에서도 가능하다.
- 권한과 별도로 revision·상태 전환·날짜·계층 순환·필드 정책·동일 프로젝트 연결·비밀값 암호화·웹훅 서명을 유지한다. 티켓 신고자·마일스톤 담당자는 관리 권한을 얻지 않는다.

## 4. 액션 카탈로그

W = 워크스페이스, P = 프로젝트, T = 티켓, C = 댓글. PM은 해당 프로젝트의 OWNER·ADMIN·별도 관리자, WM은 OWNER·ADMIN이다. 표는 DEFAULT 기준이다. 읽기·멤버십은 첫 도입에서 기존 공개 범위를 유지하며 개별 데이터 비공개 정책은 추가하지 않는다.

| 액션 | 리소스 | 기본 허용 | 추가 제한·실제 동작 |
| --- | --- | --- | --- |
| `project.create` | W | WM | 같은 공간의 부모 프로젝트 |
| `project.update` | P | WM | 프로젝트 정보·부모·키 저장, WM 제한 |
| `project.archive`, `project.restore` | P | WM | 같은 PUT의 보관 변경, WM 제한 |
| `project.manager.assign`, `project.manager.remove` | P | WM | 현재 팀원·활성 프로젝트, WM 제한 |
| `ticket_fields.update` | W | WM | 전체 공간의 양식, WM 제한·revision |
| `workspace.invite`, `workspace.invitation.revoke` | W | WM | WM 제한, 초대 역할 MEMBER/ADMIN |
| `workspace.member.role.update`, `workspace.member.remove` | W | WM | WM 제한, OWNER 보호 |
| `ticket.create` | P | PM | 새 티켓·WBS 하위 생성·모든 보기의 같은 작성 동작 |
| `ticket.plan.update`, `ticket.delete` | T | PM | 계획·배정·계층·일정 또는 삭제 |
| `ticket.status.update`, `ticket.progress.update` | T | PM 또는 담당자 | 담당자/PM 하드 제한, PATCH 및 전체 PUT 교차 검사 |
| `ticket.relation.create`, `ticket.relation.delete` | T | PM | 같은 프로젝트 관계·순환 방지 |
| `comment.create` | T | 모든 팀원 | 활성 프로젝트 |
| `comment.update` | C | 작성자 | 작성자 하드 제한 |
| `comment.delete` | C | 작성자 또는 PM | 활성 프로젝트 |
| `version.create` | P | PM | 버전·목표 날짜 검증 |
| `sprint.create`, `sprint.start`, `sprint.close` | P | PM | 스프린트 실제 상태·동시 시작 제한 |
| `sprint.ticket.assign`, `backlog.reorder` | P | PM | 계획 스프린트·전체 백로그 규칙 |
| `milestone.create`, `milestone.update`, `milestone.cancel`, `milestone.reopen` | P | PM | 실제 마일스톤 경로·revision·이력 검사 |
| `integration.connect`, `integration.check`, `integration.disconnect`, `integration.delivery.retry` | P | WM | WM 제한·활성 프로젝트·연동 상태 |
| `integration.delivery.read` | P | WM | WM 제한, 보관 중 조회 허용 |
| `saved_view.create`, `saved_view.delete` | P | 모든 팀원 | 자기 보기만, 보관 중 허용 |

소유권 이전·공간 삭제는 고정 OWNER 액션으로 별도 검사하고 설정 카탈로그에서 읽기 전용으로 설명한다. 워크스페이스 생성·초대 수락은 인증·초대 이메일 계약을 유지한다. 외부 웹훅은 사용자 버튼 권한으로 바꾸지 않는다. 화면의 접기·필터·정렬·확대·기간 이동·탐색·미리보기·로컬 내보내기는 기존 데이터 조회 범위에서 동작한다.

전체 PUT으로 권한을 우회하지 않도록 티켓 계획 저장은 `ticket.plan.update`를 항상 검사하고, 서버가 준비한 실제 변경 값에서 상태·완료율이 바뀌면 각각 `ticket.status.update`·`ticket.progress.update`도 검사한다. 일부 권한이 거부되면 전체 저장과 이력을 원자적으로 거부한다. 숨김 필드 보존·null·필드 정책 처리를 적용한 최종 값과 잠근 기존 값을 비교한다.

상태 PATCH는 상태 권한을 검사한다. 실행 PATCH는 바뀐 상태·완료율 각각을 검사하며 변경이 없는 요청은 두 권한을 모두 요구한다. 프런트는 완료율만 허용받은 경우 상태를 읽기 전용으로 표시하고 값을 보존한다. 프로젝트 PUT은 실제 정보 변경에 `project.update`, 보관 변경에 `project.archive` 또는 `project.restore`를 추가 검사한다. 변경 없는 프로젝트 PUT도 `project.update`가 필요하다.

스프린트 종료가 미완료 티켓을 다음 스프린트나 백로그로 이동하면 `sprint.close`뿐 아니라 `sprint.ticket.assign`도 검사한다. 미완료가 0개면 편성 권한을 추가 요구하지 않는다. 한 권한이 거부되면 종료·이동·활동 이력을 모두 보존한다.

## 5. 구조와 OpenFGA 평가

`authorization/api`는 `PermissionAction`·`PermissionResource`·`PermissionContext`·`PermissionDecision`, `Authorization.check/require/batch`, `PermissionPolicies`의 작은 공개 계약이다. 내부에는 정책 서비스·Exposed 저장소와 Java SDK 어댑터를 둔다. 기능 서비스가 현재 사실을 서버에서 조회해 typed context를 전달한다. 클라이언트의 role·assignee·author·workspaceId는 평가 사실로 사용하지 않는다.

의존 방향은 기능 서비스 → authorization.api이고 authorization은 기능 모듈을 참조하지 않는다. 효과적 권한 조회만 실제 조합 역할의 `permissionquery`가 workspace.api·project.api·issue.api·authorization.api를 호출한다. issue의 새 공개 조회는 티켓 담당자·댓글 작성자·관계 원본 티켓과 실제 프로젝트만 반환하며 다른 모듈의 Table을 가져오지 않는다. 정책 관리 HTTP는 workspace의 서비스가 현재 관리 역할·잠금을 확인한 뒤 authorization.api로 위임한다. 별도 저장소 인터페이스·이벤트 버스·Gradle 다중 모듈은 추가하지 않는다.

**MySQL을 현재 사실과 설정의 원본으로 유지한다.** 멤버십·역할·프로젝트 관리자·담당자·작성자·보관 상태·정책을 현재 요청에서 조회하고 **contextual tuples**로 Check에 전달한다. 저장된 사용자·프로젝트 튜플을 OpenFGA에 미러링하지 않으므로 이중 쓰기·outbox·백필 동기화는 도입하지 않는다.

각 액션별 scoped capability 객체는 `workspaceId/resourceType/resourceId/action`을 포함한다. 모델은 현재 멤버십·하드 eligibility, 하나의 유효 역할, 담당자/작성자 기본 허용, 역할 정책·팀원 예외를 별도 relation으로 받아 `member and eligible and (candidate_allow but not applicable_deny)`를 평가한다. 역할 선택과 리소스 사실 조회는 서버 책임이며, 최종 후보 허용과 DENY 결합은 모델 책임이다. 서버에서 최종 allowed를 미리 계산해 FGA에 그대로 넘기는 모형으로 대체하지 않는다.

서버 저장에는 전용 store와 **명시적 immutable authorization model ID**만 둔다. 애플리케이션 튜플은 0개여야 하며 모델 릴리스·복원 시 이를 확인한다. 모델 ID·store ID·URL·인증 정보는 서버 설정이며 프런트에 노출하지 않는다. 공유 store의 기존 튜플이나 `latest model`을 암묵적으로 사용하지 않는다.

초기화·업그레이드는 운영자 전용 스크립트가 인증된 엔진에 모델을 등록하고 검증한 ID를 설정에 반영한다. 런타임 Check 자격 증명과 모델 배포 자격 증명을 분리할 수 있는 배포 구성을 문서화하며, 최소한 엔진은 내부 네트워크와 인증으로 보호한다. 사용자 API로 store·model을 생성·수정·삭제하지 않는다. 런타임은 model 조회와 Check만 수행한다. 엔진 데이터/모델·MySQL 정책·설정 ID를 함께 백업하고, 복원한 store/model을 확인한 후 사용한다. 기본 정책 복원 API는 MySQL 정책만 초기화하며 FGA store/model을 바꾸지 않는다.

각 Check contextual tuples는 최대 **100개**, 서버 batch 요청은 최대 **50개 체크**, 동시 엔진 호출은 **4개**다. 초과 입력은 검증 오류이며 서버 사실 생성이 100개를 넘으면 잘라 허용하지 않고 503으로 실패한다. 제안 시간 제한은 연결 500ms·호출 1,000ms·요청 전체 5,000ms, 자동 재시도 0회다. SDK의 실제 설정 API와 동작은 첫 실행 검사에서 확인한다. 0.7.2가 native BatchCheck를 지원한다고 가정하지 않고 제한된 Check 호출 조합을 기준으로 한다.

거부는 403 `PERMISSION_DENIED`, 엔진 실패·시간 초과·모델/인증 오류는 503 `AUTHORIZATION_UNAVAILABLE`로 처리한다. 엔진 장애를 기존 role allow로 대체하지 않는다. 양성 결과를 다른 쓰기·권한 변경 요청까지 캐시하지 않는다. 고정 SQL 역할로 보호한 정책 조회·복원은 엔진 장애 중 복구에 사용할 수 있고 일반 업무 권한으로 확장하지 않는다.

## 6. 정책 저장·동시 변경·이력

V10은 `permission_policies`(workspace·revision), `permission_role_rules`(workspace·action·role·effect), `permission_member_overrides`(workspace·member·action·effect), `permission_policy_activities`(actor·type·revision 전후·검증된 diff·사유·UTC)를 추가한다. revision은 0부터 시작하고 정책이 없으면 현재 기본값이다. 저장된 effect는 ALLOW/DENY만 사용한다. member override는 workspace_members 복합 FK를 사용하여 탈퇴 후 남는 허용을 제거한다.

역할 규칙과 예외 전체 저장은 현재 revision을 요구하고 오래된 값은 409 `PERMISSION_POLICY_CHANGED`다. 정책·revision·이력은 한 트랜잭션에서 기록한다. 성공한 동일 PUT도 revision을 1 증가시키고 이력을 1개 기록한다. 역할 키·액션은 카탈로그의 고정 값이며 action/role 또는 action/member 중복은 400이다. 예외 대상은 같은 공간의 현재 멤버, 예외는 공간당 최대 1,000개다. 정적으로 금지된 역할/액션 조합과 대상의 현재 역할로 불가능한 민감 ALLOW는 저장 시 400이다. 담당자·작성자 자격은 실제 티켓·댓글에서 동적으로 검사하므로 공간 정책 저장 때 MEMBER의 상태 ALLOW를 배정된 티켓이 없다는 이유로 거부하지 않는다. OWNER·ADMIN 정책 관리 자체의 변경 요청은 받지 않는다.

정책 PUT·복원과 적용받는 업무 쓰기는 READ_COMMITTED에서 **workspace → project → ticket/comment/milestone** 순서로 필요한 행을 잠근 뒤 현재 권한 사실·정책을 다시 읽는다. 기존 프로젝트 생성·수정·관리자 지정·티켓·스프린트·필드 설정·멤버 변경 경로도 이 규칙을 검사한다. 잠금 전에 평가한 허용을 잠금 후 재사용하지 않는다. 업무에 필요 없는 하위 리소스는 잠그지 않는다.

티켓 재배정·작성 정보는 잠근 리소스의 현재 값으로 검사한다. 멤버 제거는 같은 workspace 잠금에서 예외 제거와 필요한 정책 revision·이력 변경도 처리하여 재초대 시 예전 ALLOW가 복원되지 않게 한다. 비활성 멤버의 역사적 actor ID는 이력으로 보존한다. 기존 일반 @Transactional 경로의 MySQL RR 잠금 대기 후 읽기가 즉시 철회를 보장한다고 가정하지 않는다.

연동은 토큰 복호화·외부 제공자 호출 전에 현재 권한을 검사한다. 제공자 I/O는 DB 잠금 밖에 두고 성공 변경과 권한 확인 실패의 DISABLED 변경 모두 READ_COMMITTED `TransactionTemplate`에서 workspace→project 잠금 후 현재 OpenFGA 권한을 다시 검사한다. 외부 I/O 전에 얻은 허용을 후속 저장에 재사용하지 않는다.

## 7. HTTP 계약

아래는 신규 계약이며 아직 제공하지 않는다. 현재 사용자만 검사한다. 임의 userId·role·assignee·author·tuples·model ID를 클라이언트에서 받지 않는다.

| 경로 | 계약 |
| --- | --- |
| GET `/api/workspaces/{workspaceId}/permissions?resourceType=PROJECT&resourceId={id}` | 자기 해당 리소스에 적용되는 카탈로그 결정. W 리소스는 workspace ID, P/T/C는 서버가 실제 소속을 확인. `{resource,policyRevision,decisions:[{action,allowed,reason}]}` |
| POST `/api/workspaces/{workspaceId}/permissions/batch` | `{checks:[{resource:{type,id},action}]}` 최대 50개. 모든 리소스를 서버 검증하고 입력 순서로 동일 결과 반환. 엔진 오류 시 partial success 없이 503. 중복·unknown action/type·지원하지 않는 action/resource 조합은 400. |
| GET `/api/workspaces/{workspaceId}/permissions/policy` | 고정 OWNER/ADMIN. 카탈로그·기본값·명시적 역할/멤버 규칙·revision·설정 가능 범위 반환. |
| PUT 같은 `/policy` | `{revision,roleRules:[{action,role,effect}],memberOverrides:[{action,userId,effect}],reason}`. 누락/null/음수 revision 거부, nullable/default를 0으로 바꾸지 않음. full replacement, DEFAULT는 저장에서 제거. |
| POST `/api/workspaces/{workspaceId}/permissions/policy/reset` | OWNER. `{revision,reason}`으로 현재 정책을 기본값으로 복원하고 revision·이력 유지. 소유권이나 model/store 변경 없음. |
| GET `/api/workspaces/{workspaceId}/permissions/policy/activities?page=0&size=50` | 고정 OWNER/ADMIN. typed diff·사유·행위자·UTC, 최대 size 100. |

사유는 원문 최대 1,000자·공백 제거 후 필수다. action/type/role/effect는 enum, ID는 양의 안전 정수다. 다른 공간 리소스는 요청 workspace에 대한 소속 검사 뒤 404, 요청 workspace 비멤버는 403이다. 없는 리소스는 404이며 batch에서도 임의 객체 체크로 접근을 확대하지 않는다. 허용 여부의 reason은 `ALLOWED`, `DENIED`, `NOT_ELIGIBLE`, `PROJECT_ARCHIVED` 중 하나다. 인프라 장애는 결정 항목의 false로 숨기지 않는다.

## 8. 화면과 접근성

새 `features/authorization`은 공개 액션 타입·Valibot 계약·TanStack Query 훅을 제공하며 project·issue 런타임 의존을 갖지 않는다. 기존 기능들은 공개 `usePermissions(resource)`·`usePermissionChecks(checks)`를 사용한다. React role/assignee 비교는 설명과 표시용이고 실제 조작 권한의 원본은 서버 결과다. 로그인·로그아웃·계정 전환 시 permission cache를 비우고 공간·프로젝트·재배정·정책 변경과 403 응답 시 관련 결과를 무효화한다.

권한 조회 중·실패 상태에서는 관리 조작을 허용하지 않으며 이름 있는 안내와 재시도 버튼을 제공한다. 단순 권한 부족은 비활성 버튼과 연결된 설명으로 보여 주거나 기존 비노출 패턴을 유지하되 같은 기능의 화면에서 일관되게 적용한다. 바쁜 상태·보관·필수 입력·revision 충돌은 권한과 별도로 disable 조건을 유지한다. 기존 Dialog의 열기 버튼 복원·초점 테두리·터치 크기·모션 감소·삼색 포인트를 보존한다.

설정 화면은 '권한 설정' 진입점, 기능별 그룹의 역할 매트릭스와 팀원 예외, DEFAULT 설명, DENY 우선 안내, 저장·변경 취소·충돌 후 초안 유지·최신 정책 확인·이력·OWNER 기본값 복원을 제공한다. 민감 액션의 제한된 셀에는 이유를 적는다. readonly 사용자에게 편집 버튼을 노출하지 않는다. UI 개발 후 실제 1920×1080 화면을 추가하며 현재 제품 사진을 기획 화면으로 대체하지 않는다.

## 9. 실행 단계와 완료 기준

1. **모델·SDK 실행 기반:** 확인된 버전을 고정하고 실제 엔진의 contextual Check·deny·model/auth/outage를 검사한다. 현재 앱 권한은 그대로다.
2. **정책과 읽기 API:** MySQL 정책·이력·복원 및 실제 소속을 검증하는 자기 권한 GET/batch를 제공한다. 기존 업무 쓰기와 버튼 전환 전의 기본값 동등성을 검사한다.
3. **서버 쓰기 전환:** 전 카탈로그 동작을 OpenFGA로 검사하고 혼합 PUT·현재 사실·철회 경합·장애 시 무변경을 증명한다.
4. **화면과 설정:** 서버 결정으로 버튼·상태·완료율을 분리하고 정책 편집·충돌·복구 UI를 제공한다.
5. **전체 CI·운영 자료:** disposable 엔진을 수용 검사에 포함하고 fresh/V9 업그레이드·복원·전체 회귀·실제 화면·문서·최종 CI를 확인한다.

각 단계는 독립 커밋으로 검증 가능해야 한다. 1~2단계 완료를 버튼 권한 도입 완료로 표현하지 않는다. 역할/담당자/작성자 기본값, 다른 공간·프로젝트·하위 프로젝트 범위, 역권한 변경, 전체 PUT 우회, 정책 복원, 권한 철회 중 대기 쓰기, 위조 API, 엔진 503에서 업무·이력 불변, 100 tuple/50 batch 한도, 계정 전환·폼 초안·키보드·터치가 모두 검사되어야 전체 완료다.
