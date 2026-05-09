#!/usr/bin/env bash
set -euo pipefail

# log prints a timestamped message to stderr for audit-friendly shell output.
# Arguments:
#   $* - Message parts to print.
# Returns:
#   0 after writing the log line.
log() {
  printf '[%s] %s\n' "$(date '+%Y-%m-%d %H:%M:%S')" "$*" >&2
}

# fail prints an error message and exits the current script immediately.
# Arguments:
#   $* - Error details to print.
# Returns:
#   Does not return because the function exits with status 1.
fail() {
  log "ERROR: $*"
  exit 1
}

# require_command ensures a required executable is available before continuing.
# Arguments:
#   $1 - Command name to look up in PATH.
# Returns:
#   0 when the command exists, otherwise exits non-zero.
require_command() {
  command -v "$1" >/dev/null 2>&1 || fail "Missing required command: $1"
}

# ensure_directory creates a directory when it does not exist yet.
# Arguments:
#   $1 - Absolute or relative directory path.
# Returns:
#   0 when the directory exists after the function finishes.
ensure_directory() {
  [ -d "$1" ] || mkdir -p "$1"
}

# backup_env_files creates timestamped backups before mutating env files.
# Arguments:
#   $@ - Env file paths that should be copied if they exist.
# Returns:
#   0 after all existing files are backed up.
backup_env_files() {
  local timestamp
  local file

  timestamp="$(date '+%Y%m%d%H%M%S')"
  for file in "$@"; do
    if [ -f "$file" ]; then
      cp "$file" "${file}.bak_${timestamp}"
    fi
  done
}

# load_env_files exports variables from env files in the given order.
# Arguments:
#   $@ - Env file paths. Later files override earlier files.
# Returns:
#   0 when all readable env files are loaded successfully.
load_env_files() {
  local file

  for file in "$@"; do
    [ -f "$file" ] || continue
    set -a
    # shellcheck disable=SC1090
    . "$file"
    set +a
  done
}

# upsert_env_var inserts or replaces a single KEY=value entry in an env file.
# Arguments:
#   $1 - Target env file path.
#   $2 - Variable name.
#   $3 - Variable value.
# Returns:
#   0 when the file has been updated successfully.
upsert_env_var() {
  require_command python3

  python3 - "$1" "$2" "$3" <<'PY'
from pathlib import Path
import sys

file_path = Path(sys.argv[1])
key = sys.argv[2]
value = sys.argv[3]


def shell_quote(text: str) -> str:
    return "'" + text.replace("'", "'\"'\"'") + "'"


line = f"{key}={shell_quote(value)}"
contents = []
if file_path.exists():
    contents = file_path.read_text().splitlines()

updated = False
result = []
for existing in contents:
    stripped = existing.strip()
    if stripped.startswith(f"{key}="):
        result.append(line)
        updated = True
    else:
        result.append(existing)

if not updated:
    if result and result[-1] != "":
        result.append("")
    result.append(line)

file_path.write_text("\n".join(result).rstrip("\n") + "\n")
PY
}

# database_url_field extracts a component from a PostgreSQL connection string.
# Arguments:
#   $1 - Database URL.
#   $2 - Requested field: scheme, username, password, hostname, port, database.
# Returns:
#   Prints the requested field to stdout and exits 0 on success.
database_url_field() {
  require_command python3

  python3 - "$1" "$2" <<'PY'
import sys
from urllib.parse import urlparse

url = urlparse(sys.argv[1])
field = sys.argv[2]
mapping = {
    "scheme": url.scheme,
    "username": url.username or "",
    "password": url.password or "",
    "hostname": url.hostname or "",
    "port": "" if url.port is None else str(url.port),
    "database": url.path.lstrip("/"),
}
print(mapping[field])
PY
}

# replace_database_url_password rebuilds a database URL with a new password.
# Arguments:
#   $1 - Existing database URL.
#   $2 - New password to embed into the URL.
# Returns:
#   Prints the updated URL to stdout and exits 0 on success.
replace_database_url_password() {
  require_command python3

  python3 - "$1" "$2" <<'PY'
import sys
from urllib.parse import quote, urlparse

current_url = urlparse(sys.argv[1])
new_password = sys.argv[2]

username = current_url.username or ""
hostname = current_url.hostname or ""
port = f":{current_url.port}" if current_url.port else ""
userinfo = quote(username, safe="")
if new_password:
    userinfo += ":" + quote(new_password, safe="")

netloc = f"{userinfo}@{hostname}{port}"
query = f"?{current_url.query}" if current_url.query else ""
fragment = f"#{current_url.fragment}" if current_url.fragment else ""
print(f"{current_url.scheme}://{netloc}{current_url.path}{query}{fragment}")
PY
}

# sanitize_database_url removes Prisma-only query parameters before handing the URL to libpq tools.
# Arguments:
#   $1 - Existing database URL.
# Returns:
#   Prints the sanitized URL to stdout and exits 0 on success.
sanitize_database_url() {
  require_command python3

  python3 - "$1" <<'PY'
import sys
from urllib.parse import parse_qsl, quote, urlencode, urlparse

current_url = urlparse(sys.argv[1])
filtered_query = [(key, value) for key, value in parse_qsl(current_url.query, keep_blank_values=True) if key not in {"schema"}]

username = quote(current_url.username or "", safe="")
password = current_url.password or ""
hostname = current_url.hostname or ""
port = f":{current_url.port}" if current_url.port else ""
userinfo = username
if password:
    userinfo += ":" + quote(password, safe="")

netloc = f"{userinfo}@{hostname}{port}"
query = urlencode(filtered_query)
query_suffix = f"?{query}" if query else ""
fragment = f"#{current_url.fragment}" if current_url.fragment else ""
print(f"{current_url.scheme}://{netloc}{current_url.path}{query_suffix}{fragment}")
PY
}

# generate_secret returns a URL-safe random secret using Python's secrets module.
# Arguments:
#   $1 - Desired entropy size in bytes.
# Returns:
#   Prints the generated secret to stdout and exits 0 on success.
generate_secret() {
  require_command python3

  python3 - "$1" <<'PY'
import secrets
import sys

size = int(sys.argv[1])
print(secrets.token_urlsafe(size))
PY
}

# mask_secret reduces a sensitive value to a short audit-friendly preview.
# Arguments:
#   $1 - Secret value.
# Returns:
#   Prints a masked secret preview to stdout.
mask_secret() {
  require_command python3

  python3 - "$1" <<'PY'
import sys

value = sys.argv[1]
if len(value) <= 8:
    print("*" * len(value))
else:
    print(f"{value[:4]}...{value[-4:]}")
PY
}

# run_postgres_admin executes a command as the postgres system user when possible.
# Arguments:
#   $@ - Command and arguments to execute.
# Returns:
#   Propagates the wrapped command exit status.
run_postgres_admin() {
  local postgres_system_user

  postgres_system_user="${POSTGRES_SYSTEM_USER:-postgres}"
  if [ "$(id -u)" -eq 0 ] && command -v sudo >/dev/null 2>&1 && id "$postgres_system_user" >/dev/null 2>&1; then
    sudo -u "$postgres_system_user" "$@"
    return
  fi

  "$@"
}
