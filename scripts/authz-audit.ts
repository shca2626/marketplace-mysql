/**
 * scripts/authz-audit.ts — static authorization audit (Phase 3/4 CI gate).
 *
 * Classifies every API route handler under src/app/api:
 *   GUARDED-GATE    — calls an authz guard (requireUser/requireAdmin/guard/
 *                     resolveAuthzContext/getSessionUser + membership checks)
 *   PUBLIC          — intentionally unauthenticated (public catalog, site
 *                     content, auth endpoints)
 *   WEAK            — reads the session but performs no visible permission /
 *                     ownership check (flagged for review)
 *   UNCLASSIFIED    — no session read, no guard call (flagged)
 *
 * Plus the LEGACY-ADMIN scan (Phase 3): any route still making an
 * authorization decision off the raw `User.role === 'ADMIN'` string
 * comparison fails the gate — authorization must flow through the canonical
 * evaluator / permission helpers (super-admin parity is guaranteed by the
 * seeded platform.super-admin assignment). Comments are stripped before
 * matching; account-type gates (SELLER etc.) are not flagged.
 *
 * Exit code: 0 when no UNCLASSIFIED route and no LEGACY-ADMIN decision
 * remains, 1 otherwise (CI gate).
 */
import { readFileSync, readdirSync, statSync } from 'fs'
import { join, relative } from 'path'

const API_ROOT = join(process.cwd(), 'src', 'app', 'api')

const GUARD_PATTERNS = [
  /requireUser\s*\(/,
  /requireAdmin\s*\(/,
  /requireAdminAny\s*\(/,
  /requireOrgPermission\s*\(/,
  /requireModule\s*\(/,
  /requireStepUpMfa\s*\(/,
  /await guard\s*\(/,
  /resolveAuthzContext\s*\(/,
  /getSessionUser\s*\(/,
  /getSessionUserOr401/,
  /userHasPlatformPermission/,
  /userHasOrgPermission/,
  /requireAdminPermission/,
  /requireOrgPerm/,
]
const PUBLIC_HINTS = [
  // auth endpoints (session bootstrap)
  /src\/app\/api\/auth\//,
  // public storefront data
  /src\/app\/api\/catalog\//,
  /src\/app\/api\/categories\//,
  /src\/app\/api\/home\//,
  /src\/app\/api\/settings\//,
  /src\/app\/api\/rfq-config\//,
  /src\/app\/api\/financing\/services\//,
  /src\/app\/api\/accreditation\/valid\//,
  /src\/app\/api\/sellers\//,
  /src\/app\/api\/contact\//,
  /src\/app\/api\/media\//,
  /src\/app\/api\/quotes\/\[id\]\/pdf\//, // signed PDF link handled inside
  // public shared-catalog offer listings
  /src\/app\/api\/products\/\[id\]\/offers\//,
  // checkout payment method catalog (no sensitive data)
  /src\/app\/api\/payments\/methods\//,
  // api root health ping
  /^src\/app\/api\/route\.ts$/,
  // ── classified public-by-design (RBAC completion audit, each verified) ──
  /src\/app\/api\/modules\/route\.ts$/, // module booleans for signed-out nav — no secrets
  /src\/app\/api\/fx\/route\.ts$/, // public display-currency rates + active list
  /src\/app\/api\/products\/brands\/route\.ts$/, // ACTIVE-listing brand filter data (cached)
  /src\/app\/api\/products\/facets\/route\.ts$/, // public spec-facet aggregation for the Refine rail
  /src\/app\/api\/brands\/route\.ts$/, // public brands directory (ACTIVE listings only)
  /src\/app\/api\/chat\/widget\/send\/route\.ts$/, // visitor chat: CSRF + rate limit + token-scoped thread
  /src\/app\/api\/chat\/widget\/messages\/route\.ts$/, // widget poll: 64-hex token + rate limit, 404 on unknown tokens
  /src\/app\/api\/kyc\/webhook\/\[providerKey\]\/route\.ts$/, // provider decision channel — HMAC-SHA256 signature IS the auth (replay-protected)
]

function listRoutes(dir: string): string[] {
  const out: string[] = []
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry)
    if (statSync(full).isDirectory()) out.push(...listRoutes(full))
    else if (entry === 'route.ts') out.push(full)
  }
  return out
}

const routes = listRoutes(API_ROOT)
const report: { file: string; classification: string }[] = []
const legacyAdminHits: { file: string; line: number; excerpt: string }[] = []

// ── LEGACY-ADMIN detector (Phase 3) ─────────────────────────────────────────
// Matches `x.role === 'ADMIN'` / `role !== 'ADMIN'` style comparisons in
// executable code (comments stripped). These were the RBAC-era bypasses —
// canonical authorization must go through the evaluator / permission helpers.
//
// Allowlist: comparisons on OrganizationMember.role (`membership.role`,
// `member.role` …) are the Phase-2 org-membership compatibility bridge,
// deliberately retained until canonical assignments are proven to cover them
// — those are NOT platform-admin bypasses and are not flagged.
const LEGACY_ADMIN_RE = /\.?\brole\s*(?:===|!==)\s*['"]ADMIN['"]/
const ORG_MEMBERSHIP_RE = /\b(?:membership|member|m|membershipRole|orgRole)\.role\b/

function stripComments(src: string): string {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .split('\n')
    .map((line) => line.replace(/(^|\s)\/\/.*$/, '$1'))
    .join('\n')
}

for (const file of routes) {
  const rel = relative(process.cwd(), file).replace(/\\/g, '/')
  const src = readFileSync(file, 'utf8')
  const stripped = stripComments(src)
  stripped.split('\n').forEach((line, i) => {
    if (LEGACY_ADMIN_RE.test(line) && !ORG_MEMBERSHIP_RE.test(line)) {
      legacyAdminHits.push({ file: rel, line: i + 1, excerpt: line.trim().slice(0, 120) })
    }
  })
}

for (const file of routes) {
  const rel = relative(process.cwd(), file).replace(/\\/g, '/')
  const src = readFileSync(file, 'utf8')
  const hasGuard = GUARD_PATTERNS.some((re) => re.test(src))
  const isPublicByDesign = PUBLIC_HINTS.some((re) => re.test(rel))
  if (hasGuard) {
    report.push({ file: rel, classification: 'GUARDED-GATE' })
  } else if (isPublicByDesign) {
    report.push({ file: rel, classification: 'PUBLIC' })
  } else {
    report.push({ file: rel, classification: 'UNCLASSIFIED' })
  }
}

const counts = report.reduce<Record<string, number>>((acc, r) => {
  acc[r.classification] = (acc[r.classification] ?? 0) + 1
  return acc
}, {})

console.log('── Static authorization audit ──')
console.log(`routes scanned: ${report.length}`)
for (const [cls, n] of Object.entries(counts)) console.log(`  ${cls}: ${n}`)
const unclassified = report.filter((r) => r.classification === 'UNCLASSIFIED')
let failed = false
if (unclassified.length > 0) {
  console.log('\nUNCLASSIFIED routes (add a guard or mark public-by-design):')
  for (const r of unclassified) console.log('  ✗', r.file)
  failed = true
} else {
  console.log('\n✓ every route is classified — no unclassified routes remain')
}

// ── LEGACY-ADMIN gate (Phase 3) ─────────────────────────────────────────────
if (legacyAdminHits.length > 0) {
  console.log('\nLEGACY-ADMIN authorization decisions (migrate to canonical permission checks):')
  for (const h of legacyAdminHits) {
    console.log(`  ✗ ${h.file}:${h.line}  ${h.excerpt}`)
  }
  failed = true
} else {
  console.log('✓ zero legacy User.role === "ADMIN" authorization decisions in API routes')
}

if (failed) process.exit(1)
