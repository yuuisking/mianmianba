#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck disable=SC1091
. "${SCRIPT_DIR}/lib.sh"

APP_DIR="${APP_DIR:-/srv/resumer}"
ENV_FILE="${ENV_FILE:-${APP_DIR}/.env}"
ENV_LOCAL_FILE="${ENV_LOCAL_FILE:-${APP_DIR}/.env.local}"
BACKUP_DIR="${BACKUP_DIR:-/var/backups/resumer/postgres}"
VERIFY_RESTORE=0
BACKUP_FILE=""

# usage prints the supported command-line flags for backup verification.
# Arguments:
#   None.
# Returns:
#   0 after printing help text.
usage() {
  cat <<EOF
Usage: $(basename "$0") [--backup-file PATH] [--backup-dir PATH] [--restore-check]

By default the script validates the latest backup catalog with pg_restore --list.
Use --restore-check to create a temporary database and perform a full restore test.
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
      --backup-file)
        BACKUP_FILE="$2"
        shift 2
        ;;
      --backup-dir)
        BACKUP_DIR="$2"
        shift 2
        ;;
      --restore-check)
        VERIFY_RESTORE=1
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

# resolve_backup_file selects the target dump file from explicit input or latest symlink.
# Arguments:
#   None.
# Returns:
#   Prints the resolved backup file path to stdout.
resolve_backup_file() {
  if [ -n "$BACKUP_FILE" ]; then
    printf '%s\n' "$BACKUP_FILE"
    return
  fi

  if [ -L "${BACKUP_DIR}/latest.dump" ]; then
    readlink "${BACKUP_DIR}/latest.dump"
    return
  fi

  latest_file="$(find "$BACKUP_DIR" -type f -name '*.dump' | sort | tail -n 1)"
  [ -n "${latest_file:-}" ] || fail "No backup file found in ${BACKUP_DIR}"
  printf '%s\n' "$latest_file"
}

# perform_restore_check restores the backup into a temporary database and drops it.
# Arguments:
#   $1 - Backup file path.
#   $2 - Original database name used as a prefix for the temporary database.
# Returns:
#   0 when the restore succeeds and the temporary database is cleaned up.
perform_restore_check() {
  local backup_file
  local database_name
  local temp_database
  local table_count

  backup_file="$1"
  database_name="$2"
  temp_database="${database_name}_restore_check_$(date '+%Y%m%d%H%M%S')"

  log "Creating temporary database ${temp_database} for restore verification"
  run_postgres_admin createdb "$temp_database"

  cleanup_restore_check() {
    run_postgres_admin dropdb --if-exists "$temp_database" >/dev/null 2>&1 || true
  }
  trap cleanup_restore_check EXIT

  run_postgres_admin pg_restore \
    --no-owner \
    --no-privileges \
    --clean \
    --if-exists \
    --dbname="$temp_database" \
    "$backup_file"

  table_count="$(run_postgres_admin psql -d "$temp_database" -tAc "SELECT count(*) FROM pg_tables WHERE schemaname NOT IN ('pg_catalog', 'information_schema');")"
  log "Restore verification completed with ${table_count} non-system tables"

  cleanup_restore_check
  trap - EXIT
}

# main verifies the latest or requested PostgreSQL backup.
# Arguments:
#   None.
# Returns:
#   0 on success, non-zero on verification failure.
main() {
  local database_url
  local database_name
  local backup_file

  parse_args "$@"

  require_command pg_restore
  require_command find
  require_command sort
  require_command tail

  load_env_files "$ENV_FILE" "$ENV_LOCAL_FILE"
  database_url="${DATABASE_URL:-}"
  [ -n "$database_url" ] || fail "DATABASE_URL is empty after loading env files."
  database_name="$(database_url_field "$database_url" database)"

  backup_file="$(resolve_backup_file)"
  [ -f "$backup_file" ] || fail "Backup file does not exist: ${backup_file}"

  log "Validating backup catalog: ${backup_file}"
  pg_restore --list "$backup_file" >/dev/null

  if [ "$VERIFY_RESTORE" -eq 1 ]; then
    perform_restore_check "$backup_file" "$database_name"
  fi

  log "Backup verification succeeded: ${backup_file}"
  printf '%s\n' "$backup_file"
}

main "$@"
