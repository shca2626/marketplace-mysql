// ─────────────────────────────────────────────────────────────────────────────
// WA-CHAT — the {{variable}} system (canonical, wa-chat-0 contract).
//
// ONE rendering rule everywhere (Next side here + the local copy inside the
// Baileys mini-service, which cannot import src/):
//   • SYSTEM variables auto-resolve per recipient from the DB user record by
//     phone (name/first_name/store_name/phone/email/role) or at send time
//     (date/time/app).
//   • CUSTOM variables come from the campaign's variables JSON map — any
//     {{token}} NOT in the system list resolves from it.
//   • Unknown variables are REMOVED (a raw {{placeholder}} must NEVER reach a
//     customer — that was the original bug), then doubled spaces collapse.
// ─────────────────────────────────────────────────────────────────────────────

export interface SystemVariable {
  key: string
  label: string
  description: string
}

/** The 9 auto-resolved variables — labels/descriptions feed the admin editor pickers. */
export const SYSTEM_VARIABLES: SystemVariable[] = [
  {
    key: 'name',
    label: 'الاسم الكامل',
    description: "Recipient's full account name (falls back to عميلنا العزيز when there is no account)",
  },
  {
    key: 'first_name',
    label: 'الاسم الأول',
    description: 'First word of the account name (same fallback as name)',
  },
  {
    key: 'store_name',
    label: 'اسم المتجر',
    description: 'Store name for sellers — falls back to the account name',
  },
  {
    key: 'phone',
    label: 'رقم الهاتف',
    description: "Recipient's phone in E.164 (+967…)",
  },
  {
    key: 'email',
    label: 'البريد الإلكتروني',
    description: "Recipient's email (— when the account has none)",
  },
  {
    key: 'role',
    label: 'الدور',
    description: 'Buyer / Seller / Admin',
  },
  {
    key: 'date',
    label: 'التاريخ',
    description: "Send-time date, e.g. '5 Oct 2026' (en-GB)",
  },
  {
    key: 'time',
    label: 'الوقت',
    description: "Send-time time, e.g. '10:30 PM'",
  },
  {
    key: 'app',
    label: 'اسم المنصة',
    description: "Always 'Vendora'",
  },
]

export const SYSTEM_VARIABLE_KEYS: ReadonlySet<string> = new Set(SYSTEM_VARIABLES.map((v) => v.key))

/** The minimal user shape buildUserContext needs — decoupled from Prisma types. */
export interface VariableUser {
  name: string
  email: string | null
  phone: string | null
  role: string
  storeName: string | null
}

/** Values for every {{system variable}}, resolved for one recipient. */
export type VariableContext = Record<string, string>

const ROLE_LABELS: Record<string, string> = {
  BUYER: 'Buyer',
  SELLER: 'Seller',
  ADMIN: 'Admin',
}

const GUEST_NAME = 'عميلنا العزيز'

/**
 * Builds the system-variable context for a recipient. `user` is the DB account
 * found by phone (null for non-account numbers); `phone` is the E.164 the
 * message goes to (used when the account has no phone on file — it always
 * does in practice, but the parameter makes the fallback explicit).
 * date/time are evaluated NOW — this function runs at send time only.
 */
export function buildUserContext(user: VariableUser | null, phone: string): VariableContext {
  const now = new Date()
  const name = user?.name?.trim() || GUEST_NAME
  return {
    name,
    first_name: name.split(/\s+/)[0] ?? GUEST_NAME,
    store_name: user?.storeName?.trim() || name,
    phone: user?.phone?.trim() || phone,
    email: user?.email?.trim() || '—',
    role: ROLE_LABELS[user?.role ?? ''] ?? 'Customer',
    date: now.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }),
    time: now.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true }),
    app: 'Vendora',
  }
}

/**
 * Renders {{variables}} in a message body:
 *   • system variables from `ctx`
 *   • anything else from `custom` (campaign variables map)
 *   • unknown variables are REMOVED — never sent raw
 * Doubled spaces collapse afterwards, and stray edges are trimmed.
 */
export function renderBody(
  body: string,
  ctx: VariableContext,
  custom?: Record<string, string> | null
): string {
  const rendered = body.replace(/\{\{\s*([a-zA-Z_][a-zA-Z0-9_]*)\s*\}\}/g, (_raw, key: string) => {
    if (SYSTEM_VARIABLE_KEYS.has(key)) return ctx[key] ?? ''
    if (custom && Object.prototype.hasOwnProperty.call(custom, key)) return custom[key] ?? ''
    return '' // unknown variable → removed, never raw
  })
  return rendered.replace(/ {2,}/g, ' ').trim()
}

/** Every {{token}} in the body that is NOT a system variable (the custom set). */
export function extractVars(body: string): string[] {
  const seen = new Set<string>()
  for (const match of body.matchAll(/\{\{\s*([a-zA-Z_][a-zA-Z0-9_]*)\s*\}\}/g)) {
    if (!SYSTEM_VARIABLE_KEYS.has(match[1])) seen.add(match[1])
  }
  return [...seen]
}
