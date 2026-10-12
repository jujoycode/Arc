# 마일스톤 API 1단계

> 갱신일: 2026-10-13 KST · 상태: API 기반 구현 · [전체 기획](MILESTONE_PLAN.md) · [실행 계획](plans/2026-10-12-milestone-api-foundation.md)

프로젝트의 독립 목표를 생성·조회·편집하고 취소·재개와 변경 이력을 기록합니다. 관리 UI·선행 티켓·달성 판단·증빙 스냅샷·간트 표시는 후속 단계입니다. 이 API는 기존 버전·티켓 일정이나 계층을 변경하지 않습니다.

## 경로와 권한

모든 경로는 `/api/projects/{projectId}/milestones` 아래이며 인증을 요구합니다.

| 메서드·추가 경로 | 동작 | 권한 |
| --- | --- | --- |
| GET | 목표일·ID 순 목록 | 워크스페이스 멤버 |
| POST | 계획 생성·상세 반환 | OWNER·ADMIN·해당 프로젝트 관리자 |
| GET `/{id}` | 상세 | 워크스페이스 멤버 |
| PUT `/{id}` | 전체 메타데이터 편집 | 같은 관리 권한, PLANNED만 |
| POST `/{id}/cancel` | 사유를 남기고 취소 | 같은 관리 권한, PLANNED만 |
| POST `/{id}/reopen` | 사유를 남기고 재개 | 같은 관리 권한, CANCELLED만 |
| GET `/{id}/activities` | ID 역순 이력 | 워크스페이스 멤버 |

담당자 지정은 관리 권한을 부여하지 않습니다. 프로젝트 관리자 권한은 자식 프로젝트에 자동 상속하지 않습니다. 보관 프로젝트는 조회만 가능하며, 다른 프로젝트의 마일스톤 ID를 요청한 경로에서는 404입니다. 영구 삭제·임의 상태 변경·달성 API는 이번 단계에 없습니다.

## 입력과 응답

생성 예시:

```json
{
  "title": "베타 검증",
  "targetDate": "2026-10-23",
  "criteria": "주요 시나리오 검증 결과 확인",
  "description": null,
  "ownerId": null,
  "versionId": null
}
```

`criteria`가 달성 기준의 실제 JSON·DB 필드명입니다. 제목은 공백 제거 후 1~120자, 기준은 공백 제거 후 1~10,000자, 설명은 최대 10,000자입니다. 목표일은 실제 YYYY-MM-DD이고 MySQL DATE 범위 1000~9999년을 사용합니다. 담당자는 현재 워크스페이스 멤버, 버전은 같은 프로젝트여야 합니다. 여러 목표가 같은 버전을 참조할 수 있습니다.

생성 응답은 상세이며 `status=PLANNED`, `revision=0`으로 시작합니다. 생성 시 클라이언트가 보낸 상태·projectId·actorId·revision으로 서버 값을 바꾸지 않습니다. 상세에는 메타데이터, ID·projectId·status·revision·createdAt·updatedAt가 있습니다. 날짜는 달력 문자열, 기록 시각은 UTC 문자열입니다. 기한 초과·준비율·달성 필드는 이번 응답에 없습니다.

PUT은 제목·목표일·기준을 포함한 **전체 교체**입니다. 선택 필드의 누락/null은 비움을 의미합니다. 필수 `revision`과 날짜 변경 시 `reason`을 함께 보냅니다. 현재 담당자가 탈퇴했어도 같은 ID를 유지한 관련 없는 편집은 가능하며, 새로 지정하거나 변경할 때 소속을 검사합니다.

취소·재개 예시:

```json
{"revision": 1, "reason": "검증 범위 조정"}
```

사유는 입력 길이 최대 1,000자이며 공백 제거 후 비어 있지 않아야 합니다. revision 누락/null/음수와 필드 오류는 400 `VALIDATION_FAILED`·`fieldErrors`, 오래된 revision은 409 `MILESTONE_CHANGED`입니다. 보관·불가능한 상태 전환은 409입니다. 거부한 변경은 메타데이터와 이력을 바꾸지 않습니다. 유효한 동일값 PUT도 한 번의 revision 증가와 UPDATED 이력을 기록합니다.

목록과 이력은 `page=0`, `size=50` 기본값이며 `{items,total,page,size}`로 반환합니다. 음수 page는 0, size는 1~100으로 제한합니다. 목록에는 취소 항목도 포함합니다.

## 이력과 일관성

CREATED·UPDATED·CANCELLED·REOPENED 이력의 `payload`는 JSON 객체입니다. schemaVersion 1, previousRevision·revision·reason과 검증된 메타데이터 `before`/`after`를 저장합니다. 생성에는 before가 없고 이후 값만 남습니다. 행위자 ID는 보존되며 표시 이름은 조회 시 현재 이름입니다. 이력 변경/삭제 API는 없습니다.

쓰기는 READ_COMMITTED에서 워크스페이스 → 프로젝트 → 마일스톤 순서로 잠급니다. 잠금 대기 중 커밋된 팀 탈퇴·관리자 해제를 다시 확인하고, 상태·메타데이터·revision·이력을 같은 Spring/Exposed 트랜잭션에 기록합니다. V9는 두 테이블만 추가하고 기존 자료를 자동 마일스톤으로 변환하지 않습니다.

## 확인한 범위

Gradle check/bootJar의 18개 검사 중 새 마일스톤 검사는 6개입니다. 실제 MySQL의 새 V1~V9 설치와 자료가 있는 V8→V9 업그레이드에서 날짜·키·버전·배정·JSON·revision과 기존 Flyway 체크섬 보존을 확인했습니다. FK·JSON·상태·revision 제약과 이력 보존도 검사했습니다.

새 설치/업그레이드의 HTTP 검사는 역할·격리·날짜·필드 오류·null 비움·탈퇴 담당자·취소/재개·보관·페이지와 두 동시 변경 경합을 확인했습니다. 같은 revision의 편집/편집·편집/취소 중 하나만 성공하고 이력도 하나만 남습니다. MySQL에서 실제 READ COMMITTED·잠금 대기를 관찰한 관리자 해제/팀 탈퇴 경합은 대기 중 요청이 403으로 거부되고 자료·이력이 유지됐습니다.

재현 가능한 [API 수용 스크립트](../scripts/milestone-smoke.py)는 [CI 수용 진입점](../scripts/ci/acceptance.sh)에 포함됩니다. 실행 환경과 전체 검사는 [개발 안내](DEVELOPMENT.md)·[CI 안내](CI.md)를 따릅니다. 관리 화면이나 간트가 구현된 것처럼 API 검사를 해석하지 않습니다.
