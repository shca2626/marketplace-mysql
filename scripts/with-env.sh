#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# with-env.sh — force the Aiven MySQL DATABASE_URL from .env over any poisoned
# shell environment, then exec the given command.
#
# WHY: the sandbox supervisor exports DATABASE_URL=file:…custom.db (SQLite)
# into every spawned shell, and process env SHADOWS .env files. The app is
# immune (src/lib/db.ts self-heals), but Prisma CLI and standalone bun
# scripts read process.env directly.
#
# Usage:  bash scripts/with-env.sh <command> [args…]
#   e.g.  bash scripts/with-env.sh prisma db push
#         bash scripts/with-env.sh bun scripts/seed-solar.ts
# ─────────────────────────────────────────────────────────────────────────────
set -euo pipefail
cd "$(dirname "$0")/.."

if [[ -f .env ]]; then
  url="$(grep -E '^DATABASE_URL=' .env | head -1 | cut -d= -f2- | tr -d '\r')"
  if [[ -n "${url}" && "${url}" == mysql://* ]]; then
    export DATABASE_URL="${url}"
  elif [[ -n "${url}" && "${url}" != mysql://* ]]; then
    echo "❌ with-env: .env DATABASE_URL is not a mysql:// URL — refusing." >&2
    echo "   Fix .env (bash scripts/bootstrap.sh recovers it) or point it at Aiven MySQL." >&2
    exit 1
  fi
else
  echo "⚠️  with-env: no .env found — running with current environment." >&2
fi

exec "$@"
