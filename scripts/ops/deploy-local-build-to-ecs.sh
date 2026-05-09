#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
APP_DIR="$(cd "${SCRIPT_DIR}/../.." && pwd)"
# shellcheck disable=SC1091
. "${SCRIPT_DIR}/lib.sh"

REMOTE_HOST="${REMOTE_HOST:-root@47.95.233.109}"
REMOTE_APP_DIR="${REMOTE_APP_DIR:-/srv/resumer}"
REMOTE_SERVICE="${REMOTE_SERVICE:-resumer}"
REMOTE_RUNTIME_USER="${REMOTE_RUNTIME_USER:-deploy}"
REMOTE_BACKUP_SCRIPT="${REMOTE_BACKUP_SCRIPT:-${REMOTE_APP_DIR}/scripts/ops/backup-postgres.sh}"
DEPLOY_TMP_DIR="${DEPLOY_TMP_DIR:-${APP_DIR}/tmp}"

# usage prints the supported command-line flags for this deployment helper.
# Arguments:
#   None.
# Returns:
#   0 after printing help text.
usage() {
  cat <<EOF
Usage: $(basename "$0") [--remote user@host] [--remote-app-dir PATH] [--remote-service NAME] [--skip-backup]

Packages the current local workspace, uploads it to ECS, extracts it into the
app directory, refreshes Prisma client and production build on the remote host,
fixes ownership, and restarts the systemd service.
EOF
}

# parse_args reads supported CLI flags and updates deployment configuration.
# Arguments:
#   $@ - Raw CLI arguments.
# Returns:
#   0 when all arguments are valid, otherwise exits non-zero.
parse_args() {
  SKIP_BACKUP="false"

  while [ "$#" -gt 0 ]; do
    case "$1" in
      --remote)
        REMOTE_HOST="$2"
        shift 2
        ;;
      --remote-app-dir)
        REMOTE_APP_DIR="$2"
        REMOTE_BACKUP_SCRIPT="${REMOTE_APP_DIR}/scripts/ops/backup-postgres.sh"
        shift 2
        ;;
      --remote-service)
        REMOTE_SERVICE="$2"
        shift 2
        ;;
      --remote-runtime-user)
        REMOTE_RUNTIME_USER="$2"
        shift 2
        ;;
      --skip-backup)
        SKIP_BACKUP="true"
        shift 1
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

# require_local_build ensures deployment starts from a verified local production build.
# The ECS host only refreshes Prisma runtime artifacts and restarts the service, so the
# local .next output must exist before packaging.
# Arguments:
#   None.
# Returns:
#   0 when the local .next output exists, otherwise exits non-zero.
require_local_build() {
  [ -d "${APP_DIR}/.next/server" ] || fail "Missing local .next build. Run npm run build before deployment."
}

# build_archive creates a tarball from the current workspace, including the verified
# local .next build output that ECS will run directly.
# Arguments:
#   $1 - Output tar.gz path.
# Returns:
#   0 when the archive is created successfully.
build_archive() {
  local output_path

  output_path="$1"
  ensure_directory "$(dirname "$output_path")"

  COPYFILE_DISABLE=1 COPY_EXTENDED_ATTRIBUTES_DISABLE=1 tar \
    --no-mac-metadata \
    --exclude='.git' \
    --exclude='node_modules' \
    --exclude='.env' \
    --exclude='.env.local' \
    --exclude='tmp' \
    --exclude='dogfood-output' \
    --exclude='test-results' \
    --exclude='.trae' \
    --exclude='._*' \
    -czf "$output_path" \
    -C "$APP_DIR" \
    .
}

# upload_archive copies the deployment archive to the remote host over SCP.
# Arguments:
#   $1 - Local archive path.
#   $2 - Remote archive path.
# Returns:
#   0 when the file upload completes successfully.
upload_archive() {
  local local_archive
  local remote_archive

  local_archive="$1"
  remote_archive="$2"
  scp "$local_archive" "${REMOTE_HOST}:${remote_archive}"
}

# run_remote_deploy executes backup, extraction, Prisma regeneration, Prisma alias
# compatibility patching, ownership fixes, and service restart on ECS.
# Arguments:
#   $1 - Remote archive path.
# Returns:
#   0 when the deployment steps finish successfully.
run_remote_deploy() {
  local remote_archive
  local backup_clause

  remote_archive="$1"
  if [ "${SKIP_BACKUP}" = "true" ]; then
    backup_clause='echo "Skipping backup by request."'
  else
    backup_clause="[ -x '${REMOTE_BACKUP_SCRIPT}' ] && '${REMOTE_BACKUP_SCRIPT}' >/dev/null || true"
  fi

  ssh "$REMOTE_HOST" "
    set -euo pipefail
    ${backup_clause}
    mkdir -p '${REMOTE_APP_DIR}'
    find '${REMOTE_APP_DIR}' -name '._*' -delete || true
    rm -rf '${REMOTE_APP_DIR}/.next'
    tar -xzf '${remote_archive}' -C '${REMOTE_APP_DIR}'
    find '${REMOTE_APP_DIR}' -name '._*' -delete || true
    chown -R '${REMOTE_RUNTIME_USER}:${REMOTE_RUNTIME_USER}' '${REMOTE_APP_DIR}'
    sudo -u '${REMOTE_RUNTIME_USER}' sh -lc 'cd \"${REMOTE_APP_DIR}\" && npx prisma generate'
    PRISMA_ALIAS=\$(grep -Rho '@prisma/client-[a-z0-9]\\+' '${REMOTE_APP_DIR}/.next/server' '${REMOTE_APP_DIR}/.next/dev/server' 2>/dev/null | head -n 1 | sed 's#@prisma/##' || true)
    if [ -n \"\${PRISMA_ALIAS}\" ]; then
      mkdir -p '${REMOTE_APP_DIR}/node_modules/@prisma/\${PRISMA_ALIAS}'
      cat > '${REMOTE_APP_DIR}/node_modules/@prisma/\${PRISMA_ALIAS}/package.json' <<EOF
{
  \"name\": \"@prisma/\${PRISMA_ALIAS}\",
  \"main\": \"index.js\",
  \"types\": \"index.d.ts\"
}
EOF
      cat > '${REMOTE_APP_DIR}/node_modules/@prisma/\${PRISMA_ALIAS}/index.js' <<EOF
module.exports = require('@prisma/client');
EOF
      cat > '${REMOTE_APP_DIR}/node_modules/@prisma/\${PRISMA_ALIAS}/index.d.ts' <<EOF
export * from '@prisma/client';
EOF
      chown -R '${REMOTE_RUNTIME_USER}:${REMOTE_RUNTIME_USER}' '${REMOTE_APP_DIR}/node_modules/@prisma/\${PRISMA_ALIAS}'
    fi
    systemctl restart '${REMOTE_SERVICE}'
    systemctl is-active '${REMOTE_SERVICE}'
    rm -f '${remote_archive}'
  "
}

# main packages the current workspace and deploys it to ECS.
# Arguments:
#   $@ - Raw CLI arguments.
# Returns:
#   0 on successful deployment, non-zero on failure.
main() {
  local timestamp
  local archive_path
  local remote_archive_path

  parse_args "$@"
  require_command tar
  require_command scp
  require_command ssh
  require_local_build

  timestamp="$(date '+%Y%m%d_%H%M%S')"
  archive_path="${DEPLOY_TMP_DIR}/resumer-deploy-${timestamp}.tar.gz"
  remote_archive_path="/tmp/resumer-deploy-${timestamp}.tar.gz"

  log "Building deployment archive from current workspace: ${archive_path}"
  build_archive "$archive_path"
  log "Uploading archive to ${REMOTE_HOST}:${remote_archive_path}"
  upload_archive "$archive_path" "$remote_archive_path"
  log "Applying deployment on ${REMOTE_HOST}"
  run_remote_deploy "$remote_archive_path"
  log "Deployment completed successfully."
}

main "$@"
