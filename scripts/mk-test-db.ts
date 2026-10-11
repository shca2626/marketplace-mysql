// ─────────────────────────────────────────────────────────────────────────────
// One-off: create the isolated `vendora_test` database on the Aiven instance
// (the live defaultdb is NOT touched) so vitest has a scratch MySQL target
// after the sandbox rebuild lost the local MariaDB.
//
//   bun scripts/mk-test-db.ts
// ─────────────────────────────────────────────────────────────────────────────
import { readFileSync } from 'fs'
import mysql from 'mysql2/promise'

function envUrl(): string {
  const env = readFileSync('.env', 'utf8')
  const m = env.match(/^DATABASE_URL=(.+)$/m)
  if (!m) throw new Error('DATABASE_URL missing in .env')
  return m[1].trim()
}

async function main() {
  const base = envUrl()
  if (!base.includes('aivencloud.com')) throw new Error('refusing: .env DATABASE_URL is not the Aiven MySQL')
  const admin = base.replace(/\/defaultdb/, '/defaultdb') // connect to defaultdb as admin
  const conn = await mysql.createConnection(admin)
  const [rows] = await conn.query("SHOW DATABASES LIKE 'vendora_test'")
  if ((rows as unknown[]).length === 0) {
    await conn.query(
      "CREATE DATABASE vendora_test CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci"
    )
    console.log('created vendora_test')
  } else {
    console.log('vendora_test already exists')
  }
  const [tables] = await conn.query(
    "SELECT COUNT(*) AS n FROM information_schema.tables WHERE table_schema='vendora_test'"
  )
  console.log('tables in vendora_test:', (tables as { n: number }[])[0].n)
  await conn.end()
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
