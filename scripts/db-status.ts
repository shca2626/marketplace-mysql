/**
 * Vendora — database status (SQLite is the platform provider).
 *
 *   bun run db:status
 *
 * Truth = prisma/schema.prisma `provider` + .env `DATABASE_URL`.
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
  const dbUrl = envVar('DATABASE_URL') ?? ''

  console.log('')
  console.log('  Vendora · database status')
  console.log('  ' + LINE)

  if (schemaProvider !== 'sqlite' || !dbUrl.startsWith('file:')) {
    console.log('  ✖ expected SQLite — check prisma/schema.prisma provider and .env DATABASE_URL')
    console.log(`     provider = "${schemaProvider ?? '?'}", DATABASE_URL = ${dbUrl || '(missing)'}`)
    process.exit(1)
  }

  console.log(`  Active provider : SQLITE (${dbUrl.replace(/^file:/, '')})`)

  // stale dev-server detection (env/schema changed without restart = old client)
  const envMtime = existsSync('.env') ? statSync('.env').mtime : null
  if (envMtime && devServerOlderThan(envMtime)) {
    console.log('')
    console.log('  ⚠ dev server started BEFORE the last .env change —')
    console.log('    it may hold the previous database client.')
    console.log('    Restart it (kill it, then `setsid bun run dev &`) to be sure.')
  }

  // live counts
  const prisma = new PrismaClient()
  try {
    const [users, categories, products, orders, orderItems, reviews, favorites] = await Promise.all([
      prisma.user.count(),
      prisma.category.count(),
      prisma.product.count(),
      prisma.order.count(),
      prisma.orderItem.count(),
      prisma.review.count(),
      prisma.favorite.count(),
    ])
    console.log('')
    console.log('  Live data:')
    console.log(`    ${users} users · ${categories} categories · ${products} products`)
    console.log(`    ${orders} orders (${orderItems} items) · ${reviews} reviews · ${favorites} favorites`)
  } catch (err) {
    console.log(`  ✖ could not query the database: ${err instanceof Error ? err.message : err}`)
  } finally {
    await prisma.$disconnect()
  }

  console.log('')
  console.log('  Ops: bun run db:push · db:seed · db:status')
  console.log('')
}

main()
