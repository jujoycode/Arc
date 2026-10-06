#!/usr/bin/env bash
set -euo pipefail
umask 077
arc_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$arc_root"
arc_backup="${1:?Usage: backup.sh /path/to/new-backup.sql}"
[[ ! -e "$arc_backup" ]] || { echo 'Refusing to overwrite an existing backup.' >&2; exit 1; }
arc_env_file="${ARC_DEPLOY_ENV_FILE:-.env.deploy}"
arc_project="${ARC_COMPOSE_PROJECT:-arc}"
arc_temp="$(mktemp "${arc_backup}.XXXXXX")"
trap 'rm -f "$arc_temp"' EXIT
docker compose --env-file "$arc_env_file" -p "$arc_project" -f compose.deploy.yaml exec -T mysql sh -c \
  'MYSQL_PWD="$MYSQL_PASSWORD" exec mysqldump --single-transaction --no-tablespaces --set-gtid-purged=OFF -u "$MYSQL_USER" "$MYSQL_DATABASE"' > "$arc_temp"
[[ -s "$arc_temp" ]] || { echo 'The database backup is empty.' >&2; exit 1; }
mv "$arc_temp" "$arc_backup"
echo "Database backup saved: $arc_backup"
