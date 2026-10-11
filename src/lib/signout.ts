'use client'

import { useMarketplace } from '@/store/marketplace'

/**
 * TENANT-AUDIT C-1 / H-1 / H-2 / L-1 / M-3 — the one true client-side
 * sign-out path.
 *
 * Why this exists: prior to the tenant audit, each logout call site only
 * revoked the server session and nulled the in-memory user. Everything the
 * browser persisted for that user survived the logout and was inherited by
 * the NEXT user on the same browser (shared office / kiosk machines):
 *
 *   • vendora_chat_token / vendora_chat_name — the support-chat session:
 *     the next user would RE-ENTER the previous user's conversation
 *     (cross-user conversation content — the audit's CRITICAL finding C-1).
 *   • vendora-store (zustand persist) — cart / savedForLater / recentlyViewed:
 *     the next user's FIRST checkout would place the previous user's lines (H-1).
 *   • register-company-draft — the merchant wizard pre-filled the previous
 *     applicant's legal name / registration no. / tax id / contacts (H-2).
 *   • vendora-notifications-seen — dead-weight per-order keys of the
 *     previous user (L-1, opaque ids only — hygiene, not a leak).
 *   • vendora_active_org — the previous user's remembered B2B org. The id is
 *     membership-validated server-side on every read (fail-safe), but the
 *     pre-selection itself is cross-user residue.
 *
 * The fin_org cookie (institution switcher) is cleared SERVER-side by
 * /api/auth/logout (M-3 — see clearWorkspaceCookies in lib/auth.ts).
 *
 * Identity-change hygiene (login as a different user without logout) is
 * handled separately in the auth modal's finish() via clearUserCommerceState.
 */

/** localStorage keys holding the signed-out user's state. */
const USER_SCOPED_LOCAL_KEYS = [
  'vendora_chat_token',
  'vendora_chat_name',
  'register-company-draft',
  'vendora-notifications-seen',
  'vendora_active_org',
] as const

/** Remove every persisted user-scoped key. Safe on the server (no-op). */
export function clearPersistedUserState() {
  if (typeof window === 'undefined') return
  for (const key of USER_SCOPED_LOCAL_KEYS) {
    try {
      window.localStorage.removeItem(key)
    } catch {
      /* private mode — nothing was persisted */
    }
  }
  // TENANT-AUDIT H-2: id-scoped company drafts (register-company-draft:<uid>)
  // — sweep every copy so the next user starts the wizard clean.
  try {
    const scoped = Object.keys(window.localStorage).filter((k) =>
      k.startsWith('register-company-draft:')
    )
    for (const key of scoped) window.localStorage.removeItem(key)
  } catch {
    /* storage unavailable */
  }
}

/**
 * Sign the current user out COMPLETELY: server session revoked (the route
 * also clears the fin_org cookie), in-memory identity dropped, user-scoped
 * commerce state cleared, persisted user state removed. Returns after the
 * server call settles (network failures never block the local cleanup).
 */
export async function signOut(): Promise<void> {
  await fetch('/api/auth/logout', { method: 'POST' }).catch(() => undefined)
  const store = useMarketplace.getState()
  store.setUser(null)
  store.clearUserCommerceState()
  clearPersistedUserState()
  // Remove the persisted slice (cart/saved/recent/currency) from storage so a
  // reload never resurrects the previous user's lines.
  try {
    useMarketplace.persist.clearStorage()
  } catch {
    /* storage unavailable — in-memory state is already clean */
  }
}
