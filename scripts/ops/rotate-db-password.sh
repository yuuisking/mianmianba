#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck disable=SC1091
. "${SCRIPT_DIR}/lib.sh"

APP_DIR="${APP_DIR:-/srv/resumer}"
ENV_FILE="${ENV_FILE:-${APP_DIR}/.env}"
ENV_LOCAL_FILE="${ENV_LOCAL_FILE:-${APP_DIR}/.env.local}"
SERVICE_NAME="${SERVICE_NAME:-resumer}"
DRY_RUN=0
NEW_PASSWORD=""
RESTART_SERVICE=1

# usage prints the supported command-line flags for database password rotation.
# Arguments:
#   None.
# Returns:
#   0 after printing help text.
usage() {
  cat <<EOF
Usage: $(basename "$0") [--password VALUE] [--app-dir PATH] [--service NAME] [--dry-run] [--no-restart]

Rotates the PostgreSQL application user password, updates DATABASE_URL in:
  1. ${ENV_FILE}
  2. ${ENV_LOCAL_FILE}
Then optionally restarts the application service and verifies connectivity.
EOF
}

# parse_args reads supported flags and updates script configuration variables.
# Arguments:
#   $@ - Raw CLI arguments.
# Returns:
#   0 when arguments are valid, otherwise exits non-zero.
parse_args() {
  while [ "$#" -gt 0 ]; do
    case "$1" in
      --password)
        NEW_PASSWORD="$2"
        shift 2
        ;;
      --app-dir)
        APP_DIR="$2"
        ENV_FILE="${APP_DIR}/.env"
        ENV_LOCAL_FILE="${APP_DIR}/.env.local"
        shift 2
        ;;
      --service)
        SERVICE_NAME="$2"
        shift 2
        ;;
      --dry-run)
        DRY_RUN=1
        shift
        ;;
      --no-restart)
        RESTART_SERVICE=0
        shift
        ;;
      -h|--help)
        usage
        exit 0
        ;;
      *)
        fail "Unknown argument: $1"
        ;;
    esac
  done
}

# alter_role_password applies the new password to the application database role.
# Arguments:
#   $1 - Database role name.
#   $2 - New password for the role.
# Returns:
#   0 when the role password is updated successfully.
alter_role_password() {
  local db_user
  local new_password

  db_user="$1"
  new_password="$2"

  run_postgres_admin psql postgres \
    -v app_user="$db_user" \
    -v app_password="$new_password" \
    -c "SELECT format('ALTER ROLE %I WITH PASSWORD %L', :'app_user', :'app_password') \gexec"
}

# restart_service reloads the application process if systemd is available.
# Arguments:
#   None.
# Returns:
#   0 when the service restart succeeds or is skipped.
restart_service() {
  if [ "$RESTART_SERVICE" -eq 0 ]; then
    log "Skipping service restart because --no-restart was provided"
    return
  fi

  if command -v systemctl >/dev/null 2>&1 && systemctl list-unit-files "${SERVICE_NAME}.service" >/dev/null 2>&1; then
    systemctl restart "$SERVICE_NAME"
    systemctl is-active --quiet "$SERVICE_NAME"
    log "Service ${SERVICE_NAME} restarted successfully"
  else
    log "systemd service ${SERVICE_NAME} not found; skipping restart"
  fi
}

# verify_new_database_url performs a simple connectivity check with the rotated URL.
# Arguments:
#   $1 - Updated database URL.
# Returns:
#   0 when the application user can still connect to PostgreSQL.
verify_new_database_url() {
  local database_url

  database_url="$1"
  psql "$(sanitize_database_url "$database_url")" -tAc "SELECT current_user;" >/dev/null
}

# main rotates the application database password or prints a dry-run plan.
# Arguments:
#   None.
# Returns:
#   0 on success, non-zero on rotation failure.
main() {
  local database_url
  local db_user
  local db_name
  local updated_database_url
  local masked_password

  parse_args "$@"

  require_command psql

  load_env_files "$ENV_FILE" "$ENV_LOCAL_FILE"
  database_url="${DATABASE_URL:-}"
  [ -n "$database_url" ] || fail "DATABASE_URL is empty after loading env files."

  db_user="$(database_url_field "$database_url" username)"
  db_name="$(database_url_field "$database_url" database)"
  [ -n "$db_user" ] || fail "Unable to parse database username from DATABASE_URL."
  [ -n "$db_name" ] || fail "Unable to parse database name from DATABASE_URL."

  if [ -z "$NEW_PASSWORD" ]; then
    NEW_PASSWORD="$(generate_secret 32)"
  fi
  updated_database_url="$(replace_database_url_password "$database_url" "$NEW_PASSWORD")"
  masked_password="$(mask_secret "$NEW_PASSWORD")"

  if [ "$DRY_RUN" -eq 1 ]; then
    log "Dry-run only. Would rotate password for role ${db_user} on database ${db_name}."
    log "Would update ${ENV_FILE} and ${ENV_LOCAL_FILE} with a new DATABASE_URL."
    log "Generated password preview: ${masked_password}"
    exit 0
  fi

  backup_env_files "$ENV_FILE" "$ENV_LOCAL_FILE"
  alter_role_password "$db_user" "$NEW_PASSWORD"
  upsert_env_var "$ENV_FILE" "DATABASE_URL" "$updated_database_url"
  upsert_env_var "$ENV_LOCAL_FILE" "DATABASE_URL" "$updated_database_url"
  verify_new_database_url "$updated_database_url"
  restart_service

  log "Database password rotation completed for ${db_user} on ${db_name}"
  log "New password preview: ${masked_password}"
}

main "$@"
