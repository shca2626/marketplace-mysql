#!/bin/bash
# 12-b regression: exact search, category/price/sort filters, page 200s, facet cache timing
B=http://localhost:3000
echo "== pages =="
echo "home: $(curl -s -o /dev/null -w '%{http_code}' -m 15 $B/)"
echo "market/catalog: $(curl -s -o /dev/null -w '%{http_code}' -m 15 '$B/market?view=catalog')"
echo "market/brands: $(curl -s -o /dev/null -w '%{http_code}' -m 15 '$B/market?view=brands')"
echo "== category + price + sort =="
curl -s -m 15 "$B/api/products?category=solar-panels&min=100&max=500&sort=price-asc&limit=24" | bun -e "
const j = await Bun.stdin.json()
const titles = (j.items ?? []).map(i => i.title + ' \$' + i.price)
console.log('min100-max500 price-asc:', j.total, '|', titles.slice(0,3).join(' / '))
"
curl -s -m 15 "$B/api/products?category=batteries-storage&sort=popular&limit=6" | bun -e "
const j = await Bun.stdin.json()
console.log('batteries popular:', j.total, '| first:', (j.items ?? [])[0]?.title, 'sold:', (j.items ?? [])[0]?.soldCount)
"
echo "== facet cache timing (2nd call should be fast + identical) =="
t0=$(date +%s%N); c1=$(curl -s -m 15 "$B/api/products/facets?category=solar-panels" | md5sum | cut -d' ' -f1); t1=$(date +%s%N)
t2=$(date +%s%N); c2=$(curl -s -m 15 "$B/api/products/facets?category=solar-panels" | md5sum | cut -d' ' -f1); t3=$(date +%s%N)
echo "call1 $(( (t1-t0)/1000000 ))ms  call2 $(( (t3-t2)/1000000 ))ms  identical=$([ "$c1" = "$c2" ] && echo true || echo false)"
t4=$(date +%s%N); b1=$(curl -s -m 15 "$B/api/brands" | md5sum | cut -d' ' -f1); t5=$(date +%s%N)
t6=$(date +%s%N); b2=$(curl -s -m 15 "$B/api/brands" | md5sum | cut -d' ' -f1); t7=$(date +%s%N)
echo "brands call1 $(( (t5-t4)/1000000 ))ms  call2 $(( (t7-t6)/1000000 ))ms  identical=$([ "$b1" = "$b2" ] && echo true || echo false)"
echo "== spec path + sort + pagination combined =="
curl -s -m 15 "$B/api/products?category=solar-panels&spec=Cell%20type%3A%3ACIGS%20thin%20film&sort=price-desc&limit=1&page=1" | bun -e "
const j = await Bun.stdin.json()
console.log('CIGS limit=1:', j.total, 'pages:', j.pages, 'items:', (j.items ?? []).length, (j.items ?? [])[0]?.title)
"
