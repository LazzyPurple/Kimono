#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SOURCE_ROOT="${1:-$(cd "$SCRIPT_DIR/.." && pwd)}"
STAGING_ROOT="${2:-$SOURCE_ROOT/deploy/.o2switch-runtime-stage}"
BUILD_ROOT="$(mktemp -d /tmp/kimono-o2switch-build.XXXXXX)"
SOURCE_COPY="$BUILD_ROOT/source"
RUNTIME_ROOT="$BUILD_ROOT/runtime"

cleanup() {
  rm -rf "$BUILD_ROOT"
}
trap cleanup EXIT

require_command() {
  if ! command -v "$1" >/dev/null 2>&1; then
    echo "[o2switch] Missing required command: $1" >&2
    if [[ "$1" == "node" || "$1" == "npm" ]]; then
      echo "[o2switch] Install Node.js 22 inside Ubuntu, then rerun npm run build:o2switch-package." >&2
    fi
    exit 1
  fi
}

require_command node
require_command npm
require_command tar
require_command grep

SOURCE_ROOT="$(cd "$SOURCE_ROOT" && pwd)"
mkdir -p "$SOURCE_COPY" "$RUNTIME_ROOT"

copy_source() {
  tar \
    --exclude='.git' \
    --exclude='.next' \
    --exclude='.npm-cache' \
    --exclude='.env' \
    --exclude='.env.*' \
    --exclude='*.db' \
    --exclude='*.db-shm' \
    --exclude='*.db-wal' \
    --exclude='*.log' \
    --exclude='debug.log' \
    --exclude='deploy-package' \
    --exclude='deploy/*.zip' \
    --exclude='dev.db' \
    --exclude='init-error.log' \
    --exclude='next_error.log' \
    --exclude='node_modules' \
    --exclude='tests' \
    --exclude='tsconfig.tsbuildinfo' \
    -C "$SOURCE_ROOT" -cf - . | tar -C "$SOURCE_COPY" -xf -
}

stage_runtime_path() {
  local relative_path="$1"
  local source_path="$SOURCE_COPY/$relative_path"
  local target_path="$RUNTIME_ROOT/$relative_path"

  if [[ ! -e "$source_path" ]]; then
    return
  fi

  mkdir -p "$(dirname "$target_path")"
  cp -a "$source_path" "$target_path"
}

echo "[o2switch] Copying source into Linux build workspace..."
copy_source
rm -f "$SOURCE_COPY/prisma.config.ts"

cd "$SOURCE_COPY"
echo "[o2switch] Installing dependencies with npm ci..."
npm ci

echo "[o2switch] Building production bundle with Webpack..."
npm run build

if grep -R -n -E 'sharp-win32|@img/sharp-win32|win32-x64\\.node' "$SOURCE_COPY/.next" >/dev/null 2>&1; then
  echo "[o2switch] Windows-only binary references were found in the build traces." >&2
  exit 1
fi

for runtime_path in \
  '.next' \
  'app' \
  'auth.ts' \
  'components' \
  'contexts' \
  'hooks' \
  'lib' \
  'next.config.mjs' \
  'proxy.ts' \
  'public' \
  'server.js'; do
  stage_runtime_path "$runtime_path"
done
stage_runtime_path 'deploy/o2switch-init.sql'

echo "[o2switch] Writing runtime package.json..."
node "$SOURCE_COPY/scripts/write-o2switch-runtime-package.mjs" \
  "$SOURCE_COPY/package.json" \
  "$SOURCE_COPY/package-lock.json" \
  "$RUNTIME_ROOT/package.json"

echo "[o2switch] Generating Linux runtime package-lock.json..."
(
  cd "$RUNTIME_ROOT"
  npm install --package-lock-only --omit=dev
)

rm -rf "$STAGING_ROOT"
mkdir -p "$STAGING_ROOT"
cp -a "$RUNTIME_ROOT/." "$STAGING_ROOT/"

echo "[o2switch] Runtime staging prepared at: $STAGING_ROOT"