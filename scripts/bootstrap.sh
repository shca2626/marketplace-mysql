#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# Vendora Environment Bootstrap — ONE idempotent, self-healing command.
#
#   bash scripts/bootstrap.sh           # verify + FIX everything
#   bash scripts/bootstrap.sh --check   # report only (no changes)
#
# Implements CLAUDE.md's 5 Laws:
#   1. .env must point at Aiven MySQL (auto-recovered from git history if lost)
#   2/3. reminds the delivery workflow (E2E → db:push → git push)
#   4. restores state from GitHub + Aiven after a sandbox rebuild — never rebuilds
#   5. zero manual discovery — this script IS the discovery
#
# Safe to run at ANY time: every step is check-first, fix-only-if-broken.
# ─────────────────────────────────────────────────────────────────────────────
set -uo pipefail
cd "$(dirname "$0")/.."

MODE=fix
[[ "${1:-}" == "--check" ]] && MODE=check

G='\033[0;32m'; R='\033[0;31m'; Y='\033[1;33m'; C='\033[1;36m'; N='\033[0m'
ok()  { echo -e "  ${G}✅${N} $*"; }
bad() { echo -e "  ${R}❌${N} $*"; }
fix() { echo -e "  ${Y}🔧${N} $*"; }
hdr() { echo -e "\n${C}━━━ $* ━━━${N}"; }

FAILS=0

# ── 1. .env → Aiven MySQL ───────────────────────────────────────────────────
hdr "1/6  .env → Aiven MySQL (Law 1)"
if [[ -f .env ]] && grep -q '^DATABASE_URL=mysql://' .env; then
  ok ".env present with mysql:// DATABASE_URL"
else
  if [[ $MODE == check ]]; then
    bad ".env missing or DATABASE_URL is not mysql://"
    FAILS=$((FAILS+1))
  else
    fix ".env missing/invalid — recovering from git history"
    RECOVERED=0
    for c in $(git log --all --format=%H -- .env 2>/dev/null); do
      if git show "${c}^:.env" > .env.candidate 2>/dev/null && grep -q '^DATABASE_URL=mysql://' .env.candidate; then
        mv .env.candidate .env; RECOVERED=1; break
      fi
    done
    rm -f .env.candidate
    if [[ $RECOVERED == 1 ]]; then
      ok ".env recovered from git history (untrack commit parent)"
    else
      bad "could not recover .env — copy .env.example to .env and set the Aiven mysql:// URL"
      FAILS=$((FAILS+1))
    fi
  fi
fi

export DATABASE_URL="$(grep '^DATABASE_URL=' .env 2>/dev/null | head -1 | cut -d= -f2- | tr -d '\r')"
if [[ "${DATABASE_URL:-}" == mysql://* ]]; then
  ok "shell DATABASE_URL exported for child commands (poison neutralized)"
else
  bad "DATABASE_URL unusable — cannot continue"
  FAILS=$((FAILS+1))
fi

# ── 2. Prisma client (generate ONLY when missing — never reflexively) ───────
hdr "2/6  Prisma client (Law 4: restore, don't regenerate needlessly)"
if [[ -d node_modules/.prisma/client ]] && [[ -d node_modules/@prisma/client ]]; then
  ok "client already generated"
else
  if [[ $MODE == check ]]; then
    bad "prisma client missing (fresh clone)"
    FAILS=$((FAILS+1))
  else
    fix "generating prisma client (one-time post-clone step)"
    if bash scripts/with-env.sh bunx prisma generate >/dev/null 2>&1; then
      ok "client generated"
    else
      bad "prisma generate failed — run manually: bash scripts/with-env.sh bunx prisma generate"
      FAILS=$((FAILS+1))
    fi
  fi
fi

# ── 3. Aiven MySQL connectivity ──────────────────────────────────────────────
hdr "3/6  Aiven MySQL connectivity"
CHECK_OUT="$(mktemp)"
if bash scripts/with-env.sh bun scripts/mysql-check.ts > "$CHECK_OUT" 2>&1; then
  SUMMARY="$(grep -m1 -iE 'CONNECTED|version' "$CHECK_OUT" || echo connected)"
  ok "Aiven MySQL reachable — ${SUMMARY}"
else
  bad "MySQL check failed:"
  tail -n 4 "$CHECK_OUT" | sed 's/^/     /'
  FAILS=$((FAILS+1))
fi
rm -f "$CHECK_OUT"

# ── 4. Dev server :3000 ─────────────────────────────────────────────────────
hdr "4/6  Dev server :3000"
if curl -sf -m 8 -o /dev/null http://localhost:3000/; then
  ok "app responding"
else
  if [[ $MODE == check ]]; then
    bad ":3000 not responding"
    FAILS=$((FAILS+1))
  else
    fix "starting dev server with Aiven env (nohup subshell — survives reaping)"
    (nohup env DATABASE_URL="${DATABASE_URL}" bun run dev > /dev/null 2>&1 &)
    UP=0
    for _ in $(seq 1 24); do
      sleep 5
      if curl -sf -m 5 -o /dev/null http://localhost:3000/; then UP=1; break; fi
    done
    if [[ $UP == 1 ]]; then ok "dev server up"; else bad "dev server failed — inspect dev.log"; FAILS=$((FAILS+1)); fi
  fi
fi

# ── 5. WhatsApp bridge :3031 (non-fatal: app degrades gracefully) ────────────
hdr "5/6  WhatsApp bridge :3031 (non-fatal)"
if curl -sf -m 5 -o /dev/null http://localhost:3031/health; then
  ok "bridge healthy"
else
  if [[ $MODE == check ]]; then
    bad ":3031 down (WhatsApp features disabled until it runs)"
  else
    fix "starting whatsapp bridge"
    ( cd mini-services/whatsapp-service && nohup env DATABASE_URL="${DATABASE_URL}" bun run dev > /dev/null 2>&1 & )
    UP=0
    for _ in $(seq 1 10); do
      sleep 3
      if curl -sf -m 3 -o /dev/null http://localhost:3031/health; then UP=1; break; fi
    done
    if [[ $UP == 1 ]]; then ok "bridge up"; else bad "bridge failed to start — check mini-services/whatsapp-service/service.log"; fi
  fi
fi

# ── 6. Git & memory state ───────────────────────────────────────────────────
hdr "6/6  Git & project memory (Laws 3 & 5)"
if git status --porcelain 2>/dev/null | grep -q .; then
  echo -e "  ${Y}⚠️${N} uncommitted changes (Law 3: push after every task):"
  git status --porcelain | head -n 8 | sed 's/^/     /'
else
  ok "working tree clean"
fi
[[ -f worklog.md ]] && ok "worklog.md present" || { bad "worklog.md missing (project memory!)"; FAILS=$((FAILS+1)); }

# ── summary ─────────────────────────────────────────────────────────────────
echo
if [[ $FAILS -eq 0 ]]; then
  echo -e "${G}✔ bootstrap complete — environment healthy${N}"
else
  echo -e "${R}✘ bootstrap found ${FAILS} blocking issue(s)${N}"
fi
echo "  next: read worklog.md → work → E2E → bun run db:push → git add -A && git commit && git push (CLAUDE.md Laws 2-3-5)"
[[ $FAILS -gt 0 ]] && exit 1
exit 0
