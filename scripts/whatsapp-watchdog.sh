#!/bin/bash
# WhatsApp mini-service watchdog: keeps mini-services/whatsapp-service (port
# 3031) alive. The Baileys pairing/send service died silently on sandbox
# restarts and after fresh checkouts (node_modules not reinstalled), which
# broke admin pairing with "WhatsApp service unreachable (fetch failed)"
# (user-reported, fixed 2026-10-04; hardened same day — bun install now runs
# on EVERY down event because partial node_modules also crash the service:
# "Cannot find package 'pino'").
#
# 2026-10-05: duplicate instances were observed in the sandbox (two `bun run
# dev` pairs). A zombie that lost the port race keeps its own session map and
# Baileys sockets — pairing status flaps and sockets replace each other
# ("Unable to connect the phone"). Before every restart we now kill EVERY
# process whose cwd is this service dir, then start one clean instance. The
# service itself also has an EADDRINUSE guard as a second layer.
cd /home/z/my-project/mini-services/whatsapp-service
LOG=/home/z/my-project/whatsapp-watchdog.log
echo "$(date -Is) whatsapp watchdog started" >> "$LOG"
FAILS=0
kill_strays() {
  # pkill -f on the entry file + cwd scan — belt and braces.
  for pid in $(pgrep -f "bun.*whatsapp-service" 2>/dev/null); do
    [ "$pid" = "$$" ] && continue
    kill "$pid" 2>/dev/null
  done
  for proc in /proc/[0-9]*; do
    pid=${proc#/proc/}
    [ "$pid" = "$$" ] && continue
    cwd=$(readlink "$proc/cwd" 2>/dev/null) || continue
    if [ "$cwd" = "/home/z/my-project/mini-services/whatsapp-service" ]; then
      kill "$pid" 2>/dev/null
    fi
  done
  sleep 1
  return 0
}
while true; do
  if ! curl -s -o /dev/null --max-time 3 http://localhost:3031/health 2>/dev/null; then
    FAILS=$((FAILS+1))
    echo "$(date -Is) whatsapp service down (streak $FAILS) — killing strays, bun install, then restarting" >> "$LOG"
    # Zombies with a split-brain session map are worse than a short outage.
    kill_strays >> "$LOG" 2>&1
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
    # Healthy — nothing to do. Duplicate instances are prevented by the
    # service's own EADDRINUSE guard (a second instance exits instead of
    # lingering as a split-brain zombie), so no dedupe here: killing from the
    # healthy branch would also kill this watchdog's own `bun run dev` child
    # (same cwd) with no restart path.
    FAILS=0
  fi
  sleep 15
done
