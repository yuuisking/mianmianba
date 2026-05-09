#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck disable=SC1091
. "${SCRIPT_DIR}/lib.sh"

APP_DIR="${APP_DIR:-/srv/resumer}"
BACKUP_DIR="${BACKUP_DIR:-/var/backups/resumer/postgres}"
LOG_DIR="${LOG_DIR:-/var/log/resumer}"
BACKUP_RETENTION_DAYS="${BACKUP_RETENTION_DAYS:-7}"
CRON_SCHEDULE="${CRON_SCHEDULE:-17 3 * * *}"
CRON_FILE="${CRON_FILE:-/etc/cron.d/resumer-postgres-backup}"

# usage prints the supported command-line flags for cron installation.
# Arguments:
#   None.
# Returns:
#   0 after printing help text.
usage() {
  cat <<EOF
Usage: $(basename "$0") [--schedule 'M H * * *'] [--app-dir PATH] [--backup-dir PATH]

Installs or updates a dedicated cron.d entry that runs backup-postgres.sh daily.
Default schedule: ${CRON_SCHEDULE}
Default cron file: ${CRON_FILE}
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
      --schedule)
        CRON_SCHEDULE="$2"
        shift 2
        ;;
      --app-dir)
        APP_DIR="$2"
        shift 2
        ;;
      --backup-dir)
        BACKUP_DIR="$2"
        shift 2
        ;;
      --log-dir)
        LOG_DIR="$2"
        shift 2
        ;;
      --retention-days)
        BACKUP_RETENTION_DAYS="$2"
        shift 2
        ;;
      --cron-file)
        CRON_FILE="$2"
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

# write_cron_file renders a single cron.d file with the configured backup job.
# Arguments:
#   None.
# Returns:
#   0 when the cron file has been written successfully.
write_cron_file() {
  local backup_script

  backup_script="${APP_DIR}/scripts/ops/backup-postgres.sh"
  [ -x "$backup_script" ] || fail "Backup script is not executable: ${backup_script}"

  cat > "$CRON_FILE" <<EOF
SHELL=/bin/bash
PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin

${CRON_SCHEDULE} root APP_DIR='${APP_DIR}' BACKUP_DIR='${BACKUP_DIR}' BACKUP_RETENTION_DAYS='${BACKUP_RETENTION_DAYS}' '${backup_script}' >> '${LOG_DIR}/postgres-backup.log' 2>&1
EOF

  chmod 0644 "$CRON_FILE"
}

# main prepares required directories and installs the cron entry.
# Arguments:
#   None.
# Returns:
#   0 on success, non-zero on installation failure.
main() {
  parse_args "$@"

  [ "$(id -u)" -eq 0 ] || fail "This script must run as root to write ${CRON_FILE}."

  ensure_directory "$BACKUP_DIR"
  ensure_directory "$LOG_DIR"
  write_cron_file

  log "Installed cron entry at ${CRON_FILE}"
  cat "$CRON_FILE"
}

main "$@"
