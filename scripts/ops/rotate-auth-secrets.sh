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
RESTART_SERVICE=1
ROTATE_NEXTAUTH=1
ROTATE_CRON=1
NEW_NEXTAUTH_SECRET=""
NEW_CRON_SECRET=""

# usage prints the supported command-line flags for auth secret rotation.
# Arguments:
#   None.
# Returns:
#   0 after printing help text.
usage() {
  cat <<EOF
Usage: $(basename "$0") [--nextauth-only] [--cron-only] [--dry-run] [--no-restart]

Rotates runtime auth secrets in:
  1. ${ENV_FILE}
  2. ${ENV_LOCAL_FILE}

Secrets covered by this script:
  - NEXTAUTH_SECRET
  - CRON_SECRET
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
      --service)
        SERVICE_NAME="$2"
        shift 2
        ;;
      --nextauth-only)
        ROTATE_NEXTAUTH=1
        ROTATE_CRON=0
        shift
        ;;
      --cron-only)
        ROTATE_NEXTAUTH=0
        ROTATE_CRON=1
        shift
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

# verify_nextauth_endpoint checks the app health through the public auth providers API.
# Arguments:
#   None.
# Returns:
#   0 when the endpoint answers with a 2xx status code.
verify_nextauth_endpoint() {
  require_command curl
  curl --silent --show-error --fail http://127.0.0.1:3000/api/auth/providers >/dev/null
}

# main rotates runtime secrets or prints a dry-run plan.
# Arguments:
#   None.
# Returns:
#   0 on success, non-zero on rotation failure.
main() {
  parse_args "$@"

  if [ "$ROTATE_NEXTAUTH" -eq 0 ] && [ "$ROTATE_CRON" -eq 0 ]; then
    fail "Nothing to rotate. Choose at least one secret."
  fi

  if [ "$ROTATE_NEXTAUTH" -eq 1 ]; then
    NEW_NEXTAUTH_SECRET="$(generate_secret 48)"
  fi

  if [ "$ROTATE_CRON" -eq 1 ]; then
    NEW_CRON_SECRET="$(generate_secret 32)"
  fi

  if [ "$DRY_RUN" -eq 1 ]; then
    if [ "$ROTATE_NEXTAUTH" -eq 1 ]; then
      log "Dry-run only. Would rotate NEXTAUTH_SECRET with preview $(mask_secret "$NEW_NEXTAUTH_SECRET")."
    fi
    if [ "$ROTATE_CRON" -eq 1 ]; then
      log "Dry-run only. Would rotate CRON_SECRET with preview $(mask_secret "$NEW_CRON_SECRET")."
    fi
    log "Would update ${ENV_FILE} and ${ENV_LOCAL_FILE}, then restart ${SERVICE_NAME}."
    exit 0
  fi

  backup_env_files "$ENV_FILE" "$ENV_LOCAL_FILE"

  if [ "$ROTATE_NEXTAUTH" -eq 1 ]; then
    upsert_env_var "$ENV_FILE" "NEXTAUTH_SECRET" "$NEW_NEXTAUTH_SECRET"
    upsert_env_var "$ENV_LOCAL_FILE" "NEXTAUTH_SECRET" "$NEW_NEXTAUTH_SECRET"
  fi

  if [ "$ROTATE_CRON" -eq 1 ]; then
    upsert_env_var "$ENV_FILE" "CRON_SECRET" "$NEW_CRON_SECRET"
    upsert_env_var "$ENV_LOCAL_FILE" "CRON_SECRET" "$NEW_CRON_SECRET"
  fi

  restart_service
  verify_nextauth_endpoint

  if [ "$ROTATE_NEXTAUTH" -eq 1 ]; then
    log "NEXTAUTH_SECRET rotation completed with preview $(mask_secret "$NEW_NEXTAUTH_SECRET")"
  fi
  if [ "$ROTATE_CRON" -eq 1 ]; then
    log "CRON_SECRET rotation completed with preview $(mask_secret "$NEW_CRON_SECRET")"
  fi
}

main "$@"
