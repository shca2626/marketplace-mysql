#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# db-reset-guard.sh — Law 4 enforcement: the Aiven MySQL dataset must NEVER be
# wiped. `bun run db:reset` routes through here and is refused unless the
# operator explicitly exports CONFIRM_DB_RESET=yes.
# ─────────────────────────────────────────────────────────────────────────────
set -euo pipefail

if [[ "${CONFIRM_DB_RESET:-}" != "yes" ]]; then
  echo "⛔ REFUSED: prisma migrate reset would WIPE the shared Aiven MySQL dataset."
  echo "   Per the owner's protocol (CLAUDE.md, Law 4): lost work is restored from"
  echo "   GitHub + Aiven — the database is never rebuilt or reset."
  echo "   If you truly understand what you are doing, export CONFIRM_DB_RESET=yes."
  exit 1
fi

echo "⚠️  CONFIRM_DB_RESET=yes — proceeding with prisma migrate reset…"
exec bash scripts/with-env.sh prisma migrate reset "$@"
