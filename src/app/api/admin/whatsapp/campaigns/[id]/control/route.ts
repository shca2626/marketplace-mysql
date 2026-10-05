import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/server/guards'
import { assertSameOrigin } from '@/lib/http'
import { recordAudit } from '@/server/modules/audit/service'
import { WhatsAppAdminError } from '@/server/modules/whatsapp/admin'
import { campaignControlSchema, controlCampaign } from '@/server/modules/whatsapp/campaigns'

// POST /api/admin/whatsapp/campaigns/[id]/control — pause | resume | cancel.
// Proxied to the mini-service's in-memory run-state switch; the fresh row is
// returned (a pause may take up to one paced send to be reflected).
export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const csrf = assertSameOrigin(req)
  if (csrf) return csrf

  const { user, error } = await requireAdmin('whatsapp.manage')
  if (error) return error
  try {
    const { id } = await ctx.params
    const parsed = campaignControlSchema.safeParse(await req.json())
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message ?? 'Invalid input' },
        { status: 400 }
      )
    }

    const campaign = await controlCampaign(id, parsed.data.action)

    await recordAudit({
      actorId: user.id,
      actorType: 'ADMIN',
      action: 'WHATSAPP_CAMPAIGN_CONTROLLED',
      entityType: 'BulkCampaign',
      entityId: campaign.id,
      summary: `Campaign "${campaign.name}" ${parsed.data.action}d (status: ${campaign.status})`,
      metadata: { action: parsed.data.action },
    })

    return NextResponse.json({ campaign })
  } catch (err) {
    if (err instanceof WhatsAppAdminError) {
      return NextResponse.json({ error: err.message }, { status: err.status })
    }
    console.error('admin whatsapp campaign control error', err)
    return NextResponse.json({ error: 'Failed to control campaign' }, { status: 500 })
  }
}
