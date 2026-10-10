# arcat 기능과 권한 안내

[제품 소개](README.md) · [화면별 설명](README.md#전체-화면-안내) · [상세 기능 명세](../FUNCTIONAL_SPEC.md)

현재 구현된 기능을 제품 선택과 첫 사용 관점에서 정리했습니다. 화면 사진은 실제 앱의 한 시점이며, 사진 아래의 설명에는 같은 화면에서 수행할 수 있는 조작도 포함됩니다.

## 전체 기능 지도

| 영역 | 기능과 동작 | 확인할 사진 |
| --- | --- | --- |
| 이메일 인증 | 이름·이메일·12자 이상 비밀번호로 가입, 확인 링크, 검증 후 로그인·로그아웃 | [가입](01-team-and-access.md#register) · [확인](01-team-and-access.md#email-verification) · [로그인](01-team-and-access.md#login) |
| 첫 사용 안내 | 집배원 고양이와 제품 소개, 첫 워크스페이스 준비, 확인·초대 결과를 텍스트로 함께 안내 | [로그인](01-team-and-access.md#login) · [첫 팀 공간](01-team-and-access.md#workspace-onboarding) |
| 팀 합류 | 이메일로 MEMBER·ADMIN 초대, 해당 이메일 계정으로 수락, 초대 취소·만료 | [초대 수락](01-team-and-access.md#team-invitation) · [팀 관리](05-settings-and-integrations.md#team-settings) |
| 워크스페이스·탐색 | 팀 공간 생성·선택, 프로젝트 카드, 프로젝트 간 전환, 계정·로그아웃 | [팀 공간](01-team-and-access.md#workspaces) |
| 프로젝트 | 이름·키·설명·상위 프로젝트, 보관·복원, 첫 티켓 이후 키 변경 제한 | [프로젝트 생성](01-team-and-access.md#project-creation) · [설정](05-settings-and-integrations.md#project-settings) · [보관](05-settings-and-integrations.md#archived-project) |
| 프로젝트 관리자 | OWNER·ADMIN이 기본 관리자, 프로젝트별 추가 관리자 지정·해제, 팀 탈퇴 시 지정 해제 | [관리자 명단](05-settings-and-integrations.md#project-settings) |
| 공통 티켓 | Epic·Story·Task·Bug·하위 작업, 제목·설명·상태·우선순위·담당자·날짜·완료율·포인트·부모·버전, 관리자 삭제 | [생성](03-tickets-and-views.md#ticket-create) · [상세](03-tickets-and-views.md#ticket-detail) · [계획 편집](03-tickets-and-views.md#ticket-plan-edit) |
| 표준 필드 설정 | 워크스페이스별 표시 이름·입력 안내·표시 여부·필수 여부·그룹 내 순서, 제목·유형·상태·완료율 유지 | [표준 필드](05-settings-and-integrations.md#ticket-fields-standard) |
| 커스텀 필드 | 텍스트·숫자·날짜·단일 선택, 활성 최대 30개, 입력 구성 미리보기, 타입 고정·비활성화 시 기존 값 보존 | [설정·미리보기](05-settings-and-integrations.md#ticket-fields-custom) · [입력](03-tickets-and-views.md#ticket-custom-form) · [저장 값](03-tickets-and-views.md#ticket-custom-detail) |
| 폼 검증 | 입력 그룹·필수/선택·안내 통일, Valibot 검증·필드 오류·오류 요약·입력 보존, 숫자 0과 빈 값 구분 | [검증과 입력 보존](03-tickets-and-views.md#ticket-validation) · [실행 폼](03-tickets-and-views.md#ticket-execution) |
| 담당 업무 실행 | 담당자와 관리자만 상태·완료율 수정, 개발자 전용 폼, 재배정 후 권한 재확인 | [담당자 수정](03-tickets-and-views.md#ticket-execution) |
| 동시 편집 | 먼저 저장된 수정과 충돌하면 안내하고 입력 보존, 새 데이터 확인 후 재시도 | [편집 충돌](03-tickets-and-views.md#ticket-edit-conflict) |
| 댓글·기록 | 모든 팀원 댓글 작성, 작성자 수정·삭제, 관리자 삭제, 변경자·종류·시각 기록 | [댓글 편집](03-tickets-and-views.md#ticket-comment-edit) · [변경 기록](03-tickets-and-views.md#ticket-history) |
| 선행·차단 | 같은 프로젝트 티켓 연결·해제, 순환 관계 검증, 연결 티켓 상세 이동, 간트 관계선 | [관계](03-tickets-and-views.md#ticket-relations) · [간트](02-planning-and-schedule.md#gantt) |
| 검색·필터 | 키·제목 검색, 상태·유형·담당자·우선순위·버전·스프린트 조건, 필터 초기화·개별 해제, 보기 이동 중 유지 | [티켓 테이블](03-tickets-and-views.md#ticket-table) · [타임라인 필터](02-planning-and-schedule.md#timeline-epic) |
| 테이블 | 서버 정렬·페이지, 필수 키·제목 열, 선택 열·기본값 복원, 상세 이동 | [테이블](03-tickets-and-views.md#ticket-table) · [표시 열](03-tickets-and-views.md#ticket-table-columns) |
| WBS 계획 | 티켓 계층·WBS 코드·중첩 접기, 관리자 하위 생성·계획 편집, 팀 말단 완료·포인트·미추정 요약 | [관리자 WBS](02-planning-and-schedule.md#wbs-manager) · [하위 생성](02-planning-and-schedule.md#wbs-child-ticket) |
| 개발자 WBS | 전체 팀·내 업무 전환, 내 상태별 티켓 수, 필터 후 부모 맥락 보존, 팀 합계 유지 | [개발자 WBS](02-planning-and-schedule.md#wbs-developer) |
| 간트 | 하위 프로젝트·버전·티켓 계층, 일정·집계 완료율·오늘·주말·관계선, 시작 월·기간·확대·월 이동 | [간트](02-planning-and-schedule.md#gantt) |
| 간트 계층·상세 | 부모 기준 모든 자손 접기, 하위 접힘 상태 보존, 다른 가지 독립 조작, 전체 접기·펼치기, 선택 항목·연결 티켓 이동 | [중첩 접기](02-planning-and-schedule.md#gantt-collapse) · [선택 상세](02-planning-and-schedule.md#gantt-item-detail) |
| 간트 개인 보기·출력 | 표시 옵션·필터·기간 저장·불러오기·삭제, 현재 보이는 계층·기간·열의 PNG/PDF 출력 | [개인 보기와 출력](02-planning-and-schedule.md#gantt-personal-view) |
| 타임라인 | 월·3개월, Epic/버전 그룹, 하위 집계·버전 일정 상속, 날짜 한쪽 표식, 기간 경계 표시, 상세 이동 | [Epic별](02-planning-and-schedule.md#timeline-epic) · [버전별](02-planning-and-schedule.md#timeline-version) |
| 계획 누락 확인 | 미계획·기간 밖 업무 별도 목록, 상속 일정의 시작/완료 역전 시 안내 | [미계획 업무](02-planning-and-schedule.md#timeline-unscheduled) |
| 칸반 | 할 일·진행 중·검토·완료, 카드 드래그·상태 메뉴, 담당자/관리자 권한, 변경 실패 시 복원 | [칸반](03-tickets-and-views.md#kanban) |
| 백로그 | 미편성 업무 순서 변경, 100개 단위 조회, 계획 스프린트 편성·백로그 복귀, 관리 권한 | [백로그](04-sprints.md#backlog) |
| 스프린트 | 이름·목표·기간 계획, 시작, 프로젝트당 진행 스프린트 하나, 상태별 보드·완료 수·포인트 | [계획](04-sprints.md#sprint-plan) · [진행](04-sprints.md#sprint-active) |
| 스프린트 종료 | 미완료 업무를 백로그/계획 스프린트로 이동, 종료 당시 티켓 상태·포인트 보존, 과거 결과 조회 | [종료·이월](04-sprints.md#sprint-close) · [종료 결과](04-sprints.md#sprint-history) |
| 릴리스 버전 | 버전 이름·시작일·완료일, 티켓 연결, 간트·타임라인 일정 상속과 목표 날짜 | [버전 관리](05-settings-and-integrations.md#version-settings) |
| 팀 역할·수명 | MEMBER·ADMIN 변경, 멤버 제거, 소유권 이전, 소유자의 이름 확인 후 워크스페이스 삭제 | [팀 역할](05-settings-and-integrations.md#team-settings) · [삭제](05-settings-and-integrations.md#workspace-lifecycle) |
| 저장소 연결 | GitHub·GitLab 저장소 권한 확인·연결·재확인·해제, 접근 토큰 암호화, 웹훅 검증키 | [저장소 연동](05-settings-and-integrations.md#repository-integrations) |
| 웹훅 처리 | 제공자 서명·토큰 검증, 전달 ID 중복 제거, 처리 큐·시도 횟수·실패 재시도 | [전달 기록](05-settings-and-integrations.md#webhook-deliveries) |
| 개발 활동 | 티켓 키로 커밋·PR·MR 연결, 열림/닫힘/병합 상태·원본 링크, 해제 후 기존 기록 보존 | [티켓 개발 활동](05-settings-and-integrations.md#development-activity) |
| 빈 상태·보관 | 업무 없음 안내, 0건 집계, 보관 중 조회·필터·접기는 제공하고 변경은 제한 | [빈 프로젝트](05-settings-and-integrations.md#empty-project) · [보관 프로젝트](05-settings-and-integrations.md#archived-project) |

## 역할과 권한

| 작업 | 워크스페이스 소유자·관리자 | 프로젝트별 추가 관리자 | 개발자·일반 팀원 |
| --- | --- | --- | --- |
| 프로젝트 업무·일정·팀 진척 조회 | 가능 | 가능 | 가능 |
| 티켓 생성·삭제, 범위·부모·배정·일정·포인트·관계·커스텀 값 관리 | 가능 | 지정 프로젝트만 | 불가 |
| 워크스페이스 티켓 필드 조회 | 가능 | 가능 | 가능 |
| 표준 필드 설정·커스텀 필드 정의 관리 | 가능 | 불가 | 불가 |
| 버전·백로그 순서·스프린트 편성·시작·종료 | 가능 | 지정 프로젝트만 | 불가 |
| 티켓 상태·완료율 변경 | 가능 | 지정 프로젝트만 | 본인 담당 티켓만 |
| 댓글 작성 | 가능 | 가능 | 가능 |
| 댓글 수정 | 본인 댓글만 | 본인 댓글만 | 본인 댓글만 |
| 댓글 삭제 | 관리 범위 전체 | 지정 프로젝트 전체 | 본인 댓글만 |
| 프로젝트 정보·보관, 추가 관리자 지정 | 가능 | 불가 | 불가 |
| 팀 초대·역할·멤버 관리, 저장소 자격 증명 | 가능 | 불가 | 불가 |
| 소유권 이전·워크스페이스 삭제 | 소유자만 | 불가 | 불가 |

추가 관리자는 워크스페이스 역할을 바꾸지 않습니다. 다른 프로젝트와 하위 프로젝트에는 권한이 자동 전파되지 않습니다. 보관 프로젝트의 변경 제한은 관리자에게도 적용됩니다. 화면에서 버튼을 숨기거나 제한하는 동작과 서버 권한 검사가 함께 적용됩니다.

새 필수 필드는 생성·계획 편집에서 입력합니다. 기존 티켓에 값이 없어도 담당자의 상태·완료율 수정과 팀원의 댓글은 계속 사용할 수 있습니다. 숨기거나 비활성화한 필드의 기존 값은 보존합니다.

## 선택하기 전에 확인할 범위

| 주제 | 현재 제공 | 후속 범위·조건 |
| --- | --- | --- |
| 마일스톤 | 버전 일정·목표 날짜 표시 | 독립 마일스톤의 선행 조건·달성·증빙은 [기획 완료, 구현 대기](../MILESTONE_PLAN.md). 현재 설정의 ‘버전 / 마일스톤’은 버전 기능입니다. |
| 일정 편집 | 티켓 상세의 시작일·완료일 변경 | 간트·타임라인 막대 드래그 재일정 없음 |
| WBS | 티켓 계층·코드, 말단 완료 비율·포인트 | 직접 재정렬·독립 산출물 노드·시간/원가·기준선은 후속 범위. WBS 코드는 구조 변경 시 바뀌며 영구 참조에는 티켓 키를 사용합니다. |
| 진척 지표 | WBS: 말단의 DONE 수/전체 말단 수. 간트: 하위 항목 완료율 집계 | 전체가 완료된 상태의 비율과 입력 완료율 집계는 서로 다른 지표입니다. |
| 설정 유지 | 필터·테이블 열은 같은 프로젝트 내 보기 이동 중 유지, 간트 개인 보기는 사용자별 서버 저장 | 필터·테이블의 새로고침 복원·서버 저장 다중 보기와 WBS 접힘 복원은 후속 범위 |
| 티켓 필드 | 워크스페이스 공통 표준 설정과 텍스트·숫자·날짜·단일 선택 필드, 계획 폼·상세에 적용 | 프로젝트별 재정의·다중 선택·계산·첨부·커스텀 필드 테이블 열/필터는 후속 범위. 저장한 필드 타입은 변경하지 않으며 삭제 대신 비활성화합니다. |
| 티켓·인증 | 고정 유형·기본 상태, 이메일·비밀번호 로그인 | 사용자 정의 워크플로·SSO·첨부 파일 기능은 현재 미제공 |
| 코드 연동 | GitHub·GitLab 커밋·PR·MR 표시, 웹훅 처리·재시도 | 화면 자료는 로컬 제공자 모형입니다. 실계정·공개 HTTPS 웹훅은 [설치 환경에서 설정](../INTEGRATIONS.md). 코드 이벤트가 티켓 상태를 자동 변경하지 않습니다. |
| 설치 | [Docker Compose 앱·DB·메일 구성](../DEPLOYMENT.md) | 운영 도메인·HTTPS·SMTP·백업은 설치 서버에서 준비 |
| 화면 접근성·데이터 규모 | 반응형·키보드·자동 접근성 검사와 실제 데이터 점검 | [자동 검사 범위](../DESIGN_VERIFICATION.md)·[성능 측정과 제한](../PERFORMANCE.md)을 확인하세요. |

구현 근거와 남은 작업은 [STATUS](../STATUS.md)와 [TODO](../TODO.md)에 기록합니다.
