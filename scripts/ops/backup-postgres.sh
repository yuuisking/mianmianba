#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck disable=SC1091
. "${SCRIPT_DIR}/lib.sh"

APP_DIR="${APP_DIR:-/srv/resumer}"
ENV_FILE="${ENV_FILE:-${APP_DIR}/.env}"
ENV_LOCAL_FILE="${ENV_LOCAL_FILE:-${APP_DIR}/.env.local}"
BACKUP_DIR="${BACKUP_DIR:-/var/backups/resumer/postgres}"
BACKUP_RETENTION_DAYS="${BACKUP_RETENTION_DAYS:-7}"

# usage prints the supported command-line flags for this backup script.
# Arguments:
#   None.
# Returns:
#   0 after printing help text.
usage() {
  cat <<EOF
Usage: $(basename "$0") [--app-dir PATH] [--backup-dir PATH] [--retention-days DAYS]

Creates a compressed PostgreSQL custom-format backup using DATABASE_URL from:
  1. ${ENV_FILE}
  2. ${ENV_LOCAL_FILE}
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
      --app-dir)
        APP_DIR="$2"
        ENV_FILE="${APP_DIR}/.env"
        ENV_LOCAL_FILE="${APP_DIR}/.env.local"
        shift 2
        ;;
      --backup-dir)
        BACKUP_DIR="$2"
        shift 2
        ;;
      --retention-days)
        BACKUP_RETENTION_DAYS="$2"
        shift 2
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

# write_checksum_file stores a SHA-256 checksum using the first available tool.
# Arguments:
#   $1 - Backup file path.
#   $2 - Checksum output path.
# Returns:
#   0 when the checksum file is written successfully.
write_checksum_file() {
  local source_file
  local checksum_file

  source_file="$1"
  checksum_file="$2"

  if command -v shasum >/dev/null 2>&1; then
    shasum -a 256 "$source_file" > "$checksum_file"
    return
  fi

  if command -v sha256sum >/dev/null 2>&1; then
    sha256sum "$source_file" > "$checksum_file"
    return
  fi

  if command -v openssl >/dev/null 2>&1; then
    openssl dgst -sha256 "$source_file" | sed "s#^SHA2-256(${source_file})= ##" | awk -v file="$source_file" '{print $1 "  " file}' > "$checksum_file"
    return
  fi

  fail "Missing checksum command: shasum, sha256sum, or openssl"
}

# grant_postgres_read_access allows restore verification to read backup artifacts.
# Arguments:
#   $1 - Backup directory path.
#   $2 - Backup dump path.
#   $3 - Manifest path.
#   $4 - Checksum path.
# Returns:
#   0 after file permissions are aligned for backup and restore checks.
grant_postgres_read_access() {
  local backup_dir
  local backup_file
  local manifest_file
  local checksum_file

  backup_dir="$1"
  backup_file="$2"
  manifest_file="$3"
  checksum_file="$4"

  if [ "$(id -u)" -eq 0 ] && command -v getent >/dev/null 2>&1 && getent group postgres >/dev/null 2>&1; then
    chgrp postgres "$backup_dir" "$backup_file" "$manifest_file" "$checksum_file"
    chmod 750 "$backup_dir"
    chmod 640 "$backup_file" "$manifest_file" "$checksum_file"
    return
  fi

  chmod 700 "$backup_dir" || true
  chmod 600 "$backup_file" "$manifest_file" "$checksum_file" || true
}

# main executes the backup flow and prints the final archive location.
# Arguments:
#   None.
# Returns:
#   0 on success, non-zero on backup failure.
main() {
  local database_url
  local database_name
  local backup_database_url
  local timestamp
  local backup_file
  local checksum_file
  local manifest_file

  parse_args "$@"

  require_command pg_dump
  require_command pg_restore

  load_env_files "$ENV_FILE" "$ENV_LOCAL_FILE"
  database_url="${DATABASE_URL:-}"
  [ -n "$database_url" ] || fail "DATABASE_URL is empty after loading env files."
  backup_database_url="$(sanitize_database_url "$database_url")"

  database_name="$(database_url_field "$database_url" database)"
  [ -n "$database_name" ] || fail "Unable to parse database name from DATABASE_URL."

  ensure_directory "$BACKUP_DIR"

  timestamp="$(date '+%Y%m%d_%H%M%S')"
  backup_file="${BACKUP_DIR}/${database_name}_${timestamp}.dump"
  checksum_file="${backup_file}.sha256"
  manifest_file="${backup_file}.manifest"

  log "Creating PostgreSQL backup at ${backup_file}"
  pg_dump \
    --dbname="$backup_database_url" \
    --format=custom \
    --compress=9 \
    --file="$backup_file"

  pg_restore --list "$backup_file" > "$manifest_file"
  write_checksum_file "$backup_file" "$checksum_file"
  grant_postgres_read_access "$BACKUP_DIR" "$backup_file" "$manifest_file" "$checksum_file"
  ln -sfn "$backup_file" "${BACKUP_DIR}/latest.dump"
  ln -sfn "$manifest_file" "${BACKUP_DIR}/latest.dump.manifest"
  ln -sfn "$checksum_file" "${BACKUP_DIR}/latest.dump.sha256"

  find "$BACKUP_DIR" -type f \( -name '*.dump' -o -name '*.sha256' -o -name '*.manifest' \) -mtime +"$BACKUP_RETENTION_DAYS" -delete

  log "Backup completed: ${backup_file}"
  printf '%s\n' "$backup_file"
}

main "$@"
