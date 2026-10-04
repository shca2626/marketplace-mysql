import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/server/guards'
import { assertSameOrigin } from '@/lib/http'
import { recordAudit } from '@/server/modules/audit/service'
import { WhatsAppAdminError } from '@/server/modules/whatsapp/admin'
import { campaignCreateSchema, createCampaign, listCampaigns } from '@/server/modules/whatsapp/campaigns'

// GET /api/admin/whatsapp/campaigns — bulk sending campaigns, newest first.
export async function GET() {
  const { error } = await requireAdmin('whatsapp.manage')
  if (error) return error
  try {
    const campaigns = await listCampaigns()
    return NextResponse.json({ campaigns })
  } catch (err) {
    console.error('admin whatsapp campaigns GET error', err)
    return NextResponse.json({ error: 'Failed to load campaigns' }, { status: 500 })
  }
}

// POST /api/admin/whatsapp/campaigns — create a DRAFT campaign. The audience
// is resolved ONCE here into a phone snapshot stored on the row, so later user
// changes never mutate the campaign.
export async function POST(req: NextRequest) {
  const csrf = assertSameOrigin(req)
  if (csrf) return csrf

  const { user, error } = await requireAdmin('whatsapp.manage')
  if (error) return error
  try {
    const parsed = campaignCreateSchema.safeParse(await req.json())
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message ?? 'Invalid input' },
        { status: 400 }
      )
    }

    const campaign = await createCampaign(parsed.data, user.id)

    await recordAudit({
      actorId: user.id,
      actorType: 'ADMIN',
      action: 'WHATSAPP_CAMPAIGN_CREATED',
      entityType: 'BulkCampaign',
      entityId: campaign.id,
      summary: `Campaign "${campaign.name}" created (${campaign.audience}, ${campaign.total} recipients)`,
      metadata: { audience: campaign.audience, total: campaign.total },
    })

    return NextResponse.json({ campaign }, { status: 201 })
  } catch (err) {
    if (err instanceof WhatsAppAdminError) {
      return NextResponse.json({ error: err.message }, { status: err.status })
    }
    console.error('admin whatsapp campaigns POST error', err)
    return NextResponse.json({ error: 'Failed to create campaign' }, { status: 500 })
  }
}
