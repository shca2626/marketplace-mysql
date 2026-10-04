'use client'

// ─────────────────────────────────────────────────────────────────────────────
// VAULT MEDIA — client components for private-vault documents (6.6).
//
// Vault documents have NO public URLs (media.url is empty). Previewing one
// requires the authenticated proxy:
//   1. POST /api/documents/:id/access → { url } — a one-time, minutes-TTL,
//      HMAC-signed proxy URL (audited as DOCUMENT_URL_ISSUED),
//   2. GET that URL → bytes (session re-authenticated, access re-authorized,
//      nonce consumed, audited as DOCUMENT_FILE_RETRIEVED).
//
// The fetched bytes become a session-scoped object URL cached per document
// (in-memory Map only — one grant per document per browser session; refresh
// re-issues). The `fallback` prop renders when a document has no retrievable
// media (e.g. a legacy row) or the user lacks access in the current session.
// ─────────────────────────────────────────────────────────────────────────────

import { useCallback, useEffect, useRef, useState } from 'react'
import { FolderLock, Loader2 } from 'lucide-react'
import { cn } from '@/lib/utils'

/** Session cache: documentId → blob object URL (never persisted). */
const objectUrlCache = new Map<string, string>()
/** In-flight loads dedupe concurrent mount bursts (list renders). */
const inflight = new Map<string, Promise<string | null>>()

async function issueProxyUrl(documentId: string): Promise<string | null> {
  try {
    const res = await fetch(`/api/documents/${documentId}/access`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '{}',
    })
    if (!res.ok) return null
    const json = (await res.json().catch(() => null)) as { url?: string } | null
    return json?.url ?? null
  } catch {
    return null
  }
}

/**
 * Load a vault document's bytes as a session object URL (null on failure /
 * no access). Cached per document for the browser session.
 */
export async function loadVaultObjectUrl(documentId: string): Promise<string | null> {
  const cached = objectUrlCache.get(documentId)
  if (cached) return cached
  const pending = inflight.get(documentId)
  if (pending) return pending

  const load = (async () => {
    const proxyUrl = await issueProxyUrl(documentId)
    if (!proxyUrl) return null
    try {
      const res = await fetch(proxyUrl)
      if (!res.ok) return null
      const blob = await res.blob()
      const objectUrl = URL.createObjectURL(blob)
      objectUrlCache.set(documentId, objectUrl)
      return objectUrl
    } catch {
      return null
    }
  })()

  inflight.set(documentId, load)
  try {
    return await load
  } finally {
    inflight.delete(documentId)
  }
}

/** Hook form — re-renders the component when the bytes land. */
export function useVaultMedia(documentId: string | null | undefined): {
  url: string | null
  loading: boolean
  reload: () => void
} {
  const [url, setUrl] = useState<string | null>(() => (documentId ? objectUrlCache.get(documentId) ?? null : null))
  const [loading, setLoading] = useState(false)
  const [nonce, setNonce] = useState(0)
  const mounted = useRef(true)

  useEffect(() => {
    mounted.current = true
    return () => {
      mounted.current = false
    }
  }, [])

  useEffect(() => {
    if (!documentId) return
    let cancelled = false
    const cached = objectUrlCache.get(documentId)
    if (cached) {
      // already loaded this session — no grant needed
      let alive = true
      Promise.resolve().then(() => {
        if (alive && mounted.current) {
          setUrl(cached)
          setLoading(false)
        }
      })
      return () => {
        alive = false
      }
    }
    void (async () => {
      try {
        const loaded = await loadVaultObjectUrl(documentId)
        if (cancelled || !mounted.current) return
        setUrl(loaded)
        setLoading(false)
      } catch {
        if (cancelled || !mounted.current) return
        setUrl(null)
        setLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [documentId, nonce])

  const reload = useCallback(() => setNonce((n) => n + 1), [])
  return { url, loading, reload }
}

/**
 * Thumbnail for a vault document: shimmer while loading, the image once the
 * proxy bytes arrive, the fallback (locked icon) when not retrievable.
 */
export function VaultDocumentThumb({
  documentId,
  alt,
  className,
  fallback,
}: {
  documentId: string
  alt: string
  className?: string
  fallback?: React.ReactNode
}) {
  const { url, loading } = useVaultMedia(documentId)

  if (url) {
    return <img src={url} alt={alt} className={cn('object-cover', className)} loading="lazy" />
  }
  return (
    <span
      className={cn(
        'relative flex shrink-0 items-center justify-center overflow-hidden rounded-lg border bg-muted',
        className
      )}
      aria-label={loading ? 'Loading document preview' : 'Private document'}
    >
      {loading ? (
        <>
          <Loader2 size={16} className="animate-spin text-muted-foreground" />
          <span className="absolute inset-0 animate-pulse bg-gradient-to-r from-transparent via-white/25 to-transparent" />
        </>
      ) : (
        (fallback ?? <FolderLock size={16} className="text-muted-foreground" />)
      )}
    </span>
  )
}

/**
 * Click-to-open view action: fetches (or reuses the cached) object URL and
 * opens it in a new tab. One grant per document per session.
 */
export function vaultOpenAction(documentId: string, onDenied?: () => void): () => void {
  return () => {
    void loadVaultObjectUrl(documentId).then((url) => {
      if (url) window.open(url, '_blank', 'noopener')
      else onDenied?.()
    })
  }
}

/**
 * Large in-dialog preview (verify/reject consoles): loads the bytes through
 * the proxy and shows them contained; a locked panel replaces the old public
 * <img> for rows that cannot be retrieved.
 */
export function VaultPreviewImage({
  documentId,
  documentType,
  className,
}: {
  documentId: string
  documentType: string
  className?: string
}) {
  const { url, loading } = useVaultMedia(documentId)

  if (url) {
    return <img src={url} alt={`${documentType} preview`} className={cn('w-full rounded-xl border object-contain', className)} />
  }
  return (
    <div
      className={cn(
        'flex w-full flex-col items-center justify-center gap-2 rounded-xl border border-dashed bg-muted/40 px-4 py-8',
        className
      )}
    >
      {loading ? (
        <>
          <Loader2 size={20} className="animate-spin text-muted-foreground" />
          <p className="text-[11px] text-muted-foreground">Opening secure preview…</p>
        </>
      ) : (
        <>
          <FolderLock size={20} className="text-muted-foreground" />
          <p className="text-[11px] text-muted-foreground">
            Preview unavailable — use <span className="font-semibold">View</span> to open it through the secure link.
          </p>
        </>
      )}
    </div>
  )
}
