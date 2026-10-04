# Arc 백엔드

Kotlin, Spring Boot, MySQL 8로 구성한 API 서버의 시작점이다. 현재 데이터베이스 스키마와 보안 기본값을 갖추었으며, 인증 API가 구현되기 전에는 건강 상태 확인을 제외한 모든 요청을 거부한다.

루트의 `compose.yaml`로 MySQL을 실행한 뒤 `DB_PASSWORD`를 로컬 `.env` 값과 맞춰 실행한다.

```bash
./gradlew bootRun
```

기본 DB 주소는 `jdbc:mysql://localhost:3307/arc`다. 필요하면 `DB_URL`, `DB_USERNAME`, `DB_PASSWORD` 환경 변수로 변경한다. `GET /actuator/health`로 서버 상태를 확인한다.

스키마는 `src/main/resources/db/migration`의 Flyway 마이그레이션으로 관리한다. JPA가 스키마를 자동 수정하지 않으며 시작 시 마이그레이션과 스키마 검증을 수행한다.
