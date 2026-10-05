#!/bin/bash
# Dev-server watchdog: restarts the Next dev server whenever it dies (kernel
# OOM killer during route-compile spikes, or the silent mid-task deaths seen
# through Phases 3-4). The 4GB container cannot hold the full Turbopack dev
# graph resident while the market SPA hydrates — so we self-heal instead of
# fighting it. Logs every restart to dev-watchdog.log.
#
# Task 4-VERIFY: launch line now strips the sandbox DATABASE_URL shell var
# (it overrides the .env Aiven URL) and caps the V8 heap at 1536MB (matches
# the 1024MB Turbopack cache limit in next.config.ts — kernel OOM-kills were
# reaping next-server at ~1.7GB RSS under parallel QA browser load).
cd /home/z/my-project
LOG=dev-watchdog.log
echo "$(date -Is) watchdog started" >> "$LOG"
while true; do
  if ! pgrep -f "next dev -p 3000" > /dev/null; then
    echo "$(date -Is) server down — restarting" >> "$LOG"
    nohup env -u DATABASE_URL NODE_OPTIONS="--max-old-space-size=1536" bash -c '/home/z/my-project/node_modules/.bin/next dev -p 3000 2>&1 | tee dev.log' > /dev/null 2>&1 &
    disown
    # wait for readiness (up to 90s)
    for i in $(seq 1 90); do
      if curl -s -o /dev/null --max-time 2 http://localhost:3000/ 2>/dev/null; then
        echo "$(date -Is) server back up" >> "$LOG"
        break
      fi
      sleep 1
    done
  fi
  sleep 10
done
