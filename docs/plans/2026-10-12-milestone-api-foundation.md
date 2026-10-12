# 마일스톤 첫 API 단계 실행 계획

> 작성일: 2026-10-12 · 상태: 구현 예정 · 근거: [마일스톤 기획](../MILESTONE_PLAN.md)

프로젝트 관리자는 별도 목표일과 달성 기준을 가진 마일스톤을 계획하고 팀원은 조회한다. 기존 버전·티켓 계층·일정은 유지한다. 이번 작업은 기획의 1단계로, 생성·조회·전체 편집·취소·재개와 변경 이력을 실제 API에서 제공한다. 선행 티켓·달성 판단·증빙 스냅샷·관리 UI·간트 표시는 후속 단계다.

## 결정한 계약

- 모든 현재 워크스페이스 멤버는 조회한다. 쓰기는 OWNER·ADMIN과 해당 프로젝트에 지정된 관리자에게 허용한다. 마일스톤 담당자 지정만으로 관리 권한을 부여하지 않는다. 하위 프로젝트에 관리 권한을 자동 상속하지 않는다.
- 보관 프로젝트는 읽기 전용이다. 워크스페이스 → 프로젝트 → 마일스톤 순서로 잠그고 권한·보관·revision을 재확인한다. 메타데이터·상태·revision·이력을 같은 Spring 트랜잭션에서 기록한다. 변경 트랜잭션은 READ_COMMITTED를 사용해 잠금 대기 중 커밋된 역할 제거·관리자 해제를 재확인할 때 이전 MySQL 스냅샷을 읽지 않는다.
- 생성은 PLANNED, 취소는 CANCELLED, 재개는 PLANNED다. 이번 API는 ACHIEVED를 만들지 않는다. 영구 삭제나 임의 상태 변경 API는 제공하지 않는다.
- 제목은 공백 제거 후 1~120자, 달성 기준은 공백 제거 후 1~10,000자다. 설명은 최대 10,000자, 사유는 최대 1,000자다. 목표일은 기존 `calendarDate`로 실제 YYYY-MM-DD·MySQL DATE 범위를 검사한다.
- 전체 편집은 PUT이다. 선택 필드의 null은 비움을 의미한다. 변경 revision은 필수·0 이상이며 nullable 전송 값에 명시적 필드 검증을 적용해 누락/null을 0으로 간주하지 않는다. 오래된 revision과 불가능한 상태 전환은 409로 거부하고 이력을 추가하지 않는다.
- 목표일 변경과 취소·재개에는 공백이 아닌 사유가 필요하다. PLANNED만 메타데이터 편집을 허용한다. 담당자와 버전의 신규/변경 연결을 검사한다. 팀을 떠난 담당자의 기존 ID는 이력처럼 유지하며 관련 없는 편집을 막지 않는다.
- 목록은 목표일·ID 오름차순, 이력은 ID 내림차순으로 페이지를 제공한다. `{items,total,page,size}`를 사용하며 size 최대 100이다. 다른 프로젝트의 마일스톤 ID는 해당 경로에서 404다.
- DATE는 날짜 문자열을 보존하고 기록 시각은 UTC다. 오늘·기한 초과·실제 달성일 계산과 `ARC_BUSINESS_TIME_ZONE`은 2단계에 추가한다.

## API

| 메서드·경로 | 동작 |
| --- | --- |
| GET `/api/projects/{projectId}/milestones` | 목록·페이지 |
| POST 같은 경로 | 생성·상세 반환 |
| GET `/api/projects/{projectId}/milestones/{id}` | 상세 |
| PUT 같은 상세 경로 | 전체 메타데이터·revision·선택적 사유로 편집 |
| POST 상세 경로의 `/cancel` | revision·사유로 취소 |
| POST 상세 경로의 `/reopen` | revision·사유로 재개 |
| GET 상세 경로의 `/activities` | 변경 전후·사유·행위자·시각 이력 |

성공 상태와 사용자 추출은 기존 API 관례를 따른다. 입력 오류는 `VALIDATION_FAILED`·`fieldErrors`, revision 충돌은 `MILESTONE_CHANGED`로 구분한다. 이력 payload는 schemaVersion 1의 검증된 메타데이터 전후 스냅샷이며 임의 요청 맵이나 연동 비밀값을 저장하지 않는다.

## 파일과 경계

- `backend/.../db/migration/V9__add_project_milestones.sql`: milestones·milestone_activities와 프로젝트/버전 FK·조회 인덱스. 기존 자료를 변환하거나 자동 마일스톤으로 등록하지 않는다.
- `backend/.../milestone/api/MilestoneContracts.kt`: 실제 HTTP에서 사용하는 타입·상태·응답 계약.
- `backend/.../milestone/internal/MilestoneCommands.kt`, `MilestoneService.kt`: 검증·권한·트랜잭션·조회와 변경. 단순 목록 때문에 별도 QueryService를 추가하지 않는다.
- `backend/.../milestone/internal/persistence/MilestoneTables.kt`, `MilestoneRepository.kt`: Exposed 읽기·행 잠금·revision 조건 변경·이력.
- `backend/.../milestone/web/MilestoneController.kt`: HTTP 경로와 사용자 추출.
- `backend/.../test/.../milestone/internal/*Test.kt`: 검증과 실제 트랜잭션·롤백 검사.
- `scripts/milestone-smoke.py`, `scripts/ci/acceptance.sh`: 실제 MySQL API 수용 검사와 기존 CI 편입.

의존 방향은 milestone → project.api/workspace.api/shared다. issue나 다른 기능의 internal을 가져오지 않는다. 아직 소비자가 없는 다중 프로젝트 조회 facade, repository 인터페이스·Gradle 모듈·CQRS 계층을 미리 추가하지 않는다.

## 작업 단위

1. **모델·서비스·HTTP.** V9와 타입·저장소·서비스·7개 API를 작성한다. 먼저 필수 revision·날짜·사유·상태·범위 실패 검사를 작성하고 실패를 확인한 뒤 구현한다. 트랜잭션 검사는 메타데이터와 이력의 부분 실패를 검증한다. 경계·Gradle check·bootJar가 통과하면 기능 단위 커밋한다.
2. **MySQL 수용·CI.** OWNER/ADMIN/프로젝트 관리자/멤버/외부인, 담당자 권한 없음, 다른 버전·담당자, null 비움, 담당자 탈퇴, 취소·재개, 보관·revision 동시 요청·페이지·프로젝트 경로 격리를 검사한다. 새 DB와 실제 자료가 있는 V8→V9 업그레이드의 기존 자료 보존·FK를 별도로 확인한다. 기존 acceptance에 편입하고 전체 회귀를 실행한다. 검사·연결을 별도 커밋한다.
3. **문서·최종 CI.** 기존 MIL-02의 관리자 문구를 현행 프로젝트 권한에 맞추고 1단계만 완료로 기록한다. STATUS·TODO·백엔드 구조와 해결한 경로를 갱신한다. 코드·자료의 정확한 SHA로 GitHub CI를 확인한다. UI 사진은 디자인 완료 소스를 기준으로 유지하며 API만 있는 기능을 제품 화면에 구현된 것처럼 설명하지 않는다.

## 완료 기준

필수 revision 누락·충돌과 권한/보관 위반은 상태나 이력을 바꾸지 않는다. 두 동시 편집 중 하나만 성공하며 같은 변경의 이력도 하나다. 실제 MySQL의 트랜잭션 격리 수준과 잠금 중 권한 해제 후 대기 중이던 변경이 거부되는지도 검사한다. 날짜·버전·티켓 자료는 기존대로 유지된다. 새 설치와 V8 자료 업그레이드, 기존 전체 수용과 새 마일스톤 API 수용, GitHub CI가 통과한다. 담당자 탈퇴·프로젝트 관리자 해제·다른 팀의 접근을 실제 저장소에서 확인한다.

후속 순서는 선행 티켓·달성 규칙 → 관리 UI → 간트 통합 → 마일스톤 제품 검증이다. 1단계 완료는 독립 마일스톤 전체 기능의 완료를 뜻하지 않는다.
