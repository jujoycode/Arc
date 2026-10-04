# Arc
소규모 집단에 어울리는 웹 기반 프로젝트 관리용 협업 도구

## 문서

- [팀용 MVP 계획](docs/PLAN.md)
- [디자인 가이드](docs/DESIGN_GUIDE.md)
- [기능 명세](docs/FUNCTIONAL_SPEC.md)
- [Redmine 간트 기능 기준](docs/GANTT_REFERENCE.md)
- [GitHub·GitLab 연동 설계 기준](docs/INTEGRATIONS.md)

## 개발 시작점

- `frontend/`: React 19 + TypeScript 웹 앱
- `backend/`: Kotlin + Spring Boot API와 Flyway 마이그레이션
- `compose.yaml`: 로컬 MySQL 8

현재는 실행 기반과 초기 화면·데이터 모델을 구축한 단계다. 로그인, 프로젝트, 이슈, 간트, 보드와 스프린트 동작은 기능 명세에 따라 순서대로 구현한다.

로컬 실행 시 `.env.example`을 `.env`로 복사하고 개발용 비밀번호를 설정한 뒤 MySQL을 시작한다. 자세한 명령은 각 디렉터리의 README에 적었다.
