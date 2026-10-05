/**
 * One-off: mirror every local file under ./uploads into the InfinityFree
 * hosting storage (/htdocs/storage) so ALL media — not just new uploads —
 * lives on the hosting. Paths are preserved (e.g. 2026/09/abc.thumb.webp).
 * Idempotent: re-running re-uploads (cheap, 44 small files).
 */
import { Client } from 'basic-ftp'
import { readdirSync, statSync, readFileSync } from 'node:fs'
import { join, relative, sep } from 'node:path'
import { assertNotProd } from './lib/assert-not-prod'

function envFromFile(key: string): string | undefined {
  // NOTE: empty string counts as unset (the host shell injects empty vars).
  const v = process.env[key]
  if (v && v.trim() !== '') return v.trim()
  try {
    const raw = readFileSync('.env', 'utf8')
    const m = raw.match(new RegExp(`^${key}="?([^"\\r\\n]*)"?$`, 'm'))
    const fromFile = m?.[1]?.trim()
    return fromFile && fromFile !== '' ? fromFile : undefined
  } catch {
    return undefined
  }
}

const HOST = envFromFile('FTP_HOST') ?? 'ftpupload.net'
const USER = envFromFile('FTP_USER') ?? 'if0_43035558'
const PASS = envFromFile('FTP_PASS') ?? envFromFile('MYSQL_PASSWORD') ?? ''
const REMOTE_DIR = envFromFile('FTP_REMOTE_DIR') ?? '/htdocs/storage'
const PUBLIC_BASE = (envFromFile('STORAGE_PUBLIC_BASE') ?? 'https://yusr.site.je/storage').replace(/\/$/, '')

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry)
    if (statSync(full).isDirectory()) walk(full, out)
    else out.push(full)
  }
  return out.filter((f) => (process.argv.includes('--png-only') ? f.endsWith('.png') : true))
}

async function main() {
assertNotProd() // Phase 6 (6.0b.8/B1): fail-closed — no production mode, ever
  const files = walk('uploads')
  console.log(`Mirroring ${files.length} local file(s) → ${REMOTE_DIR}`)
  if (!PASS) { console.error('✗ no FTP password resolved'); process.exit(1) }

  const client = new Client(30_000)
  client.ftp.verbose = false
  await client.access({ host: HOST, port: 21, user: USER, password: PASS, secure: false })

  let ok = 0
  const failed: string[] = []
  const ensuredDirs = new Set<string>()
  for (const f of files) {
    const rel = relative('uploads', f).split(sep).join('/')
    try {
      const dir = `${REMOTE_DIR}/${rel.slice(0, rel.lastIndexOf('/'))}`
      if (!ensuredDirs.has(dir)) {
        await client.ensureDir(dir) // absolute — creates all missing segments
        ensuredDirs.add(dir)
      }
      await client.uploadFrom(f, `${REMOTE_DIR}/${rel}`)
      ok++
      console.log(`  ✓ ${rel}`)
    } catch (e) {
      failed.push(rel)
      console.log(`  ✗ ${rel} — ${(e as Error).message}`)
    }
  }
  client.close()

  console.log('─'.repeat(50))
  console.log(`Done: ${ok}/${files.length} uploaded. Public base: ${PUBLIC_BASE}`)
  if (failed.length) { console.log('Failed:', failed); process.exit(1) }
}

main().catch((e) => { console.error('FATAL', e); process.exit(1) })
