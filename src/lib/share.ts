/**
 * Cross-browser link sharing.
 * Prefers the native Web Share API (mobile share sheet), falls back to
 * clipboard copy (with a legacy execCommand path for older browsers).
 */

export type ShareOutcome = 'shared' | 'copied' | 'dismissed' | 'failed'

export async function shareLink(url: string, title: string, text?: string): Promise<ShareOutcome> {
  // 1) Native share sheet where available (mobile + some desktop browsers)
  if (typeof navigator !== 'undefined' && typeof navigator.share === 'function') {
    try {
      await navigator.share({ title, text, url })
      return 'shared'
    } catch (err) {
      // User closing the share sheet is not an error worth reporting
      if (err instanceof DOMException && err.name === 'AbortError') return 'dismissed'
      // Any other failure falls through to the clipboard path
    }
  }

  // 2) Async clipboard API — raced against a timeout because some embedded
  //    webviews leave writeText() pending forever while a permission prompt
  //    can never be answered; we fall through to the legacy path instead.
  try {
    const timeout = new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error('clipboard-write timed out')), 2500)
    )
    await Promise.race([navigator.clipboard.writeText(url), timeout])
    return 'copied'
  } catch {
    /* fall through */
  }

  // 3) Legacy synchronous fallback (non-secure contexts / older engines)
  try {
    const ta = document.createElement('textarea')
    ta.value = url
    ta.setAttribute('readonly', '')
    ta.style.position = 'fixed'
    ta.style.opacity = '0'
    document.body.appendChild(ta)
    ta.select()
    const ok = document.execCommand('copy')
    document.body.removeChild(ta)
    return ok ? 'copied' : 'failed'
  } catch {
    return 'failed'
  }
}

/** Absolute, shareable URL for the current app location (origin + path + query). */
export function absoluteUrl(pathAndQuery: string): string {
  const origin = typeof window !== 'undefined' ? window.location.origin : 'http://localhost:3000'
  return `${origin}${pathAndQuery.startsWith('/') ? pathAndQuery : `/${pathAndQuery}`}`
}
