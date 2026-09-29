import { readFile, writeFile } from 'fs/promises'
import path from 'path'

/**
 * DIGEST PROVIDER-ID SIDECAR STORE (EMAILTRACK-1)
 * ─────────────────────────────────────────────────────────────────────────────
 * Maps digestId → provider message id (the Resend email id returned by the
 * REST API) so the delivery-status endpoint can poll real delivery state
 * (GET /api/notifications/digest?id=<digestId> — see email-tracking.ts).
 *
 * WHY A SIDECAR: NotificationDigest (prisma/schema.prisma) has no metadata /
 * providerId / errorMessage column, and a schema change is OFF THE TABLE right
 * now (the running Prisma client cannot be regenerated in this environment —
 * editing the schema would desync it). So the ids live in a module-level Map
 * persisted best-effort to db/notification-digest-providers.json alongside
 * the SQLite file. Reads hydrate once per process; a missing or corrupt file
 * simply starts empty (tracking is a progressive enhancement, never a
 * blocker for sending). When a schema change becomes possible, promote this
 * to a `providerMessageId` column and delete this module.
 */

const STORE_PATH = path.join(process.cwd(), 'db', 'notification-digest-providers.json')

const byDigestId = new Map<string, string>()
let hydratePromise: Promise<void> | null = null

/** One-time best-effort load of the sidecar into the module-level Map. */
function ensureHydrated(): Promise<void> {
  if (!hydratePromise) {
    hydratePromise = (async () => {
      try {
        const raw = await readFile(STORE_PATH, 'utf8')
        const parsed = JSON.parse(raw) as Record<string, unknown>
        for (const [digestId, messageId] of Object.entries(parsed)) {
          if (typeof messageId === 'string' && messageId) byDigestId.set(digestId, messageId)
        }
      } catch {
        // First run / unreadable or corrupt sidecar — start empty; the next
        // store re-creates the file. Delivery tracking degrades to 'unknown'.
      }
    })()
  }
  return hydratePromise
}

/** Record the provider message id for a stored digest (best-effort persist). */
export async function storeDigestProviderId(digestId: string, messageId: string): Promise<void> {
  await ensureHydrated()
  byDigestId.set(digestId, messageId)
  try {
    await writeFile(
      STORE_PATH,
      `${JSON.stringify(Object.fromEntries(byDigestId), null, 2)}\n`,
      'utf8'
    )
  } catch (err) {
    // Never let tracking break sending — the id stays in the in-memory Map.
    console.error(
      '[digest-provider-store] could not persist provider ids →',
      err instanceof Error ? err.message : err
    )
  }
}

/** Look up the provider message id for a digest (null when never tracked). */
export async function getDigestProviderId(digestId: string): Promise<string | null> {
  await ensureHydrated()
  return byDigestId.get(digestId) ?? null
}
