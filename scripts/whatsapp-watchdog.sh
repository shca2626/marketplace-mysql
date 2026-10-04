#!/bin/bash
# WhatsApp mini-service watchdog: keeps mini-services/whatsapp-service (port
# 3031) alive. The Baileys pairing/send service died silently on sandbox
# restarts and after fresh checkouts (node_modules not reinstalled), which
# broke admin pairing with "WhatsApp service unreachable (fetch failed)"
# (user-reported, fixed 2026-10-04; hardened same day — bun install now runs
# on EVERY down event because partial node_modules also crash the service:
# "Cannot find package 'pino'"). Self-heals instead of relying on anyone
# remembering to start it manually. Logs every action to whatsapp-watchdog.log.
cd /home/z/my-project/mini-services/whatsapp-service
LOG=/home/z/my-project/whatsapp-watchdog.log
echo "$(date -Is) whatsapp watchdog started" >> "$LOG"
FAILS=0
while true; do
  if ! curl -s -o /dev/null --max-time 3 http://localhost:3031/health 2>/dev/null; then
    FAILS=$((FAILS+1))
    echo "$(date -Is) whatsapp service down (streak $FAILS) — bun install, then restarting" >> "$LOG"
    # Always reconcile dependencies: bun install is fast, idempotent, and
    # repairs both missing and PARTIAL node_modules (transitive deps like pino).
    bun install >> "$LOG" 2>&1
    nohup bun run dev >> "$LOG" 2>&1 &
    disown
    # wait for readiness (up to 30s)
    for i in $(seq 1 30); do
      if curl -s -o /dev/null --max-time 2 http://localhost:3031/health 2>/dev/null; then
        echo "$(date -Is) whatsapp service back up" >> "$LOG"
        FAILS=0
        break
      fi
      sleep 1
    done
    # Escalation: 3 consecutive failed restarts = likely a code/port issue —
    # log it loudly but keep trying (back off to 60s between attempts).
    if [ "$FAILS" -ge 3 ]; then
      echo "$(date -Is) WARNING: $FAILS consecutive restart failures — check whatsapp-watchdog.log for the bun crash output" >> "$LOG"
      sleep 45
    fi
  else
    FAILS=0
  fi
  sleep 15
done
