// Test stub for `next/headers` — resolved via the vitest alias in
// vitest.config.ts. Every `cookies()` call made by route handlers under test
// lands here, backed by one process-global cookie jar that tests control
// through `setSession` / `clearSession` (src/tests/fixtures.ts) or directly
// via the exported `cookieJar`.
//
// Real next/headers requires the Next.js server runtime (async storage etc.)
// and cannot run inside plain node/vitest — this stub gives the exact subset
// of the cookie API the app uses (see src/lib/auth.ts).

type Jar = Map<string, string>

const JAR_KEY = Symbol.for('vendora.test.cookieJar')
const globalWithJar = globalThis as typeof globalThis & { [JAR_KEY]?: Jar }

function getOrCreateJar(): Jar {
  let jar = globalWithJar[JAR_KEY]
  if (!jar) {
    jar = new Map<string, string>()
    globalWithJar[JAR_KEY] = jar
  }
  return jar
}

/** The single cookie jar shared by every module in the test process. */
export const cookieJar: Jar = getOrCreateJar()

export type StubCookie = { name: string; value: string }

/** Options are accepted for signature parity with next/headers and ignored. */
export type StubCookieOptions = Record<string, unknown>

export async function cookies() {
  return {
    get(name: string): StubCookie | undefined {
      const value = cookieJar.get(name)
      return value === undefined ? undefined : { name, value }
    },
    set(name: string, value: string, _options?: StubCookieOptions): void {
      cookieJar.set(name, value)
    },
    delete(name: string): void {
      cookieJar.delete(name)
    },
    has(name: string): boolean {
      return cookieJar.has(name)
    },
    getAll(): StubCookie[] {
      return Array.from(cookieJar.entries(), ([name, value]) => ({ name, value }))
    },
    clear(): void {
      cookieJar.clear()
    },
  }
}

// `headers()` is not used by any route handler under test, but exporting it
// keeps the module drop-in compatible if future app code imports it.
export async function headers() {
  return {
    get(name: string): string | null {
      return null
    },
    has(name: string): boolean {
      return false
    },
    entries(): IterableIterator<[string, string]> {
      return new Map().entries()
    },
  }
}

export type JarType = Jar
