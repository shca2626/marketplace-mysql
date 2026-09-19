#!/bin/bash
# ─────────────────────────────────────────────────────────────────────
# database-runtime-build.sh — prepare the database for a build.
# REV 2 (MySQL): the platform runs EXCLUSIVELY on the MySQL server
# (MariaDB 11.8.6, user-space install). The retired SQLite file
# db/custom.db was deleted — there is no per-build DB copy anymore.
# This script now: (1) ensures the MySQL server is up, (2) pushes the
# Prisma schema to the live `vendora` database.
# ─────────────────────────────────────────────────────────────────────
set -euo pipefail

PROJECT_DIR="${PROJECT_DIR:-/home/z/my-project}"
MYSQL_STARTER="/home/z/mysql/start-mysql.sh"

# 1) Ensure the user-space MySQL server is running
if [ -x "$MYSQL_STARTER" ]; then
    bash "$MYSQL_STARTER"
elif ss -tln 2>/dev/null | grep -q "127.0.0.1:3306"; then
    echo "MySQL already running on 127.0.0.1:3306"
else
    echo "ERROR: MySQL server is not running and no start script found" >&2
    exit 1
fi

# 2) Sync the Prisma schema to the live MySQL database.
# Source the project .env explicitly so a stale inherited DATABASE_URL
# (e.g. the retired SQLite URL) can never shadow the real one.
echo "Pushing Prisma schema to MySQL database 'vendora'..."
(
    cd "$PROJECT_DIR"
    set -a
    [ -f .env ] && . ./.env
    set +a
    bun run db:push
)

echo "✅ MySQL database is ready"
