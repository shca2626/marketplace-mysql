/**
 * Vendora — which database is the app using right now?
 *
 *   bun run db:status
 *
 * Truth = prisma/schema.prisma `provider` + .env `APP_DATABASE_URL`.
 * The running dev server picks these up at START — if either changed
 * after the server started, restart it or you're still on the old one.
 */
import { readFileSync, existsSync, statSync } from 'fs'
import { spawnSync } from 'child_process'
import { PrismaClient } from '@prisma/client'

const LINE = '─'.repeat(60)

function envVar(key: string): string | undefined {
  const raw = existsSync('.env') ? readFileSync('.env', 'utf8') : ''
  const m = raw.match(new RegExp(`^${key}="?([^"\\r\\n]*)"?$`, 'm'))
  return m?.[1]
}

function maskUrl(url: string): string {
  return url.replace(/(\/\/[^:/@]+:)[^@]+@/, '$1***@')
}

/** true = running dev server started BEFORE the given date (stale env), null = unknown/not running */
function devServerOlderThan(date: Date): boolean | null {
  try {
    const r = spawnSync('sh', [
      '-c',
      "ps -o etimes= -p \"$(pgrep -f 'next dev' | head -1)\" 2>/dev/null | tr -d ' '",
    ])
    const secs = parseInt(String(r.stdout || '').trim(), 10)
    if (!Number.isFinite(secs) || secs <= 0) return null
    return new Date(Date.now() - secs * 1000) < date
  } catch {
    return null
  }
}

async function main() {
  const schemaRaw = readFileSync('prisma/schema.prisma', 'utf8')
  const schemaProvider = /provider\s*=\s*"(\w+)"/.exec(schemaRaw)?.[1]
  const envProvider = envVar('DB_PROVIDER')
  const appUrl = envVar('APP_DATABASE_URL') ?? ''
  const urlKind = appUrl.split(':')[0] ?? ''

  console.log('')
  console.log('  Vendora · database status')
  console.log('  ' + LINE)

  if (!schemaProvider || !appUrl) {
    console.log('  ✖ could not read provider/url — check prisma/schema.prisma and .env')
    process.exit(1)
  }

  const consistent = schemaProvider === urlKind
  console.log(`  Active provider : ${consistent ? schemaProvider.toUpperCase() : '⚠ CONFLICT'}`)
  console.log(`    · prisma/schema.prisma  → provider = "${schemaProvider}"`)
  console.log(`    · .env APP_DATABASE_URL  → ${maskUrl(appUrl)}`)
  if (envProvider && envProvider !== schemaProvider) {
    console.log(`    · .env DB_PROVIDER=${envProvider} (stale — cosmetic, ignored by the app)`)
  }
  if (!consistent) {
    console.log('')
    console.log('  ✖ schema provider and APP_DATABASE_URL disagree — queries would fail.')
    console.log('    Fix: bun run db:use-mysql  (or db:use-sqlite), then restart the dev server.')
    process.exit(1)
  }

  // stale dev-server detection (flip without restart = still on old DB)
  const envMtime = statSync('.env').mtime
  if (devServerOlderThan(envMtime)) {
    console.log('')
    console.log('  ⚠ dev server started BEFORE the last .env change —')
    console.log('    it may still be on the previous database.')
    console.log('    Restart it (kill it, then `setsid bun run dev &`) to be sure.')
  }

  // live counts on the active database
  const prisma = new PrismaClient()
  try {
    const [users, categories, products, orders, orderItems, reviews, favorites] =
      await Promise.all([
        prisma.user.count(),
        prisma.category.count(),
        prisma.product.count(),
        prisma.order.count(),
        prisma.orderItem.count(),
        prisma.review.count(),
        prisma.favorite.count(),
      ])
    console.log('')
    console.log('  Live data (active database):')
    console.log(`    ${users} users · ${categories} categories · ${products} products`)
    console.log(`    ${orders} orders (${orderItems} items) · ${reviews} reviews · ${favorites} favorites`)
  } catch (err) {
    console.log(`  ✖ could not query the active database: ${err instanceof Error ? err.message : err}`)
  } finally {
    await prisma.$disconnect()
  }

  // inactive sqlite snapshot info
  if (schemaProvider === 'mysql' && existsSync('db/custom.db')) {
    const st = statSync('db/custom.db')
    const when = st.mtime.toISOString().replace('T', ' ').slice(0, 16)
    console.log('')
    console.log(`  SQLite snapshot (NOT active): db/custom.db — ${(st.size / 1024).toFixed(0)} KB, frozen ${when} UTC`)
    console.log('    data created after that moment lives in MySQL only — use for rollback, not development.')
  }

  console.log('')
  console.log('  Flip:  bun run db:use-mysql  |  bun run db:use-sqlite   (then restart dev server)')
  console.log('  Check: bun run mysql:check   (Aiven connectivity + latency)')
  console.log('')
}

main()
