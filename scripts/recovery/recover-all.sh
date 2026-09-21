#!/bin/bash
# Full user-space MariaDB recovery (see scripts/recovery/README.md)
# Runs detached; logs to /home/z/my-project/mysql-recovery.log
set -x
cd /home/z/my-project

# 1) Parallel download (7 range segments)
mkdir -p /home/z/mysql-dl && cd /home/z/mysql-dl
URL="https://archive.mariadb.org/mariadb-11.8.6/bintar-linux-systemd-x86_64/mariadb-11.8.6-linux-systemd-x86_64.tar.gz"
TOTAL=433584725  N=14  CHUNK=$((TOTAL/N + 1))
: > jobs.txt
for i in $(seq 0 $((N-1))); do
  start=$((i*CHUNK)); end=$((start+CHUNK-1)); [ $end -ge $TOTAL ] && end=$((TOTAL-1))
  echo "$i $start $end" >> jobs.txt
done
cp /home/z/my-project/scripts/recovery/download-one.sh .
xargs -a jobs.txt -L1 -P7 bash download-one.sh
cat $(ls part* | sort) > mariadb-11.8.6-linux-systemd-x86_64.tar.gz
SUM=$(sha256sum mariadb-11.8.6-linux-systemd-x86_64.tar.gz | awk '{print $1}')
echo "SHA256=$SUM"
if [ "$SUM" != "9367b26f63a7f4936acf914a987d15f37e2449ef568552b70d3c4ffa48896f8b" ]; then
  echo "FATAL: checksum mismatch"; exit 1
fi

# 2) Extract + init
rm -rf /home/z/mysql /home/z/mysql-data /home/z/mysql-tmp
mkdir -p /home/z/mysql /home/z/mysql-data /home/z/mysql-tmp
tar -xzf mariadb-11.8.6-linux-systemd-x86_64.tar.gz -C /home/z/mysql
mv /home/z/mysql/mariadb-11.8.6-linux-systemd-x86_64 /home/z/mysql/usr
cp /home/z/my-project/scripts/recovery/my.cnf /home/z/mysql/my.cnf
cp /home/z/my-project/scripts/recovery/start-mysql.sh.txt /home/z/mysql/start-mysql.sh
chmod +x /home/z/mysql/start-mysql.sh
cd /home/z/mysql/usr
export LD_LIBRARY_PATH=/home/z/mysql/usr/lib:/home/z/mysql/usr/lib/x86_64-linux-gnu
./scripts/mysql_install_db --defaults-file=/home/z/mysql/my.cnf \
  --datadir=/home/z/mysql-data --auth-root-authentication-method=normal --skip-test-db || exit 1

# 3) Start + secure
bash /home/z/mysql/start-mysql.sh
sleep 4
M="/home/z/mysql/usr/bin/mariadb -u root -S /home/z/mysql/mysql.sock"
$M -e "SET PASSWORD FOR 'root'@'localhost' = PASSWORD('RootMySql_2025');"
$M -e "CREATE DATABASE IF NOT EXISTS vendora CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
       CREATE USER IF NOT EXISTS 'vendora'@'127.0.0.1' IDENTIFIED BY 'VendoraDb_2025_Prod';
       CREATE USER IF NOT EXISTS 'vendora'@'localhost' IDENTIFIED BY 'VendoraDb_2025_Prod';
       GRANT ALL PRIVILEGES ON vendora.* TO 'vendora'@'127.0.0.1';
       GRANT ALL PRIVILEGES ON vendora.* TO 'vendora'@'localhost'; FLUSH PRIVILEGES;"
echo "MYSQL_UP"

# 4) Schema + seed
cd /home/z/my-project
env DATABASE_URL="mysql://vendora:VendoraDb_2025_Prod@127.0.0.1:3306/vendora" bun run db:push || exit 1
env DATABASE_URL="mysql://vendora:VendoraDb_2025_Prod@127.0.0.1:3306/vendora" bun run db:seed || exit 1
echo "SEED_DONE"

# 5) Dev server (double-fork so it survives this script exiting)
( setsid env DATABASE_URL="mysql://vendora:VendoraDb_2025_Prod@127.0.0.1:3306/vendora" \
    bun run dev < /dev/null > /home/z/my-project/dev.log 2>&1 & )
echo "RECOVERY_COMPLETE"
