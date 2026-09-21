# Disaster recovery — user-space MariaDB (no root, no systemd)

The sandbox host resets `/home/z/*` outside `my-project` (MySQL binaries, datadir
and all DB data are wiped). Git-committed project files survive. Recovery:

1. **Download MariaDB 11.8.6 bintar** (single connection is throttled ~140KB/s;
   `download-one.sh` + the xargs pattern below saturates at ~2MB/s with 7 parallel
   range segments — the archive server supports `Accept-Ranges`):
   ```bash
   mkdir -p /home/z/mysql-dl && cd /home/z/mysql-dl
   URL="https://archive.mariadb.org/mariadb-11.8.6/bintar-linux-systemd-x86_64/mariadb-11.8.6-linux-systemd-x86_64.tar.gz"
   TOTAL=433584725  N=14  CHUNK=$((TOTAL/N + 1))
   : > jobs.txt
   for i in $(seq 0 $((N-1))); do
     start=$((i*CHUNK)); end=$((start+CHUNK-1)); [ $end -ge $TOTAL ] && end=$((TOTAL-1))
     echo "$i $start $end" >> jobs.txt
   done
   xargs -a jobs.txt -L1 -P7 bash download-one.sh
   cat $(ls part* | sort) > mariadb-11.8.6-linux-systemd-x86_64.tar.gz
   sha256sum mariadb-11.8.6-linux-systemd-x86_64.tar.gz
   # expect: 9367b26f63a7f4936acf914a987d15f37e2449ef568552b70d3c4ffa48896f8b
   ```
2. **Extract + init** (see my.cnf in this folder):
   ```bash
   mkdir -p /home/z/mysql /home/z/mysql-data /home/z/mysql-tmp
   tar -xzf mariadb-11.8.6-linux-systemd-x86_64.tar.gz -C /home/z/mysql
   mv /home/z/mysql/mariadb-11.8.6-linux-systemd-x86_64 /home/z/mysql/usr
   cp my.cnf /home/z/mysql/my.cnf
   cd /home/z/mysql/usr
   export LD_LIBRARY_PATH=/home/z/mysql/usr/lib:/home/z/mysql/usr/lib/x86_64-linux-gnu
   ./scripts/mysql_install_db --defaults-file=/home/z/mysql/my.cnf \
     --datadir=/home/z/mysql-data --auth-root-authentication-method=normal --skip-test-db
   ```
3. **Start + secure** (recreate `start-mysql.sh` from `start-mysql.sh.txt` here →
   `/home/z/mysql/start-mysql.sh`, then):
   ```bash
   bash /home/z/mysql/start-mysql.sh
   M="/home/z/mysql/usr/bin/mariadb -u root -S /home/z/mysql/mysql.sock"
   $M -e "SET PASSWORD FOR 'root'@'localhost' = PASSWORD('RootMySql_2025');"
   $M -e "CREATE DATABASE IF NOT EXISTS vendora CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
          CREATE USER IF NOT EXISTS 'vendora'@'127.0.0.1' IDENTIFIED BY 'VendoraDb_2025_Prod';
          CREATE USER IF NOT EXISTS 'vendora'@'localhost' IDENTIFIED BY 'VendoraDb_2025_Prod';
          GRANT ALL PRIVILEGES ON vendora.* TO 'vendora'@'127.0.0.1';
          GRANT ALL PRIVILEGES ON vendora.* TO 'vendora'@'localhost'; FLUSH PRIVILEGES;"
   ```
4. **Restore schema + demo data** (run from /home/z/my-project):
   ```bash
   set -a; . ./.env; set +a        # .env holds the mysql:// DATABASE_URL + AUTH_SECRET
   bun run db:push
   bun run db:seed                 # full-system demo seed (B2C + B2B)
   ```
5. **Start the dev server** (sandbox quirk: background processes only survive
   across tool sessions when double-forked via `( setsid ... & )`):
   ```bash
   ( setsid env DATABASE_URL="mysql://vendora:VendoraDb_2025_Prod@127.0.0.1:3306/vendora" \
       bun run dev < /dev/null > /dev/null 2>&1 & )
   ```
   The inline DATABASE_URL is required: the tool shell injects a stale
   `DATABASE_URL=file:...custom.db` that would otherwise poison Prisma.
