/**
 * Vendora — remote MySQL connectivity check (InfinityFree / byet.org MariaDB).
 *
 *   bun run mysql:check          (package.json alias)
 *   bun scripts/mysql-check.ts    (direct — .env is parsed manually as fallback)
 *
 * What it does (logic lives in src/lib/mysql-check.ts, shared with
 * /api/admin/stats?mysql=1):
 *   - builds the endpoint fallback chain: $MYSQL_HOST (only if resolvable —
 *     .env's sql301.infinityfree.com has NO public DNS) → sql301.byet.org →
 *     185.27.134.24
 *   - connects with mysql2 (connectTimeout 12s), reporting WHICH endpoint won
 *   - on auth failure prints the exact MySQL error code + message (access
 *     errors embed the client IP that must be whitelisted in the InfinityFree
 *     Remote MySQL panel)
 *   - on success reports VERSION() (expect MariaDB ~10.x), DATABASE(),
 *     CURRENT_USER(), character_set_server, table count, max_allowed_packet,
 *     wait_timeout
 *
 * Output: console report + db/mysql-check-result.json (for shell-less sessions).
 * Exit codes: 0 = reachable + authenticated, 1 = failure (details in the JSON).
 */
import { writeFile } from 'fs/promises'
import { resolve } from 'path'
import { checkMySqlServer, type MySqlCheckResult } from '../src/lib/mysql-check'

const LINE = '─'.repeat(60)
const RESULT_PATH = resolve(process.cwd(), 'db/mysql-check-result.json')

function fmtBytes(bytes: number): string {
  if (!bytes || bytes <= 0) return String(bytes)
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

function fmtDuration(ms: number): string {
  return ms < 1000 ? `${ms}ms` : `${(ms / 1000).toFixed(1)}s`
}

function report(result: MySqlCheckResult): void {
  console.log('')
  console.log('  Vendora · remote MySQL connectivity check')
  console.log('  ' + LINE)

  // Endpoint chain
  console.log('  Endpoint chain (tried in order):')
  if (result.endpointsTried.length === 0) {
    console.log('    (none — check timed out before any attempt)')
  }
  for (const e of result.endpointsTried) {
    const state =
      e.resolvable === 'skipped' ? 'duplicate — skipped' : e.resolvable ? 'resolves' : 'DOES NOT RESOLVE'
    const outcome = e.connected ? '✓ CONNECTED' : e.error ? `✖ ${e.error.code}` : '✖ unreachable'
    console.log(`    • ${e.host.padEnd(26)} ${state} → ${outcome}`)
    if (e.error) {
      console.log(`        ${e.error.code}${e.error.errno ? ` (errno ${e.error.errno})` : ''}: ${e.error.message}`)
    }
  }
  console.log('')

  if (!result.ok) {
    console.log('  ✖ CHECK FAILED')
    if (result.error) {
      console.log(`    code    : ${result.error.code}${result.error.errno ? ` (errno ${result.error.errno})` : ''}`)
      console.log(`    message : ${result.error.message}`)
      if (result.error.clientIpHint) {
        console.log(`    client IP (whitelist this!): ${result.error.clientIpHint}`)
      }
    }
    if (result.hint) console.log(`    hint    : ${result.hint}`)
    console.log(`  (full details: ${RESULT_PATH})`)
    console.log('')
    return
  }

  console.log(`  ✓ CONNECTED via ${result.endpointUsed} in ${fmtDuration(result.durationMs)}`)
  console.log('  ' + LINE)
  const s = result.server
  if (s) {
    console.log(`    server version      : ${s.version}`)
    console.log(`    database            : ${s.database}`)
    console.log(`    CURRENT_USER()      : ${s.currentUser}`)
    console.log(`    character_set_server: ${s.characterSetServer}`)
  }
  if (result.limits) {
    console.log(`    max_allowed_packet  : ${fmtBytes(result.limits.maxAllowedPacketBytes)} (${result.limits.maxAllowedPacketBytes} bytes)`)
    console.log(`    wait_timeout        : ${result.limits.waitTimeoutSec}s`)
    console.log(`    max_connections     : ${result.limits.maxConnections}`)
  }
  if (typeof result.tableCount === 'number') {
    console.log(`    tables in schema    : ${result.tableCount}${result.tableCount === 0 ? ' (empty — run `bun run mysql:push` to create them)' : ''}`)
  }
  console.log(`  (full details: ${RESULT_PATH})`)
  console.log('')
}

async function main(): Promise<void> {
  const result = await checkMySqlServer({ timeoutMs: 45_000 })

  let writeError: string | undefined
  try {
    await writeFile(RESULT_PATH, JSON.stringify(result, null, 2) + '\n', 'utf8')
  } catch (err) {
    writeError = err instanceof Error ? err.message : String(err)
  }

  report(result)

  if (writeError) {
    console.log(`  ⚠ could not write ${RESULT_PATH}: ${writeError}`)
  }

  process.exit(result.ok ? 0 : 1)
}

main().catch((err) => {
  console.error('mysql-check crashed:', err)
  process.exit(1)
})
