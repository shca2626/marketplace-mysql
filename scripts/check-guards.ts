// ─────────────────────────────────────────────────────────────────────────────
// GUARD-LINT v2 (lastplan v5 6.1.3 / C7) — classification-first authorization
// lint over EVERY route entry point.
//
//   bun scripts/check-guards.ts [--init]
//
// CI failure conditions (each fails INDEPENDENTLY):
//   1. an entry point missing from the reviewed classification file
//   2. a local `requireAdmin` shadow definition
//   3. a bare `requireAdmin()` call without a permission key
//   4. a permission key not present in the catalog (rbac-catalog.ts)
//   5. drift between the classification file and the scanned route set
//   6. audit-atomicity drift (6.11): a SENSITIVE action written through the
//      non-transactional recordAudit() path instead of recordAuditTx()
//
// `--init` regenerates the classification scaffold from the scan — the output
// is then REVIEWED by a human and committed as
// `audit/route-classification.json`.
// ─────────────────────────────────────────────────────────────────────────────
import { execSync } from 'child_process'
import { readFileSync, writeFileSync, existsSync, readdirSync, statSync } from 'fs'
import { join, relative } from 'path'

const ROOT = process.cwd()
const CLASSIFICATION = join(ROOT, 'audit/route-classification.json')

type Bucket =
  | 'PUBLIC'
  | 'AUTHENTICATED_USER'
  | 'ORG_SCOPED'
  | 'PLATFORM_PRIVILEGED'
  | 'MANUAL_REVIEW'

interface RouteClass {
  route: string
  bucket: Bucket
  methods: string[]
  permissionKeys?: string[]
  moduleKeys?: string[]
  notes?: string
}

// ── catalog keys ────────────────────────────────────────────────────────────
function catalogKeys(): Set<string> {
  const src = readFileSync(join(ROOT, 'src/lib/rbac-catalog.ts'), 'utf8')
  const keys = new Set<string>()
  const re = /key: '([^']+)'/g
  let m: RegExpExecArray | null
  while ((m = re.exec(src))) {
    if (m[1].includes('.')) keys.add(m[1]) // permission keys are dotted; domain keys are not
  }
  return keys
}

// ── scan helpers ────────────────────────────────────────────────────────────
function scanRoute(file: string): RouteClass {
  const src = readFileSync(file, 'utf8')
  const rel = relative(join(ROOT, 'src/app'), file).replace(/\/route\.ts$/, '')
  const route = '/' + rel.replace(/\((?:[^)]+)\)\//g, '').replace(/\/?index$/, '')

  const methods: string[] = []
  for (const verb of ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS']) {
    if (new RegExp(`export async function ${verb}\\(`).test(src)) methods.push(verb)
  }

  const permissionKeys = new Set<string>()
  const moduleKeys = new Set<string>()
  let hasRequireUser = false
  let hasSessionUser = false
  let hasAdminGuard = false
  let hasModuleGuard = false

  for (const m of src.matchAll(/requireAdmin(?:Any)?\(\s*(?:\[[^\]]*\]|'[^']*'|"[^"]*")?/g)) {
    hasAdminGuard = true
    const keys = m[0].match(/['"]([a-z0-9-]+(?:\.[a-z0-9-]+)+)['"]/g) ?? []
    for (const k of keys) permissionKeys.add(k.slice(1, -1))
  }
  for (const m of src.matchAll(/requireModule\(\s*['"]([^'"]+)['"]/g)) {
    hasModuleGuard = true
    moduleKeys.add(m[1])
  }
  if (/requireUser\(/.test(src)) hasRequireUser = true
  if (/getSessionUser\(|getSessionContext\(/.test(src)) hasSessionUser = true

  // org context detection for module guards
  const orgCtx = /requireModule\([^)]*orgId/.test(src)

  let bucket: Bucket
  if (hasAdminGuard) bucket = 'PLATFORM_PRIVILEGED'
  else if (hasModuleGuard) bucket = orgCtx ? 'ORG_SCOPED' : 'AUTHENTICATED_USER'
  else if (hasRequireUser) bucket = 'AUTHENTICATED_USER'
  else if (hasSessionUser) bucket = 'MANUAL_REVIEW'
  else bucket = 'PUBLIC'

  return {
    route: route === '//' ? '/' : route,
    bucket,
    methods,
    permissionKeys: [...permissionKeys],
    moduleKeys: [...moduleKeys],
  }
}

// ── main ────────────────────────────────────────────────────────────────────
/** Walk the filesystem (not git ls-files): an UNCOMITTED new route is just
 *  as unclassified as a committed one — the guard must catch scratch branches. */
function routeFiles(): string[] {
  const out: string[] = []
  const walk = (dir: string) => {
    for (const entry of readdirSync(dir)) {
      const full = join(dir, entry)
      const st = statSync(full)
      if (st.isDirectory()) walk(full)
      else if (entry === 'route.ts') out.push(relative(ROOT, full))
    }
  }
  walk(join(ROOT, 'src/app'))
  return out
}

// ── audit-atomicity drift (6.11) ─────────────────────────────────────────────
/** Parse the authoritative SENSITIVE_AUDIT_ACTIONS set from the audit service —
 *  the source of truth stays in ONE place; this lint can never go stale. */
function sensitiveAuditActions(): Set<string> {
  const src = readFileSync(join(ROOT, 'src/server/modules/audit/service.ts'), 'utf8')
  const block = src.match(/SENSITIVE_AUDIT_ACTIONS[^=]*=\s*new Set\(\[([\s\S]*?)\]\)/)
  if (!block) throw new Error('check-guards: cannot parse SENSITIVE_AUDIT_ACTIONS from audit/service.ts')
  const set = new Set<string>()
  for (const m of block[1].matchAll(/'([^']+)'/g)) set.add(m[1])
  if (set.size === 0) throw new Error('check-guards: SENSITIVE_AUDIT_ACTIONS parsed empty — refusing to pass a vacuous check')
  return set
}

/** Every TS/TSX file under src/ (route + non-route alike: services, jobs). */
function allSourceFiles(): string[] {
  const out: string[] = []
  const walk = (dir: string) => {
    for (const entry of readdirSync(dir)) {
      const full = join(dir, entry)
      const st = statSync(full)
      if (st.isDirectory()) walk(full)
      else if (/\.(ts|tsx)$/.test(entry)) out.push(relative(ROOT, full))
    }
  }
  walk(join(ROOT, 'src'))
  return out
}

function main() {
  const init = process.argv.includes('--init')
  const files = routeFiles()
  const scanned = new Map<string, RouteClass>()
  const problems: string[] = []

  // Global checks across every scanned file
  const catalog = catalogKeys()

  // 6. audit-atomicity drift (6.11) — scans EVERY source file, not just routes
  const sensitive = sensitiveAuditActions()
  for (const f of allSourceFiles()) {
    const src = readFileSync(join(ROOT, f), 'utf8')
    // `recordAuditTx(` does NOT match this regex (no paren right after).
    for (const m of src.matchAll(/recordAudit\(\s*(?:await\s+)?\{[\s\S]{0,800}?action:\s*'([^']+)'/g)) {
      if (sensitive.has(m[1])) {
        problems.push(
          `AUDIT ATOMICITY DRIFT: ${f} writes sensitive action "${m[1]}" via recordAudit() — ` +
            `sensitive actions MUST use recordAuditTx() inside the business transaction (6.11)`
        )
      }
    }
  }

  for (const f of files) {
    const rc = scanRoute(f)
    scanned.set(rc.route, rc)

    // 2. local shadow definitions
    const src = readFileSync(f, 'utf8')
    if (/async function requireAdmin\b|function requireAdmin\b/.test(src)) {
      problems.push(`LOCAL GUARD SHADOW: ${f} defines its own requireAdmin — import from '@/server/guards' instead`)
    }
    // 3. bare requireAdmin() calls
    if (/requireAdmin\(\s*\)/.test(src)) {
      problems.push(`BARE GUARD CALL: ${f} calls requireAdmin() without a permission key (Phase 6: this THROWS at runtime)`)
    }
    // 4. unknown permission keys
    for (const k of rc.permissionKeys ?? []) {
      if (!catalog.has(k)) problems.push(`UNKNOWN PERMISSION KEY: ${f} uses "${k}" which is not in the rbac catalog`)
    }
  }

  if (init) {
    const list = [...scanned.values()].sort((a, b) => a.route.localeCompare(b.route))
    writeFileSync(CLASSIFICATION, JSON.stringify({ generatedAt: new Date().toISOString(), routes: list }, null, 2) + '\n')
    console.log(`✓ wrote ${list.length} route classification(s) to audit/route-classification.json — REVIEW, then commit`)
    return
  }

  if (!existsSync(CLASSIFICATION)) {
    console.error('✗ audit/route-classification.json missing — run `bun scripts/check-guards.ts --init`, review, commit')
    process.exit(1)
  }

  const declared: RouteClass[] = JSON.parse(readFileSync(CLASSIFICATION, 'utf8')).routes
  const declaredMap = new Map(declared.map((r) => [r.route, r]))
  const scannedRoutes = new Set(scanned.keys())
  const declaredRoutes = new Set(declaredMap.keys())

  // 1. unclassified entry points
  for (const r of scannedRoutes) {
    if (!declaredRoutes.has(r)) problems.push(`UNCLASSIFIED ENTRY POINT: ${r} — add it to audit/route-classification.json`)
  }
  // 5. drift — declared but gone
  for (const r of declaredRoutes) {
    if (!scannedRoutes.has(r)) problems.push(`DRIFT: classification declares ${r} but no such route exists`)
  }
  // bucket/permission drift between declaration and code. A scanned
  // MANUAL_REVIEW is a "review required" state, not a classification — the
  // reviewed declaration (with mandatory notes) is authoritative there.
  for (const r of scannedRoutes) {
    const d = declaredMap.get(r)
    const s = scanned.get(r)!
    if (d && s.bucket !== 'MANUAL_REVIEW' && d.bucket !== s.bucket) {
      problems.push(`DRIFT: ${r} bucket is "${d.bucket}" in the classification but scans as "${s.bucket}"`)
    }
    if (s.bucket === 'MANUAL_REVIEW' && d && !(d.notes ?? '').trim()) {
      problems.push(`MANUAL_REVIEW without justification: ${r} — the classification needs a "notes" entry explaining the authorization model`)
    }
    if (d && (d.permissionKeys ?? []).join() !== (s.permissionKeys ?? []).join()) {
      problems.push(`DRIFT: ${r} permission keys [${(d.permissionKeys ?? []).join(', ')}] ≠ scanned [${(s.permissionKeys ?? []).join(', ')}]`)
    }
  }

  const byBucket: Record<string, number> = {}
  for (const r of scanned.values()) byBucket[r.bucket] = (byBucket[r.bucket] ?? 0) + 1

  console.log(`Guard-lint: ${scanned.size} routes scanned`)
  console.log('  Buckets:', JSON.stringify(byBucket))
  console.log(`  Audit-atomicity: ${sensitive.size} sensitive actions, ${allSourceFiles().length} source files scanned`)
  if (problems.length > 0) {
    console.error(`\n✗ ${problems.length} problem(s):`)
    for (const p of problems) console.error('  - ' + p)
    process.exit(1)
  }
  console.log('✓ zero unclassified, zero shadows, zero bare guards, zero unknown keys, zero drift, zero audit-atomicity drift')
}

main()
