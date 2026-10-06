# Docker Compose 설치·운영

> 자체 서버에서 웹·API·MySQL을 실행한다. 운영 도메인과 SMTP 계정은 설치 환경에서 설정한다.

## 첫 설치 재현

호스트에는 Docker Engine과 Compose v2, Git만 필요하다. Java 21·Node 24·pnpm은 이미지 빌드 단계에서 설치된다. 서버 자원은 두 코어·메모리 4GB 이상을 시작 기준으로 권장하며 실제 팀 규모에 맞춰 조정한다.

```bash
cp deploy.env.example .env.deploy
chmod 600 .env.deploy
# DB_PASSWORD와 MYSQL_ROOT_PASSWORD를 서로 다른 긴 비밀번호로 변경한다.
docker compose --env-file .env.deploy -f compose.deploy.yaml --profile local-mail up -d --build --wait
```

- 웹 앱: http://localhost:8085 — 가입·이메일 확인·워크스페이스 생성부터 시작한다.
- 리허설 메일함: http://localhost:8026 — 외부로 메일을 보내지 않는 Mailpit 프로필이다.
- 웹 상태: http://localhost:8085/healthz
- MySQL과 API는 호스트 포트를 열지 않으며 웹 프록시가 `/api/`를 API에 전달한다. 직접 URL로 접속한 React 경로도 동작한다.

`compose.yaml`은 기존 개발 DB·메일용, `compose.deploy.yaml`은 앱을 포함한 설치용이다. 서로 다른 프로젝트 이름을 사용하면 볼륨도 분리된다. 별도 설치 검증은 `-p arc-deploy-check`와 다른 웹·메일 포트를 사용한다.

## 운영 도메인·메일

`.env.deploy`의 `ARC_PUBLIC_URL`을 실제 HTTPS 주소로 설정한다. 이 주소로 확인·초대 메일의 링크를 만든다. 호스트에 설치한 Caddy 등 TLS 프록시에서 `127.0.0.1:8085`로 전달한다. Caddy 예:

```caddyfile
arc.example.com {
    reverse_proxy 127.0.0.1:8085
}
```

운영 SMTP의 `SMTP_HOST`, `SMTP_PORT`, `SMTP_USERNAME`, `SMTP_PASSWORD`, `ARC_MAIL_FROM`을 설정한다. 일반적인 587 포트 제출은 `SMTP_AUTH=true`, `SMTP_STARTTLS=true`를 사용한다. 제공자의 인증·TLS 정책에 맞춰 설정하고 실제 수신 주소에서 확인 메일과 초대 메일을 확인한다. 운영에서는 `--profile local-mail`을 생략한다. 도메인 인증, 발송 한도와 SMTP 자격 증명은 제공자에서 관리한다.

## 이미지와 업데이트

웹은 고정 pnpm 잠금 파일로 빌드한 번들을 비관리자 nginx로 제공하고, API는 Gradle wrapper로 만든 JAR를 비관리자 Java 21 JRE에서 실행한다. Flyway가 API 시작 시 마이그레이션한다. DB 상태를 확인한 후 API, API 상태를 확인한 후 웹이 시작된다. 이미지 빌드는 `bootJar`와 프런트 경계·TypeScript 검사를 수행한다. 전체 테스트는 [CI](CI.md)에서 수행한다.

릴리스마다 `.env.deploy`의 `ARC_IMAGE_TAG`를 Git 커밋 등 고유 값으로 정하고, 통과한 커밋을 체크아웃해 같은 `up -d --build --wait` 명령을 실행한다. 이전 이미지 태그를 보존하면 `--no-build`로 해당 이미지를 재사용할 수 있다. 마이그레이션 이후 이전 API로 돌아갈 수 있는지는 변경한 스키마에 따라 판단한다.

```bash
docker compose --env-file .env.deploy -f compose.deploy.yaml ps
docker compose --env-file .env.deploy -f compose.deploy.yaml logs --tail 100 backend web
```

## DB 백업·복원

MySQL 데이터는 명명된 볼륨에 남는다. `down`은 컨테이너를 종료하고, `down -v`는 데이터를 삭제하므로 일반 종료에 사용하지 않는다. 백업 파일에는 사용자와 이슈 데이터가 포함된다.

```bash
mkdir -p backups
chmod 700 backups
bash scripts/deploy/backup.sh backups/arc-backup.sql
```

백업 스크립트는 일관된 트랜잭션 덤프를 만들고 새 파일만 생성한다. 다른 Compose 프로젝트나 env 파일을 사용하면 `ARC_COMPOSE_PROJECT`, `ARC_DEPLOY_ENV_FILE`을 지정한다. 파일을 서버 밖에 복사해 보관하고 주기적으로 별도 DB에서 복원한다.

복원은 **대상 DB의 테이블과 데이터를 백업 내용으로 대체**한다. 대상과 파일을 확인하고 API·웹을 중지한 뒤 실행한다.

```bash
docker compose --env-file .env.deploy -f compose.deploy.yaml stop web backend
docker compose --env-file .env.deploy -f compose.deploy.yaml exec -T mysql sh -c \
  'MYSQL_PWD="$MYSQL_PASSWORD" exec mysql -u "$MYSQL_USER" "$MYSQL_DATABASE"' < backups/arc-backup.sql
docker compose --env-file .env.deploy -f compose.deploy.yaml up -d --wait
```

## 프록시가 필요한 빌드

일반 서버에서는 추가 설정이 필요 없다. 이 세션처럼 HTTPS 검사 프록시를 사용하는 빌드 환경은 BuildKit의 `proxy_ca`·`proxy_bundle` 선택적 secret을 전달한다. 인증서를 최종 이미지에 복사하거나 TLS 검증을 끄지 않는다.

```bash
docker build --secret id=proxy_ca,src="$CODEX_PROXY_CERT" \
  --secret id=proxy_bundle,src=/etc/ssl/certs/ca-certificates.crt \
  -f backend/Dockerfile -t arc-backend:local .
docker build --secret id=proxy_ca,src="$CODEX_PROXY_CERT" \
  -f frontend/Dockerfile -t arc-web:local .
```

설치할 서버·도메인·실제 SMTP 자격 증명이 아직 제공되지 않았으므로, 여기서 확인하는 것은 로컬의 새 Compose 설치와 Mailpit 수신이다. 외부 서버 공개와 운영 메일 발송은 해당 환경에서 마지막으로 확인한다.
