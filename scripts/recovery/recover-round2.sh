#!/bin/bash
# Recovery round 2 — robust re-download with whole-file sha256 verification + retry.
# Continues into install/init/start/secure/push/seed/dev after a GOOD archive.
set -x
cd /home/z/my-project
URL="https://archive.mariadb.org/mariadb-11.8.6/bintar-linux-systemd-x86_64/mariadb-11.8.6-linux-systemd-x86_64.tar.gz"
WANT=9367b26f63a7f4936acf914a987d15f37e2449ef568552b70d3c4ffa48896f8b
TOTAL=433584725
mkdir -p /home/z/mysql-dl && cd /home/z/mysql-dl

ok=0
for round in 1 2 3; do
  echo "=== ROUND $round: downloading 14 segments ==="
  N=14; CHUNK=$((TOTAL/N + 1))
  rm -f part* mariadb-11.8.6-linux-systemd-x86_64.tar.gz
  : > jobs.txt
  for i in $(seq 0 $((N-1))); do
    start=$((i*CHUNK)); end=$((start+CHUNK-1)); [ $end -ge $TOTAL ] && end=$((TOTAL-1))
    echo "$i $start $end" >> jobs.txt
  done
  xargs -a jobs.txt -L1 -P7 bash download-one.sh
  cat $(ls part* | sort) > mariadb-11.8.6-linux-systemd-x86_64.tar.gz
  SZ=$(stat -c%s mariadb-11.8.6-linux-systemd-x86_64.tar.gz)
  SUM=$(sha256sum mariadb-11.8.6-linux-systemd-x86_64.tar.gz | awk '{print $1}')
  echo "ROUND $round SIZE=$SZ SHA256=$SUM"
  if [ "$SUM" = "$WANT" ]; then ok=1; echo "ARCHIVE_VERIFIED"; break; fi
  # size must be exact before a retry makes sense
  if [ "$SZ" != "$TOTAL" ]; then echo "SIZE WRONG — retrying whole batch"; fi
done
if [ "$ok" != "1" ]; then echo "FATAL: 3 rounds failed to produce a verified archive"; exit 1; fi

# ── Extract + init ──
rm -rf /home/z/mysql /home/z/mysql-data /home/z/mysql-tmp
mkdir -p /home/z/mysql /home/z/mysql-data /home/z/mysql-tmp
tar -xzf mariadb-11.8.6-linux-systemd-x86_64.tar.gz -C /home/z/mysql || exit 1
mv /home/z/mysql/mariadb-11.8.6-linux-systemd-x86_64 /home/z/mysql/usr
cp /home/z/my-project/scripts/recovery/my.cnf /home/z/mysql/my.cnf
cp /home/z/my-project/scripts/recovery/start-mysql.sh.txt /home/z/mysql/start-mysql.sh
chmod +x /home/z/mysql/start-mysql.sh
cd /home/z/mysql/usr
export LD_LIBRARY_PATH="/home/z/mysql/usr/lib:/home/z/mysql/usr/lib/x86_64-linux-gnu"
./scripts/mysql_install_db --defaults-file=/home/z/mysql/my.cnf \
  --datadir=/home/z/mysql-data --auth-root-authentication-method=normal --skip-test-db || exit 1

# ── Start + secure ──
bash /home/z/mysql/start-mysql.sh
sleep 4
M="/home/z/mysql/usr/bin/mariadb -u root -pRootMySql_2025 -S /home/z/mysql/mysql.sock"
"/home/z/mysql/usr/bin/mariadb" -u root -S /home/z/mysql/mysql.sock \
  -e "SET PASSWORD FOR 'root'@'localhost' = PASSWORD('RootMySql_2025');"
$M -e "CREATE DATABASE IF NOT EXISTS vendora CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
       CREATE USER IF NOT EXISTS 'vendora'@'127.0.0.1' IDENTIFIED BY 'VendoraDb_2025_Prod';
       CREATE USER IF NOT EXISTS 'vendora'@'localhost' IDENTIFIED BY 'VendoraDb_2025_Prod';
       GRANT ALL PRIVILEGES ON vendora.* TO 'vendora'@'127.0.0.1';
       GRANT ALL PRIVILEGES ON vendora.* TO 'vendora'@'localhost'; FLUSH PRIVILEGES;"
echo "MYSQL_UP"

# ── Fix stale .env (FIN-0: SQLite URL → MySQL) ──
cd /home/z/my-project
if grep -q '^DATABASE_URL=' .env; then
  sed -i 's|^DATABASE_URL=.*|DATABASE_URL="mysql://vendora:VendoraDb_2025_Prod@127.0.0.1:3306/vendora"|' .env
else
  echo 'DATABASE_URL="mysql://vendora:VendoraDb_2025_Prod@127.0.0.1:3306/vendora"' >> .env
fi
grep '^DATABASE_URL=' .env

# ── Schema + seed (32 existing models) ──
bun run db:push || exit 1
bun run db:seed || exit 1
echo "SEED_DONE"

# ── Dev server (double-fork survival pattern) ──
( setsid bun run dev < /dev/null > /home/z/my-project/dev.log 2>&1 & )
echo "RECOVERY_COMPLETE"
