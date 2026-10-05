// ─────────────────────────────────────────────────────────────────────────────
// WHATSAPP SUITE · Template variables (agent 8-a)
//
// This module stays intentionally dependency-free at its core (pure functions
// + a plain registry) so the admin UI can import TEMPLATE_VARIABLES and
// renderTemplateBody directly on the client. buildUserVars additionally hits
// the database — it therefore imports the Prisma client lazily INSIDE the
// function so a client import of this file never pulls Prisma into the
// browser bundle.
// ─────────────────────────────────────────────────────────────────────────────

export interface TemplateVars {
  [key: string]: string | number | null | undefined
}

/**
 * Replace every `{{key}}` token in a template body with the matching value.
 * Matching is case-insensitive ({{Name}} and {{name}} both resolve to vars.name).
 * Unknown or null/undefined keys keep their original token so typos stay
 * visible in previews instead of silently vanishing. Result is trimmed.
 */
export function renderTemplateBody(body: string, vars: TemplateVars): string {
  const lookup = new Map<string, string>()
  for (const [key, value] of Object.entries(vars)) {
    if (value !== null && value !== undefined) lookup.set(key.toLowerCase(), String(value))
  }
  const rendered = body.replace(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g, (token, key: string) => {
    const value = lookup.get(key.toLowerCase())
    return value === undefined ? token : value
  })
  return rendered.trim()
}

/**
 * Registry of every variable the suite understands. Shared by the admin
 * template editor chips, the live preview and the docs shown to staff.
 * Labels are bilingual (EN · AR) for the Yemen solar marketplace audience.
 */
export const TEMPLATE_VARIABLES: Array<{
  key: string
  label: string
  example: string
  description: string
}> = [
  {
    key: 'name',
    label: 'Customer name · اسم العميل',
    example: 'أحمد محمد',
    description: 'Full name of the recipient (falls back to "customer" when unknown).',
  },
  {
    key: 'phone',
    label: 'Phone · رقم الجوال',
    example: '+967 77 123 4567',
    description: 'WhatsApp number the message is delivered to.',
  },
  {
    key: 'email',
    label: 'Email · البريد الإلكتروني',
    example: 'ahmed@example.com',
    description: 'Account email when the recipient is a registered user.',
  },
  {
    key: 'store',
    label: 'Store name · اسم المتجر',
    example: 'Sun Solar Store',
    description: 'Seller store name — personalizes seller-facing broadcasts.',
  },
  {
    key: 'product',
    label: 'Product · المنتج',
    example: '5kW Hybrid Solar Inverter',
    description: 'Title of the product from their latest order or interests.',
  },
  {
    key: 'order',
    label: 'Order # · رقم الطلب',
    example: 'ORD-10231',
    description: 'Id of the recipient’s most recent order, when one exists.',
  },
  {
    key: 'total',
    label: 'Order total · إجمالي الطلب',
    example: '$1,250.00',
    description: 'Total (USD) of the most recent order.',
  },
  {
    key: 'code',
    label: 'Promo code · كود الخصم',
    example: 'SUN15',
    description: 'Discount code included in marketing messages.',
  },
  {
    key: 'discount',
    label: 'Discount % · نسبة الخصم',
    example: '15',
    description: 'Percentage discount advertised in the campaign.',
  },
  {
    key: 'date',
    label: 'Date · التاريخ',
    example: '05/10/2025',
    description: "Today's date (en-GB) at send time.",
  },
  {
    key: 'time',
    label: 'Time · الوقت',
    example: '14:05',
    description: 'Local time at send time (24h).',
  },
  {
    key: 'link',
    label: 'Link · الرابط',
    example: 'https://vendora.market',
    description: 'Marketplace link to include in the message.',
  },
]

/** Example values for every registry key — used by the admin live preview. */
export function exampleVars(): TemplateVars {
  const vars: TemplateVars = {}
  for (const v of TEMPLATE_VARIABLES) vars[v.key] = v.example
  return vars
}

/**
 * Build the personalization variables for a recipient. Loads the user, their
 * latest order (id + USD total + first product title) and fills date/time,
 * a demo promo code and the marketplace link. Kept deliberately simple.
 */
export async function buildUserVars(userId: string): Promise<TemplateVars> {
  // Lazy import: keeps this module import-safe from client components.
  const { db } = await import('@/lib/db')
  const now = new Date()
  const base: TemplateVars = {
    name: 'customer',
    phone: '',
    email: '',
    store: '',
    product: '',
    order: '',
    total: '',
    code: 'SUN15',
    discount: 15,
    date: now.toLocaleDateString('en-GB'),
    time: now.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }),
    link: 'https://vendora.market',
  }

  try {
    const user = await db.user.findUnique({
      where: { id: userId },
      select: { name: true, phone: true, email: true, storeName: true },
    })
    if (!user) return base

    const lastOrder = await db.order.findFirst({
      where: { buyerId: userId },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        total: true,
        items: { take: 1, select: { title: true } },
      },
    })

    return {
      ...base,
      name: user.name || base.name,
      phone: user.phone ?? '',
      email: user.email ?? '',
      store: user.storeName ?? '',
      product: lastOrder?.items[0]?.title ?? '',
      order: lastOrder?.id ?? '',
      total: lastOrder ? `$${lastOrder.total.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : '',
    }
  } catch (err) {
    console.error('[whatsapp/variables] buildUserVars failed', err)
    return base
  }
}
