import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/server/guards'
import { assertSameOrigin } from '@/lib/http'
import { recordAudit } from '@/server/modules/audit/service'
import { WhatsAppAdminError } from '@/server/modules/whatsapp/admin'
import { startCampaign } from '@/server/modules/whatsapp/campaigns'

// POST /api/admin/whatsapp/campaigns/[id]/start — DRAFT→QUEUED, then the
// mini-service takes over (QUEUED→SENDING, paced loop, live sent/failed
// counters). If the service is unreachable the row is reverted to DRAFT so
// the admin can simply press Start again.
export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const csrf = assertSameOrigin(req)
  if (csrf) return csrf

  const { user, error } = await requireAdmin('whatsapp.manage')
  if (error) return error
  try {
    const { id } = await ctx.params
    const campaign = await startCampaign(id)

    await recordAudit({
      actorId: user.id,
      actorType: 'ADMIN',
      action: 'WHATSAPP_CAMPAIGN_STARTED',
      entityType: 'BulkCampaign',
      entityId: campaign.id,
      summary: `Campaign "${campaign.name}" started (${campaign.total} recipients)`,
      metadata: { audience: campaign.audience, total: campaign.total },
    })

    return NextResponse.json({ campaign })
  } catch (err) {
    if (err instanceof WhatsAppAdminError) {
      return NextResponse.json({ error: err.message }, { status: err.status })
    }
    console.error('admin whatsapp campaign start error', err)
    return NextResponse.json({ error: 'Failed to start campaign' }, { status: 500 })
  }
}
