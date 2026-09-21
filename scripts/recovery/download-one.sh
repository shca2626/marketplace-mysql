#!/bin/bash
# args: index start end — downloads one segment (with intra-part resume, 5 tries)
set -u
URL="https://archive.mariadb.org/mariadb-11.8.6/bintar-linux-systemd-x86_64/mariadb-11.8.6-linux-systemd-x86_64.tar.gz"
i=$1 start=$2 end=$3
f="part$(printf '%02d' "$i")"
want=$((end - start + 1))
for try in 1 2 3 4 5; do
  have=0
  [ -f "$f" ] && have=$(stat -c %s "$f")
  if [ "$have" -ge "$want" ]; then echo "part $i done"; exit 0; fi
  if [ "$have" -gt 0 ]; then
    s2=$((start + have))
    curl -s --max-time 550 -r "$s2-$end" -o - "$URL" >> "$f" || true
  else
    curl -s --max-time 550 -r "$start-$end" -o "$f" "$URL" || true
  fi
done
have=0; [ -f "$f" ] && have=$(stat -c %s "$f")
if [ "$have" -ge "$want" ]; then echo "part $i done"; exit 0; fi
echo "PART $i FAILED ($have/$want)" >&2; exit 1
