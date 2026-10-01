#!/bin/bash
# Auto-healing dev server warm-up: restarts the server after OOM kills and
# continues warming routes one-by-one until all respond 200. Serial requests
# keep compile pressure low; .next/dev incremental cache persists progress.
cd /home/z/my-project

ROUTES=(
  "/"
  "/funding"
  "/funding/entities/cmuipydpj0002oktan3aec1vw"
  "/funding/entities/cmuipydpl0003oktae1nwpxjg"
  "/funding/entities/cmun4vadl000lnflppm3r97vd"
  "/funding/programs/cmuipydq3001bokta5oej27jg"
  "/how-it-works"
  "/solutions"
  "/solutions/home"
  "/solutions/farm"
  "/solutions/business"
  "/sell"
  "/insights"
  "/insights/how-to-size-a-home-solar-system"
  "/insights/murabaha-vs-conventional-loans"
  "/faq"
  "/legal/terms"
  "/legal/privacy"
  "/market"
)

start_server() {
  nohup bash -c '/home/z/my-project/node_modules/.bin/next dev -p 3000 2>&1 | tee dev.log' > /dev/null 2>&1 &
  disown
  # wait for readiness
  for i in $(seq 1 40); do
    if curl -s -o /dev/null --max-time 2 http://localhost:3000/ 2>/dev/null; then
      # got a response (any code) — ready
      return 0
    fi
    sleep 1
  done
  return 1
}

server_alive() {
  pgrep -f "next dev -p 3000" > /dev/null
}

for route in "${ROUTES[@]}"; do
  for attempt in 1 2 3; do
    if ! server_alive; then
      echo "⟳ server down — starting (route: $route, attempt $attempt)"
      start_server || true
      sleep 3
    fi
    code=$(curl -s -o /dev/null -w "%{http_code}" --max-time 90 "http://localhost:3000$route" 2>/dev/null)
    echo "[$code] $route (attempt $attempt)"
    if [ "$code" = "200" ]; then
      break
    fi
    # server likely died mid-compile — wait for OOM killer to finish, restart
    sleep 5
  done
  sleep 2
done

echo "=== warm-up sweep done ==="
free -m | sed -n 2p
for route in "${ROUTES[@]}"; do
  code=$(curl -s -o /dev/null -w "%{http_code}" --max-time 60 "http://localhost:3000$route" 2>/dev/null)
  echo "[$code] $route"
done
echo "=== verification sweep done ==="
