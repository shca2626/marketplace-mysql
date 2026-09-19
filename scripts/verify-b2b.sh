#!/usr/bin/env bash
# B2B foundation golden-path verification (run against the dev server).
set -u
BASE="http://127.0.0.1:3000"
BUYER_JAR=$(mktemp); ADMIN_JAR=$(mktemp)
PASS=0; FAIL=0
ok()   { PASS=$((PASS+1)); echo "PASS: $1"; }
bad()  { FAIL=$((FAIL+1)); echo "FAIL: $1"; }

jqget() { # jqget <json> <filter>
  command -v jq >/dev/null 2>&1 && echo "$1" | jq -r "$2" || echo "$1" | node -e "let d='';process.stdin.on('data',c=>d+=c).on('end',()=>{try{console.log(JSON.stringify(eval('('+'d'+')'))&&(()=>{const f=$2;const v=f.startsWith('.')?eval('d'+f.slice(1)):eval('d'+f);console.log(typeof v==='object'?JSON.stringify(v):v)})()}catch(e){console.log('')}})"
}

echo '── 1. Sessions ──'
curl -s -c "$BUYER_JAR" -H 'Content-Type: application/json' -d '{"email":"demo@vendora.com","password":"demo1234"}' "$BASE/api/auth/login" | grep -q '"user"' && ok "buyer login" || bad "buyer login"
curl -s -c "$ADMIN_JAR" -H 'Content-Type: application/json' -d '{"email":"admin@vendora.com","password":"admin1234"}' "$BASE/api/auth/login" | grep -q '"user"' && ok "admin login" || bad "admin login"

echo '── 2. Organization registration (buyer) ──'
curl -s -b "$BUYER_JAR" "$BASE/api/organizations" | grep -q '"organizations":\[\]' && ok "empty org list" || bad "empty org list"
ORG_JSON=$(curl -s -b "$BUYER_JAR" -H 'Content-Type: application/json' \
  -d '{"name":"Acme Trading Co","legalName":"Acme Trading Company LLC","taxId":"US-98765-43210","industry":"Industrial Supplies","website":"https://acme.example.com"}' \
  "$BASE/api/organizations")
ORG_ID=$(echo "$ORG_JSON" | jq -r '.organization.id // empty')
[ -n "$ORG_ID" ] && ok "org created ($ORG_ID)" || bad "org created: $ORG_JSON"
echo "$ORG_JSON" | jq -r '.organization.status' | grep -q PENDING_VERIFICATION && ok "status PENDING_VERIFICATION" || bad "status"
echo "$ORG_JSON" | jq -r '.organization.myRole' | grep -q OWNER && ok "requester is OWNER" || bad "owner role"

echo '── 3. Admin verifies + credit config ──'
curl -s -b "$ADMIN_JAR" "$BASE/api/admin/organizations" | jq -e '.organizations | length >= 1' >/dev/null && ok "admin org list" || bad "admin org list"
UPD=$(curl -s -b "$ADMIN_JAR" -X PATCH -H 'Content-Type: application/json' \
  -d '{"status":"ACTIVE","creditTermsDays":30,"creditLimit":50000}' \
  "$BASE/api/admin/organizations/$ORG_ID")
echo "$UPD" | jq -r '.organization.status' | grep -q ACTIVE && ok "org verified ACTIVE" || bad "org verify: $UPD"
echo "$UPD" | jq -r '.organization.verifiedAt' | grep -q null && bad "verifiedAt set" || ok "verifiedAt set"

echo '── 4. Customer group + group price list with qty breaks ──'
GRP_JSON=$(curl -s -b "$ADMIN_JAR" -H 'Content-Type: application/json' \
  -d '{"name":"Wholesale Tier 1","priority":10,"key":"wholesale-tier-1"}' "$BASE/api/admin/customer-groups")
GRP_ID=$(echo "$GRP_JSON" | jq -r '.group.id // empty')
[ -n "$GRP_ID" ] && ok "group created ($GRP_ID)" || bad "group created: $GRP_JSON"

PROD_JSON=$(curl -s "$BASE/api/products?limit=2")
P1=$(echo "$PROD_JSON" | jq -r '.items[0].id'); P1P=$(echo "$PROD_JSON" | jq -r '.items[0].price')
P2=$(echo "$PROD_JSON" | jq -r '.items[1].id')
echo "    products: $P1 (retail $P1P), $P2"

PL_JSON=$(curl -s -b "$ADMIN_JAR" -H 'Content-Type: application/json' \
  -d "{\"name\":\"Wholesale Tier 1 — Contract Pricing\",\"scope\":\"GROUP\",\"customerGroupId\":\"$GRP_ID\",\"priority\":10}" \
  "$BASE/api/admin/price-lists")
PL_ID=$(echo "$PL_JSON" | jq -r '.priceList.id // empty')
[ -n "$PL_ID" ] && ok "price list created ($PL_ID)" || bad "price list: $PL_JSON"

ENT=$(curl -s -b "$ADMIN_JAR" -X PUT -H 'Content-Type: application/json' \
  -d "{\"entries\":[{\"productId\":\"$P1\",\"minQuantity\":1,\"unitPrice\":$(echo "$P1P" | awk '{printf "%.2f", $1*0.85}')},{\"productId\":\"$P1\",\"minQuantity\":10,\"unitPrice\":$(echo "$P1P" | awk '{printf "%.2f", $1*0.7}')},{\"productId\":\"$P2\",\"minQuantity\":5,\"unitPrice\":9.99}]}" \
  "$BASE/api/admin/price-lists/$PL_ID/entries")
echo "$ENT" | jq -e '.entries | length == 3' >/dev/null && ok "3 ladder entries saved" || bad "entries: $ENT"

echo '── 5. Map org to group → pricing resolves ──'
curl -s -b "$ADMIN_JAR" -X PATCH -H 'Content-Type: application/json' \
  -d "{\"groupIds\":[\"$GRP_ID\"]}" "$BASE/api/admin/organizations/$ORG_ID" | jq -e '.organization' >/dev/null && ok "org mapped to group" || bad "org group map"

R1=$(curl -s -b "$BUYER_JAR" -H 'Content-Type: application/json' \
  -d "{\"items\":[{\"productId\":\"$P1\",\"quantity\":5},{\"productId\":\"$P2\",\"quantity\":1}]}" \
  "$BASE/api/pricing/resolve")
echo "$R1" | jq -r '.prices[0].source' | grep -q GROUP && ok "P1@5 → GROUP price" || bad "P1@5 resolve: $R1"
R2=$(curl -s -b "$BUYER_JAR" -H 'Content-Type: application/json' \
  -d "{\"items\":[{\"productId\":\"$P1\",\"quantity\":50}]}" "$BASE/api/pricing/resolve")
R2P=$(echo "$R2" | jq -r '.prices[0].unitPrice')
EXP2=$(echo "$P1P" | awk '{printf "%.2f", $1*0.7}')
[ "$R2P" = "$EXP2" ] && ok "P1@50 crossed 10+ break → $R2P (=$EXP2)" || bad "qty break: got $R2P want $EXP2"
R3=$(curl -s -b "$BUYER_JAR" -H 'Content-Type: application/json' \
  -d "{\"items\":[{\"productId\":\"$P2\",\"quantity\":1}]}" "$BASE/api/pricing/resolve")
echo "$R3" | jq -r '.prices[0].source' | grep -q RETAIL && ok "P2@1 → RETAIL (break is 5+)" || bad "P2 retail: $R3"

echo '── 6. ORG contract list outranks group list ──'
PL2=$(curl -s -b "$ADMIN_JAR" -H 'Content-Type: application/json' \
  -d "{\"name\":\"Acme Direct Contract\",\"scope\":\"ORG\",\"organizationId\":\"$ORG_ID\",\"priority\":5}" \
  "$BASE/api/admin/price-lists")
PL2_ID=$(echo "$PL2" | jq -r '.priceList.id // empty')
[ -n "$PL2_ID" ] && ok "org contract list created" || bad "org list: $PL2"
curl -s -b "$ADMIN_JAR" -X PUT -H 'Content-Type: application/json' \
  -d "{\"entries\":[{\"productId\":\"$P1\",\"minQuantity\":1,\"unitPrice\":$(echo "$P1P" | awk '{printf "%.2f", $1*0.5}')}]}" \
  "$BASE/api/admin/price-lists/$PL2_ID/entries" | jq -e '.entries | length == 1' >/dev/null && ok "contract entry saved" || bad "contract entry"
R4=$(curl -s -b "$BUYER_JAR" -H 'Content-Type: application/json' \
  -d "{\"items\":[{\"productId\":\"$P1\",\"quantity\":5}]}" "$BASE/api/pricing/resolve")
echo "$R4" | jq -r '.prices[0].source' | grep -q CONTRACT && ok "P1@5 → CONTRACT beats GROUP" || bad "contract precedence: $R4"
echo "$R4" | jq -r '.prices[0].savingsPercent' | grep -q 50 && ok "savings 50% reported" || bad "savings: $R4"

echo '── 7. RFQ lifecycle: draft → submit → quote → accept ──'
RFQ_JSON=$(curl -s -b "$BUYER_JAR" -H 'Content-Type: application/json' \
  -d "{\"organizationId\":\"$ORG_ID\",\"title\":\"Quarterly supply order\",\"description\":\"Need recurring supply for Q1\",\"lines\":[{\"productId\":\"$P1\",\"quantity\":120,\"targetPrice\":$(echo "$P1P" | awk '{printf "%.2f", $1*0.45}')},{\"productId\":\"$P2\",\"quantity\":25},{\"productName\":\"Custom branded packaging\",\"quantity\":500,\"notes\":\"Two-color print, 300gsm\"}]}" \
  "$BASE/api/rfqs")
RFQ_ID=$(echo "$RFQ_JSON" | jq -r '.rfq.id // empty')
RFQ_NUM=$(echo "$RFQ_JSON" | jq -r '.rfq.number // empty')
[ -n "$RFQ_ID" ] && ok "RFQ created $RFQ_NUM" || bad "rfq create: $RFQ_JSON"
echo "$RFQ_JSON" | jq -r '.rfq.status' | grep -q DRAFT && ok "starts DRAFT" || bad "draft status"

# buyer cannot create a quote
curl -s -b "$BUYER_JAR" -H 'Content-Type: application/json' \
  -d "{\"lines\":[{\"productId\":\"$P1\",\"quantity\":120,\"unitPrice\":1}]}" \
  "$BASE/api/rfqs/$RFQ_ID/quotes" | grep -q '403\|sellers or admins' && ok "buyer cannot quote (403)" || bad "buyer quote guard"

curl -s -b "$BUYER_JAR" -X PATCH -H 'Content-Type: application/json' \
  -d '{"action":"SUBMIT"}' "$BASE/api/rfqs/$RFQ_ID" | jq -r '.rfq.status' | grep -q SUBMITTED && ok "RFQ submitted" || bad "submit"

Q1=$(curl -s -b "$ADMIN_JAR" -H 'Content-Type: application/json' \
  -d "{\"lines\":[{\"productId\":\"$P1\",\"quantity\":120,\"unitPrice\":$(echo "$P1P" | awk '{printf "%.2f", $1*0.42}')},{\"productId\":\"$P2\",\"quantity\":25,\"unitPrice\":8.5}],\"validUntil\":\"2031-01-01T00:00:00.000Z\",\"paymentTerms\":\"NET-30\",\"notes\":\"Volume pricing as discussed\"}" \
  "$BASE/api/rfqs/$RFQ_ID/quotes")
Q1_ID=$(echo "$Q1" | jq -r '.quote.id // empty')
[ -n "$Q1_ID" ] && ok "quote issued ${Q1_NUM:-}$(echo "$Q1" | jq -r '.quote.number')" || bad "quote: $Q1"
echo "$Q1" | jq -r '.quote.paymentTerms' | grep -q NET-30 && ok "NET-30 terms on quote" || bad "terms"

curl -s -b "$BUYER_JAR" "$BASE/api/rfqs/$RFQ_ID" | jq -r '.rfq.status' | grep -q QUOTED && ok "RFQ → QUOTED after quote" || bad "quoted status"
curl -s -b "$BUYER_JAR" "$BASE/api/rfqs/$RFQ_ID" | jq -e '.rfq.quotes | length == 1' >/dev/null && ok "buyer sees the quote" || bad "quote visibility"

Q2=$(curl -s -b "$ADMIN_JAR" -H 'Content-Type: application/json' \
  -d "{\"lines\":[{\"productId\":\"$P1\",\"quantity\":120,\"unitPrice\":$(echo "$P1P" | awk '{printf "%.2f", $1*0.55}')},{\"productId\":\"$P2\",\"quantity\":25,\"unitPrice\":9.2}]}" \
  "$BASE/api/rfqs/$RFQ_ID/quotes")
Q2_ID=$(echo "$Q2" | jq -r '.quote.id // empty')
[ -n "$Q2_ID" ] && ok "second competing quote issued" || bad "quote 2: $Q2"

ACC=$(curl -s -b "$BUYER_JAR" -X POST "$BASE/api/quotes/$Q1_ID/accept")
echo "$ACC" | jq -r '.quote.status' | grep -q ACCEPTED && ok "quote accepted" || bad "accept: $ACC"
echo "$ACC" | jq -r '.rfq.status' | grep -q ACCEPTED && ok "RFQ closed ACCEPTED" || bad "rfq accepted"
SIB=$(curl -s -b "$BUYER_JAR" "$BASE/api/rfqs/$RFQ_ID" | jq -r '.rfq.quotes[] | select(.id=="'$Q2_ID'") | .status')
[ "$SIB" = "DECLINED" ] && ok "competing quote auto-DECLINED" || bad "sibling: $SIB"

echo '── 8. Coupon is now DB-backed ──'
# WELCOME10 is firstOrderOnly → anonymous users are asked to sign in (proves the DB row was found)
curl -s -H 'Content-Type: application/json' -d '{"code":"WELCOME10","subtotal":100}' "$BASE/api/coupons/validate" | grep -q 'Sign in to use this code' && ok "WELCOME10 found in DB (first-order guard works)" || bad "coupon validate"
# demo buyer has prior orders → correctly rejected
REG=$(curl -s -c /tmp/fresh-jar -H 'Content-Type: application/json' -d '{"email":"b2b-verify-'$RANDOM'@example.com","password":"Verify1234!","name":"B2B Verify"}' "$BASE/api/auth/register")
curl -s -b /tmp/fresh-jar -H 'Content-Type: application/json' -d '{"code":"WELCOME10","subtotal":100}' "$BASE/api/coupons/validate" | grep -q '"valid":true' && ok "WELCOME10 validates for fresh user (DB path)" || bad "WELCOME10 fresh user"
CPN=$(curl -s -b "$ADMIN_JAR" -H 'Content-Type: application/json' -d '{"code":"BULK15","description":"15% off bulk","percentOff":15,"minSubtotal":500}' "$BASE/api/admin/coupons")
echo "$CPN" | jq -r '.coupon.code' | grep -q BULK15 && ok "admin created BULK15" || bad "coupon create: $CPN"
curl -s -H 'Content-Type: application/json' -d '{"code":"BULK15","subtotal":600}' "$BASE/api/coupons/validate" | grep -q '"valid":true' && ok "BULK15 validates" || bad "BULK15 validate"

echo '── 9. Audit trail ──'
AUD=$(curl -s -b "$ADMIN_JAR" "$BASE/api/admin/audit-logs?pageSize=50")
echo "$AUD" | jq -r '.logs[].action' | grep -q ORG_VERIFIED && ok "audit: ORG_VERIFIED" || bad "audit org"
echo "$AUD" | jq -r '.logs[].action' | grep -q RFQ_SUBMITTED && ok "audit: RFQ_SUBMITTED" || bad "audit rfq submit"
echo "$AUD" | jq -r '.logs[].action' | grep -q QUOTE_ACCEPTED && ok "audit: QUOTE_ACCEPTED" || bad "audit quote accept"
echo "$AUD" | jq -r '.logs[].action' | grep -q PRICELIST_ENTRIES_REPLACED && ok "audit: PRICELIST_ENTRIES_REPLACED" || bad "audit pricelist"

echo '── 10. Access control ──'
curl -s "$BASE/api/admin/audit-logs" | grep -q '401\|sign in' && ok "audit-logs 401 anonymous" || bad "audit guard anon"
curl -s -b "$BUYER_JAR" "$BASE/api/admin/audit-logs" | grep -q '403\|Admin access' && ok "audit-logs 403 for buyer" || bad "audit guard buyer"
curl -s -b "$BUYER_JAR" "$BASE/api/rfqs/$RFQ_ID" | jq -r '.rfq.number' | grep -q "$RFQ_NUM" && ok "owner reads RFQ detail" || bad "owner rfq read"

echo ""
echo "══════ RESULT: $PASS passed, $FAIL failed ══════"
rm -f "$BUYER_JAR" "$ADMIN_JAR"
[ "$FAIL" -eq 0 ]
