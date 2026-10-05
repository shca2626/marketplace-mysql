#!/bin/bash
# Task 10-a E2E — probe creation phase (financing request → gate → offer → agreement)
# Usage: bash /home/z/my-project/scripts/tmp/e2e-probe.sh create <label>
set -u
BASE=http://localhost:3000
BUYER=/tmp/e2e-buyer.jar
ALAMAL=/tmp/e2e-alamal.jar
ADMIN=/tmp/e2e-admin.jar
KURAIMI=/tmp/e2e-kuraimi.jar
OUT=/tmp/e2e10a
mkdir -p "$OUT"
LABEL="${2:-probe}"

# Al-Amal Home Solar Installment Plan (2 requirements: NAT-ID doc + ADDR doc)
SERVICE=cmuod0ifu0013luhrltxg0vpf
NATID_REQ=cmuod0ify001hluhr9libqnzb
ADDR_REQ=cmuod0ify001jluhrri9062rlo
NATID_DOC=cmuipydz2003doktar477w2xw   # demo user's VERIFIED national ID

api() { # jar method path [data]
  local jar=$1 m=$2 p=$3 d=${4:-}
  if [ -n "$d" ]; then
    curl -s -b "$jar" -c "$jar" -X "$m" "$BASE$p" -H 'Content-Type: application/json' -d "$d"
  else
    curl -s -b "$jar" -c "$jar" -X "$m" "$BASE$p"
  fi
}
code() { # jar method path [data] → status code only
  local jar=$1 m=$2 p=$3 d=${4:-}
  if [ -n "$d" ]; then
    curl -s -o /dev/null -w '%{http_code}' -b "$jar" -X "$m" "$BASE$p" -H 'Content-Type: application/json' -d "$d"
  else
    curl -s -o /dev/null -w '%{http_code}' -b "$jar" -X "$m" "$BASE$p"
  fi
}

login() { # identifier password jar
  curl -s -c "$3" -X POST "$BASE/api/auth/login" -H 'Content-Type: application/json' \
    -d "{\"identifier\":\"$1\",\"password\":\"$2\"}" | head -c 200; echo
}

case "$1" in
login)
  echo "— login demo buyer:"; login demo@vendora.com demo1234 "$BUYER"
  echo "— login alamal admin:"; login alamal.admin@vendora.com financier1234 "$ALAMAL"
  echo "— login qa-admin:"; login qa-admin@vendora.local admin1234 "$ADMIN"
  echo "— login kuraimi admin:"; login kuraimi.admin@vendora.com financier1234 "$KURAIMI"
  ;;
create)
  echo "═══ PROBE $LABEL: create + submit financing request (buyer)"
  REQ=$(api "$BUYER" POST /api/financing/requests "{\"serviceId\":\"$SERVICE\",\"amountRequested\":80000,\"currency\":\"YER\",\"tenorRequestedMonths\":4,\"purpose\":\"E2E probe $LABEL — task 10-a\",\"submit\":true,\"consent\":true,\"answers\":[{\"requirementId\":\"$NATID_REQ\",\"accountDocumentId\":\"$NATID_DOC\"}]}")
  echo "$REQ" | head -c 300; echo
  RID=$(echo "$REQ" | jq -r '.submitted[0].id // .requests[0].id // empty')
  echo "requestId=$RID" | tee "$OUT/$LABEL.ids"
  if [ -z "$RID" ]; then echo "FAIL: no requestId"; exit 1; fi

  echo "═══ gate dossier (admin)"
  api "$ADMIN" GET "/api/admin/financing/gate/$RID" > "$OUT/$LABEL.gate.json"
  jq -r '.request.submissions[] | "\(.id) \(.status) \(.requirement.template.code // "?")"' "$OUT/$LABEL.gate.json"
  SUB_NAT=$(jq -r ".request.submissions[] | select(.requirement.template.code==\"NAT-ID\") | .id" "$OUT/$LABEL.gate.json")
  SUB_ADDR=$(jq -r ".request.submissions[] | select(.requirement.template.code==\"ADDR\") | .id" "$OUT/$LABEL.gate.json")
  echo "verifying $SUB_NAT, waiving $SUB_ADDR"
  api "$ADMIN" POST "/api/admin/financing/submissions/$SUB_NAT" '{"action":"VERIFY","note":"E2E probe verification"}' | jq -c '{id:.submission.id,status:.submission.status,autoForwarded}'
  api "$ADMIN" POST "/api/admin/financing/submissions/$SUB_ADDR" '{"action":"WAIVE","note":"E2E probe — address waived"}' | jq -c '{id:.submission.id,status:.submission.status,autoForwarded}'
  # forward if not auto-forwarded
  ST=$(jq -r '.request.status' "$OUT/$LABEL.gate.json")
  if [ "$ST" != "FORWARDED_TO_FINANCIER" ]; then
    echo "— start review + forward"
    api "$ADMIN" POST "/api/admin/financing/requests/$RID/start-review" '{}' | jq -c '.request.status // .error'
    api "$ADMIN" POST "/api/admin/financing/requests/$RID/forward" '{}' | jq -c '.request.status // .error'
  fi

  echo "═══ create + send offer (alamal) — 4 installments of 100 YER"
  D1=$(date -u -d '95 days ago' +%Y-%m-%dT12:00:00.000Z)
  D2=$(date -u -d '40 days ago' +%Y-%m-%dT12:00:00.000Z)
  D3=$(date -u -d '+5 days' +%Y-%m-%dT12:00:00.000Z)
  D4=$(date -u -d '+40 days' +%Y-%m-%dT12:00:00.000Z)
  OFFER=$(api "$ALAMAL" POST /api/financier/offers "{\"requestId\":\"$RID\",\"amount\":400,\"tenorMonths\":4,\"send\":true,\"installments\":[{\"installmentNo\":1,\"dueDate\":\"$D1\",\"amount\":100},{\"installmentNo\":2,\"dueDate\":\"$D2\",\"amount\":100},{\"installmentNo\":3,\"dueDate\":\"$D3\",\"amount\":100},{\"installmentNo\":4,\"dueDate\":\"$D4\",\"amount\":100}]}")
  echo "$OFFER" | jq -c '{id:.offer.id,status:.offer.status,installments:(.offer.installments|length)}' 
  OID=$(echo "$OFFER" | jq -r '.offer.id')
  if [ -z "$OID" ] || [ "$OID" = "null" ]; then echo "$OFFER" | head -c 400; exit 1; fi

  echo "═══ buyer accepts offer"
  ACC=$(api "$BUYER" POST "/api/financing/requests/$RID/offers/$OID/accept" '{}')
  echo "$ACC" | jq -c '{agreementId:.agreementId,offerStatus:.offer.status}'
  AID=$(echo "$ACC" | jq -r '.agreementId')
  echo "agreementId=$AID" >> "$OUT/$LABEL.ids"
  if [ -z "$AID" ] || [ "$AID" = "null" ]; then echo "FAIL: no agreementId"; exit 1; fi
  echo "═══ PROBE $LABEL READY: request=$RID offer=$OID agreement=$AID"
  ;;
*)
  echo "usage: $0 login | create <label>"
  ;;
esac
