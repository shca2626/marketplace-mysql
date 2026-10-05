import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { db } from '@/lib/db'
import { requireAdmin } from '@/server/guards'
import { normalizePhone } from '@/server/modules/whatsapp/send'

// ─────────────────────────────────────────────────────────────────────────────
// /api/whatsapp/campaigns — bulk broadcast list + create
//   GET  — campaigns with template name + counts
//   POST — create a DRAFT campaign: snapshot the body (template or raw text),
//          resolve the audience to a phone list, store total + phones JSON.
// ─────────────────────────────────────────────────────────────────────────────

const AUDIENCES = ['ALL_USERS', 'BUYERS', 'SELLERS', 'CUSTOM'] as const

const createSchema = z.object({
  name: z.string().trim().min(1, 'Name is required').max(120),
  templateId: z.string().trim().min(1).optional().nullable(),
  body: z.string().min(1).max(2000).optional(),
  audience: z.enum(AUDIENCES),
  phones: z.array(z.string().trim().min(1)).optional(),
})

/** Resolve an audience into a deduplicated, normalized phone list. */
async function resolveAudiencePhones(
  audience: (typeof AUDIENCES)[number],
  customPhones: string[]
): Promise<string[]> {
  if (audience === 'CUSTOM') {
    const set = new Set<string>()
    for (const raw of customPhones) {
      const p = normalizePhone(raw)
      if (p) set.add(p)
    }
    return [...set]
  }
  const where =
    audience === 'BUYERS'
      ? { phone: { not: null }, role: 'BUYER' }
      : audience === 'SELLERS'
        ? { phone: { not: null }, role: 'SELLER' }
        : { phone: { not: null } }
  const users = await db.user.findMany({ where, select: { phone: true } })
  const set = new Set<string>()
  for (const u of users) {
    const p = normalizePhone(u.phone ?? '')
    if (p) set.add(p)
  }
  return [...set]
}

function campaignRow(c: {
  id: string
  name: string
  templateId: string | null
  body: string
  audience: string
  status: string
  total: number
  sent: number
  failed: number
  startedAt: Date | null
  finishedAt: Date | null
  createdAt: Date
  template?: { name: string } | null
}) {
  return {
    id: c.id,
    name: c.name,
    templateId: c.templateId,
    templateName: c.template?.name ?? null,
    body: c.body,
    audience: c.audience,
    status: c.status,
    total: c.total,
    sent: c.sent,
    failed: c.failed,
    startedAt: c.startedAt,
    finishedAt: c.finishedAt,
    createdAt: c.createdAt,
  }
}

export async function GET() {
  const { error } = await requireAdmin('storefront.manage')
  if (error) return error
  try {
    const campaigns = await db.bulkCampaign.findMany({
      orderBy: { createdAt: 'desc' },
      include: { template: { select: { name: true } } },
      take: 100,
    })
    return NextResponse.json({ campaigns: campaigns.map(campaignRow) })
  } catch (err) {
    console.error('[api/whatsapp/campaigns] GET failed', err)
    return NextResponse.json({ error: 'Failed to load campaigns' }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  const { user, error } = await requireAdmin('storefront.manage')
  if (error) return error
  try {
    const parsed = createSchema.safeParse(await req.json())
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'Invalid campaign' }, { status: 400 })
    }
    const { name, templateId, audience } = parsed.data

    // Resolve the message body — either a template snapshot or raw text.
    let body = parsed.data.body
    if (templateId) {
      const template = await db.whatsAppTemplate.findUnique({ where: { id: templateId } })
      if (!template) return NextResponse.json({ error: 'Template not found' }, { status: 404 })
      body = template.body
    }
    if (!body || !body.trim()) {
      return NextResponse.json(
        { error: 'Pick a template or write a message body first' },
        { status: 400 }
      )
    }

    // Resolve the audience into a concrete phone list.
    const customPhones = parsed.data.phones ?? []
    if (audience === 'CUSTOM' && customPhones.filter((p) => p.trim()).length === 0) {
      return NextResponse.json({ error: 'Custom audience needs at least one phone number' }, { status: 400 })
    }
    const phones = await resolveAudiencePhones(audience, customPhones)

    const campaign = await db.bulkCampaign.create({
      data: {
        name,
        templateId: templateId ?? null,
        body,
        audience,
        phones: JSON.stringify(phones),
        status: 'DRAFT',
        total: phones.length,
        createdById: user.id,
      },
      include: { template: { select: { name: true } } },
    })
    return NextResponse.json({ campaign: campaignRow(campaign) }, { status: 201 })
  } catch (err) {
    console.error('[api/whatsapp/campaigns] POST failed', err)
    return NextResponse.json({ error: 'Failed to create campaign' }, { status: 500 })
  }
}
