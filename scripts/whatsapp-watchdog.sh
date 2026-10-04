#!/bin/bash
# WhatsApp mini-service watchdog: keeps mini-services/whatsapp-service (port
# 3031) alive. The Baileys pairing/send service died silently on sandbox
# restarts and after fresh checkouts (node_modules not reinstalled), which
# broke admin pairing with "WhatsApp service unreachable (fetch failed)"
# (user-reported, fixed 2026-10-04). Self-heals instead of relying on anyone
# remembering to start it manually. Logs every action to whatsapp-watchdog.log.
cd /home/z/my-project/mini-services/whatsapp-service
LOG=/home/z/my-project/whatsapp-watchdog.log
echo "$(date -Is) whatsapp watchdog started" >> "$LOG"
while true; do
  if ! curl -s -o /dev/null --max-time 3 http://localhost:3031/health 2>/dev/null; then
    echo "$(date -Is) whatsapp service down — checking/installing deps, then restarting" >> "$LOG"
    # Fresh checkout guard: node_modules may be absent (git never tracks it).
    if [ ! -d node_modules ] || [ ! -d node_modules/@whiskeysockets ]; then
      echo "$(date -Is) node_modules missing — running bun install" >> "$LOG"
      bun install >> "$LOG" 2>&1
    fi
    nohup bun run dev >> "$LOG" 2>&1 &
    disown
    # wait for readiness (up to 30s)
    for i in $(seq 1 30); do
      if curl -s -o /dev/null --max-time 2 http://localhost:3031/health 2>/dev/null; then
        echo "$(date -Is) whatsapp service back up" >> "$LOG"
        break
      fi
      sleep 1
    done
  fi
  sleep 15
done
