# 마일스톤 조사: Redmine·Jira·GitLab·GitHub

> 조사일: 2026-10-07 (Asia/Seoul) · arcat 기준 커밋: `75d9d4d` · 공식 문서에서 확인한 동작과 Arc에 대한 제안을 구분한다.

## 비교 결과

| 도구 | 목표를 관리하는 단위 | 이슈와의 관계 | 일정과 상태를 읽는 방법 | Arc에 참고할 점 |
| --- | --- | --- | --- | --- |
| Redmine | 프로젝트의 Version / Target version | 목표 버전에 이슈를 배정 | 로드맵에 목표 날짜·연결 이슈·진척을 표시; open / locked / closed로 배정 정책 제어 | 버전별 범위와 진척 조회, 완료와 신규 배정 제한의 구분 |
| Jira Cloud 소프트웨어 프로젝트 | Version / Release, 이슈의 Fix versions | 배포할 작업을 버전으로 묶음 | 릴리스 날짜와 상태, 릴리스 화면의 작업·개발 정보; 타임라인 상단의 릴리스 표식 | 배포 범위와 예정 날짜를 함께 관리하고 상세에서 위험 확인 |
| GitLab | 프로젝트·그룹 Milestone | 관련 작업·MR을 목표로 묶음; 작업 하나에 마일스톤 하나 | 선택적 시작·기한, 완료 작업 비율, 관련 릴리스·MR | 업무 목표와 개발 증빙을 연결하되 작업 상태와 목표 종료를 구분 |
| GitHub | 저장소 Milestone | 관련 이슈·PR을 묶음 | 기한·완료율·열린/닫힌 항목; Projects 로드맵의 마일스톤 날짜 표식 | 작은 목표 상세 화면과 날짜 강조, 열린 작업을 바로 조회 |

위 표의 각 도구 동작은 아래 공식 자료에서 확인했다. arcat 열은 조사 결과에 대한 제품 설계 판단이다. Redmine 플러그인, Jira Marketplace 앱, Jira Data Center는 이번 비교 범위에 포함하지 않았다.

## Redmine에서 확인한 동작

- Version에 이름·설명·선택적 완료 기한을 두고 이슈의 목표 버전으로 배정한다. 버전은 프로젝트에 속하며 하위 프로젝트·프로젝트 계층 등으로 공유할 수도 있다.
- open은 배정 가능, locked는 새 배정 제한, closed는 새 배정과 연결 이슈의 재개방 제한이다. 날짜가 지났다는 이유만으로 작업이 끝났다고 판단하는 단순 상태와 다르다.
- 로드맵은 버전별 연결 이슈와 진척을 제공하고, 열린/닫힌 이슈로 바로 이동할 수 있다. 완료율에는 예상 시간 가중치가 사용된다. Arc의 단순 평균 완료율과 같은 공식이 아니다.

근거: [Project Settings — Versions](https://www.redmine.org/projects/redmine/wiki/RedmineProjectSettings#Versions), [Roadmap](https://www.redmine.org/projects/redmine/wiki/RedmineRoadmap). 표준 문서에서는 버전이 목표 묶음 역할을 한다. 별도 마일스톤이나 승인 기능의 존재 여부를 모든 플러그인에 일반화하지 않는다.

## Jira에서 확인한 동작

- 소프트웨어 프로젝트의 Releases에서 Version을 만들고 시작일·계획 릴리스 날짜·설명·조정 담당자를 지정한다. 작업의 Fix versions로 연결한다. 공식 문서의 `space`는 여기서 프로젝트로 설명한다.
- 타임라인에는 릴리스 표식이 상단에 나오며 완료·지연·예정 상태를 구별하고 상세를 열 수 있다. 해당 문서는 기능이 순차 배포 중일 수 있다고 명시한다.
- 릴리스 상세는 작업 진행, 연결된 PR·커밋 등의 개발 정보와 경고를 보여 준다. 릴리스 실행 시 미해결 작업의 처리와 실제 릴리스 날짜를 확인한다. 작업 완료와 배포 완료는 같은 이벤트가 아니다.
- Premium / Enterprise의 Plans는 여러 프로젝트의 릴리스를 함께 정렬·추적할 수 있다. 이를 모든 Jira 요금제의 기본 기능으로 보지 않는다.

근거: [Enable releases and versions](https://support.atlassian.com/jira-software-cloud/docs/enable-releases-and-versions/), [Timeline releases](https://support.atlassian.com/jira-software-cloud/docs/how-can-i-plan-with-releases-on-my-project-roadmap/), [Release progress](https://support.atlassian.com/jira-software-cloud/docs/use-the-release-page-to-check-the-progress-of-a-version/), [Releases in Plans](https://support.atlassian.com/jira-software-cloud/docs/what-are-releases-in-advanced-roadmaps/).

## GitLab에서 확인한 동작

- Milestone은 관련 이슈·Epic·MR을 목표로 묶고 프로젝트 또는 그룹 범위를 갖는다. 시작일·기한은 선택 사항이며 릴리스 목표로도 쓸 수 있다.
- 하나의 작업에는 하나의 마일스톤을 배정한다. 완료 비율은 닫힌 작업 수 / 전체 작업 수이며 MR과 릴리스 정보도 확인할 수 있다.
- 마일스톤을 종료해도 연결된 열린 이슈는 열린 상태로 남는다. 목표 관리와 이슈 상태를 함께 강제 변경하는 모델이 아니다.

근거: [Milestones](https://docs.gitlab.com/user/project/milestones/). 일부 차트·로드맵은 제품 계층과 요금제 조건이 있으므로 첫 arcat 범위로 자동 포함하지 않는다.

## GitHub에서 확인한 동작

- Milestone은 저장소의 관련 이슈·PR을 묶으며 설명·기한·완료율·열린/닫힌 항목을 보여 준다.
- Projects 로드맵에서는 항목의 날짜·반복 주기와 마일스톤을 수직 표식으로 강조할 수 있다. 마일스톤 자체와 릴리스 태그를 같은 개체로 가정하지 않는다.

근거: [About milestones](https://docs.github.com/en/issues/using-labels-and-milestones-to-track-work/about-milestones), [Roadmap markers](https://docs.github.com/en/issues/planning-and-tracking-with-projects/customizing-views-in-your-project/customizing-the-roadmap-layout#setting-vertical-markers).

## arcat 현행 구현과 차이

| 확인 위치 | 현재 동작 | 기획에서 해결할 점 |
| --- | --- | --- |
| `project/internal/persistence/ProjectTables.kt`의 `Versions` | 버전의 이름·설명·선택적 시작일·필수 완료일·기본 OPEN 상태 저장 | 독립 체크포인트, 실제 달성일, 담당자·변경 이력이 없음 |
| `project/web/ProjectController.kt` | 버전 목록 조회·생성 | 버전 편집·릴리스 실행·배정 잠금 UI/API까지 구현된 상태는 아님 |
| `settings/internal/ui/SettingsScreen.tsx` | 설정의 ‘버전 / 마일스톤’에서 버전 생성 | 서로 다른 개념이 같은 입력으로 표현됨 |
| `ganttRows.ts` | 버전 행과 연결 이슈 계층, 버전 날짜의 이슈 상속, 완료율 집계 | 체크포인트가 이슈의 부모가 되거나 이슈를 중복 렌더링하지 않도록 해야 함 |
| `GanttChart.tsx`의 `barPosition` | 시작일이 없고 완료일이 있는 모든 행을 ◆로 렌더링 | 일반 이슈의 기한도 마일스톤처럼 보임. 시작일이 있는 버전에는 독립 목표 표식이 없음 |
| `GanttChart.tsx`의 간트 상태 | 프로젝트·버전·Epic·하위 이슈의 중첩 접기와 출력 | 새 마일스톤도 조상 접힘·표시 옵션·출력 규칙과 일치해야 함 |

현재 ◆는 날짜 표현이며, ‘승인 완료’나 ‘릴리스 달성’을 관리하는 독립 마일스톤 기능이 아니다. 버전과 이슈의 일정 상속 규칙은 유지하면서 명시적 마일스톤을 추가하는 것이 필요하다.

## 조사에서 도출한 arcat 원칙

1. **버전은 배포 범위, 마일스톤은 달성 시점으로 구분한다.** 같은 버전에 설계 승인·베타 검증·출시 등 여러 체크포인트를 연결할 수 있다.
2. **작업 진척과 목표 달성은 따로 기록한다.** 이슈가 모두 완료되어도 승인이 남을 수 있고, 마일스톤 달성이 작업 상태를 자동으로 바꾸면 안 된다.
3. **계획일과 실제 달성일을 보존한다.** 날짜 연기와 기한 초과, 늦은 달성을 구별한다.
4. **처음에는 프로젝트 범위로 제공한다.** 그룹 공유·여러 프로젝트 통합 목표는 별도 확장으로 둔다.
5. **표식만 추가하고 끝내지 않는다.** 담당자·선행 이슈·달성 판단·변경 이력·간트 탐색을 하나의 사용 흐름으로 제공한다.

이 원칙을 구체화한 추천안은 [arcat 마일스톤 기획](MILESTONE_PLAN.md)에 정리한다. 독립 체크포인트와 복수 선행 이슈 관계는 Arc의 제안이며 위 도구의 동일한 기본 동작이라는 뜻은 아니다.
