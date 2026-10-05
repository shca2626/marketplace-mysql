// ─────────────────────────────────────────────────────────────────────────────
// ASSERT-NOT-PROD (lastplan v5 6.0b.8 / B1) — fail-closed target guard for
// every test, seed, QA, and destructive script.
//
//  THERE IS NO OVERRIDE FLAG. If a script imports this module and the target
//  looks like production, the process aborts — unconditionally. Production
//  migration and deployment are separate, protected workflows (7.1b/14.x);
//  they never run through a test script.
//
//  Detection = fingerprint match, not just a URL eyeball:
//   • PROD_DB_MARKERS   (env, comma-separated) — substrings that identify the
//     production database URL/host (e.g. the production Aiven service name).
//   • PROD_APP_MARKERS  (env) — production app origins for scripts that take
//     a base URL (E2E suites). Example: "https://vendora.com".
//   • In production runtime builds (NODE_ENV=production) the guard refuses to
//     run QA scripts at all — a deployed server must never execute them.
//
//  The markers live in the environment (never committed), set by the operator
//  when the production environment is provisioned. With no markers configured
//  the guard still blocks NODE_ENV=production and warns loudly.
// ─────────────────────────────────────────────────────────────────────────────

const RESET = '\x1b[0m'
const RED = '\x1b[31m'
const BOLD = '\x1b[1m'

export class ProdTargetError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'ProdTargetError'
  }
}

function parseMarkers(env: string | undefined): string[] {
  return (env ?? '')
    .split(',')
    .map((m) => m.trim())
    .filter(Boolean)
}

function abort(reason: string, detail: string): never {
  console.error(`${RED}${BOLD}╔══════════════════════════════════════════════════════════════╗${RESET}`)
  console.error(`${RED}${BOLD}║  REFUSING TO RUN — PRODUCTION TARGET DETECTED                 ║${RESET}`)
  console.error(`${RED}${BOLD}╚══════════════════════════════════════════════════════════════╝${RESET}`)
  console.error(`${BOLD}Script:${RESET} ${reason}`)
  console.error(`${BOLD}Detail:${RESET} ${detail}`)
  console.error('')
  console.error('This script has NO production mode — there is no --allow-prod flag.')
  console.error('Production migration/deployment run through their own protected')
  console.error('workflow (lastplan v5 7.1b). Fix the target and try again.')
  process.exit(78) // EX_CONFIG
}

/** Guard a database target (reads DATABASE_URL by default). */
export function assertNotProdDatabase(url?: string): void {
  if (process.env.NODE_ENV === 'production') {
    abort('QA/test/seed script', 'NODE_ENV=production — deployed servers never run QA scripts.')
  }
  const target = url ?? process.env.DATABASE_URL ?? ''
  if (!target) {
    console.warn('[assert-not-prod] No DATABASE_URL in the environment — nothing to check.')
    return
  }
  const markers = parseMarkers(process.env.PROD_DB_MARKERS)
  const hit = markers.find((m) => target.includes(m))
  if (hit) {
    abort('Database script', `Target URL matches the production marker "${hit}".`)
  }
  if (markers.length === 0) {
    console.warn(
      '[assert-not-prod] PROD_DB_MARKERS is not configured — the fingerprint check is INACTIVE. ' +
        'Set it (environment/secret store) when the production database is provisioned. ' +
        'See docs/environments.md.'
    )
  }
}

/** Guard an HTTP target (E2E suites taking a base URL). */
export function assertNotProdHttp(base: string): void {
  if (process.env.NODE_ENV === 'production') {
    abort('E2E/test script', 'NODE_ENV=production — deployed servers never run QA scripts.')
  }
  const markers = parseMarkers(process.env.PROD_APP_MARKERS)
  const hit = markers.find((m) => base.includes(m))
  if (hit) {
    abort('HTTP test suite', `Base URL matches the production marker "${hit}".`)
  }
  if (!/^https?:\/\/(localhost|127\.0\.0\.1|\[::1\])(:\d+)?/.test(base) && markers.length === 0) {
    console.warn(
      `[assert-not-prod] Base URL "${base}" is not loopback and PROD_APP_MARKERS is unset — ` +
        'point E2E suites at staging (STAGING_BASE_URL) and configure the markers.'
    )
  }
}

/** Combined guard for scripts that touch both the DB and an app URL. */
export function assertNotProd(opts: { db?: string; http?: string } = {}): void {
  assertNotProdDatabase(opts.db)
  if (opts.http) assertNotProdHttp(opts.http)
}
