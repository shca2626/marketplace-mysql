import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireAdmin } from '@/server/guards'

// ─────────────────────────────────────────────────────────────────────────────
// /api/whatsapp/campaigns/[id] — detail (with last 50 message log) + DELETE
// Only DRAFT / COMPLETED / CANCELLED / FAILED campaigns can be deleted.
// ─────────────────────────────────────────────────────────────────────────────

const DELETABLE = new Set(['DRAFT', 'COMPLETED', 'CANCELLED', 'FAILED'])

export async function GET(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { error } = await requireAdmin('storefront.manage')
  if (error) return error
  try {
    const { id } = await ctx.params
    const campaign = await db.bulkCampaign.findUnique({
      where: { id },
      include: { template: { select: { name: true } } },
    })
    if (!campaign) return NextResponse.json({ error: 'Campaign not found' }, { status: 404 })

    const messages = await db.whatsAppMessage.findMany({
      where: { campaignId: id },
      orderBy: { createdAt: 'desc' },
      take: 50,
      select: {
        id: true,
        toNumber: true,
        body: true,
        direction: true,
        status: true,
        error: true,
        sentAt: true,
        createdAt: true,
      },
    })

    return NextResponse.json({
      campaign: {
        id: campaign.id,
        name: campaign.name,
        templateId: campaign.templateId,
        templateName: campaign.template?.name ?? null,
        body: campaign.body,
        audience: campaign.audience,
        status: campaign.status,
        total: campaign.total,
        sent: campaign.sent,
        failed: campaign.failed,
        startedAt: campaign.startedAt,
        finishedAt: campaign.finishedAt,
        createdAt: campaign.createdAt,
      },
      messages,
    })
  } catch (err) {
    console.error('[api/whatsapp/campaigns/[id]] GET failed', err)
    return NextResponse.json({ error: 'Failed to load campaign' }, { status: 500 })
  }
}

export async function DELETE(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { error } = await requireAdmin('storefront.manage')
  if (error) return error
  try {
    const { id } = await ctx.params
    const campaign = await db.bulkCampaign.findUnique({ where: { id }, select: { id: true, status: true } })
    if (!campaign) return NextResponse.json({ error: 'Campaign not found' }, { status: 404 })
    if (!DELETABLE.has(campaign.status)) {
      return NextResponse.json(
        { error: `A ${campaign.status.toLowerCase()} campaign cannot be deleted — wait for it to finish or cancel it first` },
        { status: 400 }
      )
    }
    await db.bulkCampaign.delete({ where: { id } }) // messages cascade SetNull → orphan log rows
    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error('[api/whatsapp/campaigns/[id]] DELETE failed', err)
    return NextResponse.json({ error: 'Failed to delete campaign' }, { status: 500 })
  }
}
