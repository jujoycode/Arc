# Arc 백엔드

Kotlin, Spring Boot 4, Exposed DSL, MySQL 8, Flyway로 구성한 API입니다. [루트 README](../README.md)의 MySQL·Mailpit 실행 단계 다음에 시작하세요.

```bash
DB_PASSWORD=choose-a-local-password ./gradlew bootRun
```

기본 DB 주소는 `jdbc:mysql://localhost:3307/arc`입니다. `DB_URL`, `DB_USERNAME`, `DB_PASSWORD`, `SMTP_HOST`, `SMTP_PORT`, `ARC_PUBLIC_URL`, `ARC_MAIL_FROM`으로 환경을 변경할 수 있습니다. `GET /actuator/health`로 서버 상태를 확인합니다.

운영 메일은 `SMTP_USERNAME`, `SMTP_PASSWORD`, `SMTP_AUTH`, `SMTP_STARTTLS`로 인증과 TLS를 설정합니다. 앱·DB를 함께 설치하는 방식은 [Docker Compose 운영 문서](../docs/DEPLOYMENT.md)를 참고하세요.

스키마는 `src/main/resources/db/migration`의 Flyway 마이그레이션으로 관리합니다.
