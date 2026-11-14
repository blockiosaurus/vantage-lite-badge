#!/usr/bin/env bash
# Build the badge's Lua 5.5 natively from solana-os and drive badge/ through
# the scenarios in tools/harness/scenarios.lua.
#
#   tools/harness/run.sh                 # clones solana-os into .cache/ if needed
#   SOLANA_OS=../solana-os tools/harness/run.sh
#
# Fixtures come from the server (server/test/export-fixtures.test.ts):
#   (cd server && EXPORT_FIXTURES=../tools/harness/fixtures.json npx vitest run test/export-fixtures.test.ts)
set -euo pipefail

here="$(cd "$(dirname "$0")" && pwd)"
root="$(cd "$here/../.." && pwd)"
cache="$root/.cache"
os_dir="${SOLANA_OS:-$cache/solana-os}"

if [ ! -d "$os_dir/main/lua/vendor" ]; then
  mkdir -p "$cache"
  git clone --depth 1 https://github.com/solana-foundation/solana-os "$os_dir"
fi

vendor="$os_dir/main/lua/vendor"
bin="$cache/badge-lua"
if [ ! -x "$bin" ] || [ "$here/host.c" -nt "$bin" ]; then
  mkdir -p "$cache"
  cc -O1 -w -I"$vendor" -o "$bin" "$here/host.c" "$vendor"/*.c -lm
fi

cd "$root"
"$bin" "$here/harness.lua" "$root/badge" "$here/fixtures.json" "$@"
