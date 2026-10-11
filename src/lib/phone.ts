// ─────────────────────────────────────────────────────────────────────────────
// Phone utilities — Yemeni mobile validation + E.164 normalization (Phase 3)
// ─────────────────────────────────────────────────────────────────────────────
// Yemeni mobile numbers: 9 local digits starting with 70, 71, 73, 77 or 78.
// The +967 country prefix is NEVER typed by users — the system adds it.
// Canonical storage: "+9677XXXXXXXXX" (E.164).

export const YEMEN_LOCAL_REGEX = /^(70|71|73|77|78)\d{7}$/

export const YEMEN_PREFIXES = ['70', '71', '73', '77', '78'] as const

/**
 * Accepts any user-typed Yemeni mobile form and returns the canonical
 * E.164 string, or null when the number cannot be a Yemeni mobile:
 *   "777555888"     → "+967777555888"
 *   "+967 777 555 888" → "+967777555888"
 *   "00967-777-555-888" → "+967777555888"
 *   "0777 555 888"  → "+967777555888"
 */
export function normalizeYemeniPhone(raw: string): string | null {
  if (!raw) return null
  let s = raw.trim().replace(/[\s\-().]/g, '')
  if (!s) return null
  if (s.startsWith('00967')) s = `+967${s.slice(5)}`
  if (s.startsWith('+967')) s = s.slice(4)
  else if (s.startsWith('967') && s.length === 12) s = s.slice(3)
  else if (s.startsWith('0') && s.length === 10) s = s.slice(1)
  return YEMEN_LOCAL_REGEX.test(s) ? `+967${s}` : null
}

/** True when the input is a valid Yemeni mobile in ANY common format. */
export function isValidYemeniPhone(raw: string): boolean {
  return normalizeYemeniPhone(raw) !== null
}

/**
 * Generic international E.164 normalization (for platform-owned WhatsApp
 * sender numbers — any country, e.g. +966…). Returns "+NNNN…" or null.
 */
export function normalizeE164(raw: string): string | null {
  if (!raw) return null
  let s = raw.trim().replace(/[\s\-().]/g, '')
  if (!s) return null
  if (s.startsWith('00')) s = `+${s.slice(2)}`
  if (!s.startsWith('+')) return null
  if (!/^\+\d{8,15}$/.test(s)) return null
  return s
}

/** "+967777555888" → "777 555 888" (local display, prefix implied). */
export function displayPhoneLocal(e164: string): string {
  if (e164.startsWith('+967')) {
    const l = e164.slice(4)
    return `${l.slice(0, 3)} ${l.slice(3, 6)} ${l.slice(6)}`
  }
  return e164
}

/** "+967777555888" → "+967 777 555 888" */
export function displayPhoneIntl(e164: string): string {
  if (e164.startsWith('+967')) return `+967 ${displayPhoneLocal(e164)}`
  return e164
}

/**
 * Detects whether a sign-in identifier is a phone (digits, spaces, +, dashes)
 * or an email. Returns the normalized identifier: E.164 phone or lowercased
 * email — never both.
 */
export function normalizeIdentifier(
  input: string
): { kind: 'phone'; value: string } | { kind: 'email'; value: string } | null {
  if (!input) return null
  const trimmed = input.trim()
  if (!trimmed) return null
  // Contains an @ anywhere → email
  if (trimmed.includes('@')) {
    const email = trimmed.toLowerCase()
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? { kind: 'email', value: email } : null
  }
  // Digits with optional + / spaces / dashes → phone
  if (/^\+?[\d][\d\s\-()]{6,}$/.test(trimmed)) {
    const phone = normalizeYemeniPhone(trimmed) ?? normalizeE164(trimmed)
    return phone ? { kind: 'phone', value: phone } : null
  }
  return null
}

/** The merchant/dealer taxonomy (owner designation) — shared const. */
export const MERCHANT_TYPES = [
  { value: 'EXCLUSIVE_AGENT', label: 'Exclusive Agent' },
  { value: 'AUTHORIZED_AGENT', label: 'Authorized Agent' },
  { value: 'DISTRIBUTOR', label: 'Distributor' },
  { value: 'WHOLESALER', label: 'Wholesaler' },
  { value: 'RETAILER', label: 'Retailer' },
] as const

export type MerchantType = (typeof MERCHANT_TYPES)[number]['value']

export function merchantTypeLabel(value: string | null | undefined): string | null {
  if (!value) return null
  return MERCHANT_TYPES.find((t) => t.value === value)?.label ?? null
}
