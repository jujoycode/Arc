# arcat Action Permissions Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 기존 권한 기본값을 유지하면서 워크스페이스 관리자가 서버 동작별 권한을 설정하고 모든 관련 버튼과 API가 OpenFGA의 같은 결정을 사용하게 한다.

**Architecture:** MySQL의 현재 멤버십·역할·담당자·작성자·정책을 서버에서 읽고 contextual tuples로 전용 OpenFGA store의 고정 model에 전달한다. authorization은 typed context만 소비하며, permissionquery는 다른 기능의 공개 조회를 조합하고 workspace는 정책 관리 권한을 보호한다. 기능별 쓰기는 workspace부터 잠근 뒤 현재 사실을 재검사하고, 프런트는 서버 결정만 조작 권한으로 사용한다.

**Tech Stack:** React 19, TypeScript, Valibot, TanStack Query, shadcn/ui, Tailwind v4, pnpm 11.19.0, Kotlin/Spring Boot 4, Exposed DSL, MySQL 8, Flyway, Docker Compose; OpenFGA Java SDK 0.7.2 + 서버 1.22.0은 요청의 0.7.x를 SDK로 해석한 진행 가정이며 실제 조합 검증 전이다.

**Spec:** [버튼 동작 권한 설계](../PERMISSIONS_PLAN.md). 이 계획은 구현 전이며 아래 체크박스는 아직 완료를 뜻하지 않는다.

## Global Constraints

- 정책 범위는 워크스페이스, 효과는 DEFAULT·ALLOW·DENY, 현재 리소스의 하나의 역할을 선택하고 DENY가 우선한다.
- 현재 소속·실제 프로젝트 범위·담당자/PM 실행·댓글 작성자 수정·OWNER 이전/삭제·민감 WM 동작·고정 정책 관리 역할을 유지한다.
- authorization은 feature를 import하지 않는다. 기능은 다른 기능의 api만 import한다. frontend authorization은 project·issue 런타임 의존을 갖지 않는다.
- 애플리케이션 FGA 저장 튜플은 0개다. 전용 store와 immutable model ID를 고정하고 인증·복원 절차를 문서화한다.
- 최대 100 contextual tuples/Check, 50 checks/batch, 병렬 4, 연결 500ms·호출 1,000ms·전체 5,000ms·자동 재시도 0회다. 실제 SDK 설정과 동작을 검증한다.
- 거부 403 PERMISSION_DENIED, 엔진/모델/인증/시간 제한 실패 503 AUTHORIZATION_UNAVAILABLE. 기존 역할 허용 fallback과 업무 쓰기 간 양성 결과 캐시를 금지한다.
- 정책 revision은 필수 nullable 전송 값에 명시적 검증, 충돌 409 PERMISSION_POLICY_CHANGED. 정책·revision·typed 이력을 함께 저장한다.
- 필요한 쓰기 잠금은 READ_COMMITTED의 workspace → project → ticket/comment/milestone, 잠금 후 현재 사실·정책을 읽는다.
- API·DB·폼·Dialog 초점·KRDS 치수·삼색 포인트·기존 보기와 사진은 유지하고 실제 새 UI 구현 후에만 사진을 추가한다.
- 독립 검증·리뷰를 통과한 작업 단위마다 올바른 Git author로 커밋한다. 사용자 승인으로 커밋·push 권한은 이미 제공되었다.

실행 책임: root가 모든 커밋·게시와 기존 서버 가드 전환을 담당한다. 기반 작업자는 공유 액션·컨텍스트·정책 DTO와 SDK 어댑터·모델, 정책 작업자는 SQL 저장·AuthorizationService·관리/조회 API, 운영 작업자는 Compose·설정·초기화·CI, 화면 작업자는 프런트를 담당한다. 서로 다른 파일은 병렬로 진행하고 공유 계약 변경은 root가 먼저 조정한다. [백엔드 구조](../BACKEND_ARCHITECTURE.md)와 [프런트 구조](../FRONTEND_ARCHITECTURE.md)의 공개 경계와 READ_COMMITTED 적용 범위도 root가 갱신한다.

## Review Focus

- 티켓·프로젝트 전체 PUT의 혼합 변경으로 DENY된 실행/보관 권한을 우회하지 않는다 — Task 3의 mixed_put tests.
- 잠금 대기 중 역할·프로젝트 관리자·담당자·정책이 철회되면 변경과 이력 없이 거부한다 — Task 3과 5의 revocation_wait tests.
- 엔진 503·잘못된 model/auth·느린 응답에서 허용 fallback·부분 batch·부분 업무 저장을 하지 않는다 — Task 1, 3, 5.
- 계정/공간 전환·작성 중 정책 충돌에서 다른 사용자의 허용을 재사용하거나 초안을 지우지 않는다 — Task 4.
- 멤버 제거·재초대와 OWNER의 일반 동작 DENY 후에도 오래된 예외는 복원되지 않고 OWNER는 정책 복구가 가능하다 — Task 2, 4, 5.

---

## 파일 책임과 고정 계약

실제 변경 경로는 아래 Tasks에 적는다. 공통 계약은 다음 이름으로 고정하며 SDK 타입이나 servlet 타입을 api에 노출하지 않는다.

- `PermissionResource(type: WORKSPACE|PROJECT|TICKET|COMMENT, id: Long)`, `PermissionRole = OWNER|ADMIN|PROJECT_MANAGER|MEMBER`.
- `PermissionContext(actorId,workspaceId,resource,role,projectId?,archived=false,assigneeId?,authorId?)`는 현재 서버 조회 사실만 담는다.
- `Authorization.check(context,action): PermissionDecision`, `require(context,action): Unit`, `batch(List<PermissionCheck>): List<PermissionDecision>`; Check는 context/action, Decision은 action/allowed/reason.
- `PermissionReason = ALLOWED|DENIED|NOT_ELIGIBLE|PROJECT_ARCHIVED`, `PolicyEffect = DEFAULT|ALLOW|DENY`.
- `PermissionPolicy(workspaceId,revision,roleRules,memberOverrides)`, role rule은 action/role/effect, member override는 action/userId/effect; 저장 input은 nullable revision과 reason, reset은 nullable revision/reason.


`PermissionAction`의 wire key는 명세 4절의 dot 이름이며 OWNER 이전/삭제를 고정 액션으로 추가한다. `PermissionPolicies.get(context): PermissionPolicy`, `save(context,input): PermissionPolicy`, `reset(context,input): PermissionPolicy`, `activities(context,page,size): PermissionPolicyActivityPage`, `removeMemberOverrides(context,userId): Unit`를 공개한다. 활동은 `{id,actorId,type,previousRevision,revision,reason,changes,createdAt}`와 페이지 `{items,total,page,size}`다. changes는 검증된 역할/멤버 규칙의 전후 목록이며 임의 요청 map이 아니다. 원본 SQL 사실을 담은 context는 서버에서만 생성한다.

### Task 1: 실제 모델·SDK·서버의 검증 가능한 평가 기반

**Files:** Create `backend/src/main/kotlin/io/arcapp/backend/authorization/api/Permissions.kt`, `PermissionAction.kt`, `internal/client/OpenFgaPermissionEngine.kt`, `internal/ContextualPermissionTuples.kt`; Create `backend/src/main/resources/openfga/permissions-model.json`, `scripts/permissions/engine_smoke.py`; Modify `backend/build.gradle.kts`, `backend/src/main/resources/application.yml`, `compose.yaml`, `compose.deploy.yaml`, `.env.example`; Test `backend/src/test/kotlin/io/arcapp/backend/authorization/internal/AuthorizationModelTest.kt`, `OpenFgaPermissionEngineTest.kt`. `AuthorizationService`는 정책 저장소를 연결하는 Task 2에서 구현한다.

**Interfaces:** Consumes the fixed context/action contract and current default catalog from the spec. Produces `Authorization.check/require/batch` and fixed model resource. Adapter consumes `(context,action,policy)` without feature imports. Missing policy is revision 0 defaults until Task 2 supplies repository.

- [ ] **Step 1:** Write failing `default_matrix_matches_existing_roles`, `deny_wins_over_assignee_and_member_allow`, `hard_eligibility_blocks_foreign_comment_or_unassigned_executor`, `contextual_100_accepted_101_rejected`, `engine_error_never_falls_back`, `batch_51_rejected`; assertions use the spec defaults, 403/503 distinction and no partial result.
- [ ] **Step 2:** Run `cd backend && ./gradlew test --tests '*AuthorizationModelTest' --tests '*OpenFgaAuthorizationClientTest'`; confirm the new tests fail before implementation.
- [ ] **Step 3:** Implement the exact contract/catalog and contextual relation model with role policy, member exceptions and applicable deny. Configure the assumed SDK 0.7.2 and authenticated server 1.22.0, immutable model/store IDs and bounded Check calls. Add a disposable real-engine fixture and model bootstrap; verify actual SDK timeout/retry controls rather than guessing method names.
- [ ] **Step 4:** Run the targeted tests and `python3 scripts/permissions/engine_smoke.py` against the disposable engine, then the production Java SDK adapter tests against that same authenticated real server, backend boundaries and `./gradlew check bootJar`. Actual SDK tests must prove contextual allow/deny and pinned model, and its error/timeout tests must exercise the production adapter. Python checks and mocked HTTP alone do not establish SDK/server compatibility. Record exact SDK/server versions, model digest and zero stored application tuples. Do not infer native BatchCheck support.
- [ ] **Step 5:** Commit the independently tested engine integration as `feat: add OpenFGA action authorization foundation`; existing business guards remain active until Task 3.

### Task 2: SQL 정책·보호된 관리 API·자기 권한 조회

**Files:** Create `backend/src/main/resources/db/migration/V10__add_action_permission_policies.sql`; Create `authorization/api/PermissionPolicyContracts.kt`, `PermissionPolicies.kt`, `authorization/internal/PermissionPolicyService.kt`, `internal/persistence/PermissionPolicyTables.kt`, `PermissionPolicyRepository.kt`; Create `workspace/internal/WorkspacePermissionService.kt`, `workspace/web/PermissionPolicyController.kt`; Create `permissionquery/internal/PermissionQueryService.kt`, `permissionquery/web/PermissionController.kt`; Create `issue/api/IssuePermissionQueries.kt`; Modify `workspace/api/WorkspaceAccess.kt`, `project/api/ProjectAccess.kt`, relevant owning repositories, `workspace/internal/MembershipService.kt`; Test `authorization/internal/PermissionPolicyPersistenceTest.kt`, `permissionquery/internal/PermissionQueryTest.kt`.

**Interfaces:** Consumes Task 1 contracts. Produces `PermissionPolicies` signatures above; `WorkspaceAccess.permissionContext(workspaceId,actorId): PermissionContext`, `ProjectAccess.permissionContext(projectId,actorId): PermissionContext`; `IssuePermissionQueries.ticket(actorId,workspaceId,id): PermissionContext`, `comment(actorId,workspaceId,id): PermissionContext`. Query module validates actual scope through those public methods before calling batch. Policy orchestration stays in workspace so authorization never depends on workspace/issue/project.

- [ ] **Step 1:** Write failing `policy_missing_is_default_revision_zero`, `revision_null_negative_stale_rejected`, `policy_audit_rolls_back_with_failed_save`, `deny_priority_and_default_remove`, `nonmember_or_cross_scope_never_checked`, `policy_admin_not_delegatable_owner_reset_survives_business_deny`, `member_removed_reinvited_does_not_restore_allow`. Pin all six HTTP contracts, batch input order and 50 limit from the spec.
- [ ] **Step 2:** Run `cd backend && ./gradlew test --tests '*PermissionPolicyPersistenceTest' --tests '*PermissionQueryTest'`; confirm expected new-contract failures.
- [ ] **Step 3:** Implement V10 policy/rule/member-exception/activity tables and 1,000-exception cap. Save/reset in one locked READ_COMMITTED transaction, validate current member targets, omit DEFAULT rows, advance revision/audit and preserve owner recovery. Add current-user GET/batch and OWNER/ADMIN policy endpoints. Member removal deletes overrides and records revision/audit in the same workspace lock. No FGA application writes or outbox.
- [ ] **Step 4:** Run targeted tests, both boundary checks, backend `check bootJar` and actual MySQL policy API cases. Expect fresh V1–V10 and seeded V9→V10 to retain existing membership/projects/tickets while policies start at defaults.
- [ ] **Step 5:** Commit `feat: add workspace action policies and permission queries`; do not claim button migration complete.

### Task 3: 기존 서버 동작을 현재 사실 기반 권한으로 전환

**Files:** Modify `workspace/internal/WorkspaceService.kt`, `MembershipService.kt`, `internal/persistence/MembershipRepository.kt`; `project/internal/ProjectService.kt`; `issue/internal/IssueService.kt`; `sprint/internal/SprintService.kt`; `ticketfield/internal/TicketFieldService.kt`; `milestone/internal/MilestoneService.kt`; `integration/internal/IntegrationService.kt`; `savedview/internal/SavedViewService.kt`; owning context/lock helpers from Task 2. Test `authorization/internal/PermissionMutationTest.kt`; Create `scripts/permissions-smoke.py`.

**Interfaces:** Consumes `Authorization.require(context,action)` and current context loaders. Produces the same existing HTTP routes/data shapes, with live OpenFGA decisions for each catalog action and protected owner operations. No new effective-manager role is persisted.

- [ ] **Step 1:** Write failing `ticket_mixed_put_cannot_bypass_status_or_progress_deny`, `project_mixed_put_cannot_bypass_archive_deny`, `sprint_close_assignment_deny_blocks_unfinished_moves_but_zero_unfinished_closes`, `integration_disabled_error_branch_rechecks_fresh_permission`, `progress_only_patch_preserves_denied_status`, `forged_actor_facts_ignored`, `revocation_wait_rejects_write_and_audit`, `archived_saved_view_and_delivery_read_still_work`, `engine_503_leaves_business_and_audit_unchanged`. Include OWNER/ADMIN/PM/member/assignee/author/outsider, parent-child scope and protected admin operations.
- [ ] **Step 2:** Run `cd backend && ./gradlew test --tests '*PermissionMutationTest'`; confirm denied actions currently bypass the proposed engine tests.
- [ ] **Step 3:** Replace operation guards with action checks after needed workspace→project→resource locks and fresh READ_COMMITTED reads. Keep current business validations. Compare final prepared PUT values to locked existing values for additional status/progress/archive actions; one denied action rolls back the whole request. Restrict execution to assignee/PM and author-only edit, protect WM/owner operations, preserve archive exceptions. Sprint close also requires assignment for unfinished moves to backlog/next sprint. Check integration before decrypt/provider I/O and recheck success and DISABLED error writes in READ_COMMITTED TransactionTemplate after locks.
- [ ] **Step 4:** Run targeted tests, actual MySQL `scripts/permissions-smoke.py`, `scripts/smoke.py`, `scripts/milestone-smoke.py`, `scripts/ticket-fields-smoke.py` using existing runtime argument conventions. Expect full baseline behavior and intentional action denies; inspect real lock-wait revocation proofs and unchanged DB/history after deny/503.
- [ ] **Step 5:** Commit `feat: enforce configured action permissions on backend operations` after independent source/security review.

### Task 4: 서버 결정 기반 버튼과 정책 설정 화면

**Files:** Create `frontend/src/features/authorization/index.ts`, `api/schema.ts`, `api/usePermissions.ts`, `api/usePermissionChecks.ts`, `api/permissionActions.ts`, `internal/ui/PermissionPolicyPage.tsx`, `internal/model/policyFormSchema.ts`; Modify `frontend/src/app/App.tsx`, `project/api/useProjectAccess.ts`, `issue/internal/ui/IssueForm.tsx`, `TicketExecutionForm.tsx`, `IssueDetailScreen.tsx`, `IssuesScreen.tsx`, `kanban/internal/ui/BoardScreen.tsx`, `planning/internal/ui/WbsScreen.tsx`, `gantt/internal/ui/GanttScreen.tsx`, `sprint/internal/ui/BacklogScreen.tsx`, `SprintsScreen.tsx`, `settings/internal/ui/SettingsScreen.tsx`, `integration/internal/ui/IntegrationSettings.tsx`, `ticketfield/internal/ui/TicketFieldsPage.tsx`, `workspace/internal/ui/WorkspacePage.tsx`, owning auth/account cache invalidation; Modify `scripts/browser-smoke.mjs`; Create `scripts/permissions-browser-smoke.mjs`.

**Interfaces:** Consumes actual GET/batch DTOs validated by Valibot. Produces `usePermissions(workspaceId,resource)` with `ready`, `can(action)`, error/refetch; `usePermissionChecks(workspaceId,checks)` for row-specific ticket/comment actions. Query loading/error never produces allow. `/workspaces/$workspaceId/permissions`는 보호된 정책/catalog/activity API와 OWNER 복원을 사용한다. Shared UI does not import features; each owning screen consumes authorization's public index.

- [ ] **Step 1:** Write failing rendered cases `same_ticket_create_permission_all_views`, `status_denied_progress_allowed`, `comment_author_only_controls`, `permission_query_error_disables_mutation`, `account_and_workspace_switch_clears_old_allow`, `open_form_permission_revoked_preserves_input_but_server_rejects`. Add `policy_revision_conflict_preserves_draft`, `member_cannot_open_editor`, `owner_reset_recovers_denied_business_action`, `member_status_allow_valid_without_assignee_at_policy_save`; check real controls/API, field error links, keyboard and 360px layout.
- [ ] **Step 2:** Run `node scripts/permissions-browser-smoke.mjs` against Task 3 runtime; confirm current local role guards fail the new configured-denial cases.
- [ ] **Step 3:** Implement validated hooks and replace mutation permission role checks per semantic action. Keep archive/busy/state/validation conditions separate. Disable status or progress individually, preserve existing full form data, derive effective action labels from server. Invalidate permission results on policy/member/manager/assignment changes and 403; clear cache on account changes. Implement grouped DEFAULT/ALLOW/DENY matrix, member exceptions, DENY priority, validated reason, draft-preserving revision/latest-policy flow, history and OWNER reset. Dynamic assignee/author eligibility is explained and checked on actual resources, not rejected at policy save. Local navigation/collapse/export keeps its existing behavior.
- [ ] **Step 4:** Run `cd frontend && pnpm lint && pnpm build`, boundary checks and the new/old browser acceptance. Expect consistent action states across WBS/Gantt/table/board/sprint and unchanged dialog focus, 48/40/32px controls, touch and light/calico styling.
- [ ] **Step 5:** Commit `feat: add server-driven action controls and permission settings`.

### Task 5: CI·복원·최종 검증과 게시

**Files:** Modify `scripts/ci/acceptance.sh`, `.github/workflows/ci.yml`, `scripts/deploy/backup.sh`, `docs/DEPLOYMENT.md`, `docs/CI.md`; Extend permission API/browser smoke scripts; Create `scripts/permissions-model-bootstrap.py` and `docs/OPENFGA_OPERATIONS.md` if Task 1 has not already supplied the bootstrap; use existing artifact paths and gate job.

**Interfaces:** Consumes immutable backend/frontend artifacts and all Task 1–4 interfaces. Produces disposable authenticated engine lifecycle in acceptance, model ID publication, proof logs and deploy/restore instructions without exposing credentials.

- [ ] **Step 1:** Add failing acceptance cases for 50/51 batch, 100/101 contextual cap, missing model/auth and delayed/stopped engine, SQL revocation during blocked writers, member departure/reinvite, fresh V10/seeded V9 upgrade, restored policy/model/store ID with zero application tuples. Confirm the unconfigured acceptance engine causes the expected new failures.
- [ ] **Step 2:** Implement isolated engine bootstrap/readiness/cleanup and inject exact runtime store/model/auth into immutable artifact execution. Add permission API/browser checks to acceptance, diagnostic failure artifacts and existing gate. Preserve strict failed/cancelled/skipped gate handling. Engine restore uses verified pinned model/store and owner policy reset remains separately protected.
- [ ] **Step 3:** Run full `scripts/ci/acceptance.sh` with existing fixture environment plus disposable OpenFGA. Expect existing API/integration/browser/milestone/fields/calico and new permissions checks all pass, denied/unavailable writes leave state and history untouched, and engine cleanup does not touch user deployment containers.
- [ ] **Step 4:** Verify real-engine default/deny behavior, upgrade/restore preservation and bounded failure duration in saved artifacts; review branch-protection/ruleset evidence separately from workflow success and do not claim an unreadable rule is enforced.
- [ ] **Step 5:** Commit `test: verify action permissions in CI and restore workflow`.

- [ ] **Step 6:** Reconcile actual catalog/APIs/SDK/server/model/limits in STATUS/TODO/architecture/product docs. Capture native 1920×1080·DPR1 new policy screens from fixed source, verify dimensions/links, and mark only tested scope complete.
- [ ] **Step 7:** Obtain whole-branch review, commit documentation/screens, push authorized work units and verify all GitHub CI jobs on the exact published head. Report role defaults, implemented button actions, actual versions and remaining limits.

## 자체 검토 결과

계약·기존 기본값·전체 액션·하드 제한·혼합 PUT·contextual tuples·의존 순환·정책 관리/복원·revision/이력·동시 철회·장애 거부·프런트 캐시/초안·CI/복원은 위 작업에 배정했다. 새 정책 helper·조회·컨트롤러는 실제 소비자가 있다. 커스텀 역할·프로젝트별 정책·이벤트 동기화·무관한 모듈은 미리 만들지 않는다. 이 파일은 실행 계획이며 SDK 설치·제품 코드 변경·검사 통과를 완료한 것으로 표시하지 않는다.
