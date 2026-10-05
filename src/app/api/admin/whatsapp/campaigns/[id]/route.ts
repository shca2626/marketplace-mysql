import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/server/guards'
import { assertSameOrigin } from '@/lib/http'
import { recordAudit } from '@/server/modules/audit/service'
import { WhatsAppAdminError } from '@/server/modules/whatsapp/admin'
import { campaignRenameSchema, deleteCampaign, getCampaign, renameCampaign } from '@/server/modules/whatsapp/campaigns'

// GET /api/admin/whatsapp/campaigns/[id] — campaign detail (progress is
// polled from here while SENDING).
export async function GET(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { error } = await requireAdmin('whatsapp.manage')
  if (error) return error
  try {
    const { id } = await ctx.params
    const campaign = await getCampaign(id)
    return NextResponse.json({ campaign })
  } catch (err) {
    if (err instanceof WhatsAppAdminError) {
      return NextResponse.json({ error: err.message }, { status: err.status })
    }
    console.error('admin whatsapp campaign GET error', err)
    return NextResponse.json({ error: 'Failed to load campaign' }, { status: 500 })
  }
}

// PATCH /api/admin/whatsapp/campaigns/[id] — rename and/or edit custom
// variables. Variables are frozen once the campaign leaves DRAFT (the body and
// audience snapshot are immutable by design).
export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const csrf = assertSameOrigin(req)
  if (csrf) return csrf

  const { user, error } = await requireAdmin('whatsapp.manage')
  if (error) return error
  try {
    const { id } = await ctx.params
    const parsed = campaignRenameSchema.safeParse(await req.json())
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message ?? 'Invalid input' },
        { status: 400 }
      )
    }

    const campaign = await renameCampaign(id, parsed.data)

    await recordAudit({
      actorId: user.id,
      actorType: 'ADMIN',
      action: 'WHATSAPP_CAMPAIGN_UPDATED',
      entityType: 'BulkCampaign',
      entityId: campaign.id,
      summary: campaign.variables
        ? `Campaign "${campaign.name}" updated (custom variables: ${Object.keys(campaign.variables).length})`
        : `Campaign "${campaign.name}" updated`,
    })

    return NextResponse.json({ campaign })
  } catch (err) {
    if (err instanceof WhatsAppAdminError) {
      return NextResponse.json({ error: err.message }, { status: err.status })
    }
    console.error('admin whatsapp campaign PATCH error', err)
    return NextResponse.json({ error: 'Failed to update campaign' }, { status: 500 })
  }
}

// DELETE /api/admin/whatsapp/campaigns/[id] — only allowed when the campaign
// is not mid-run (DRAFT/COMPLETED/CANCELLED/FAILED). Ledger rows keep their
// campaignId so the send history stays queryable.
export async function DELETE(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const csrf = assertSameOrigin(req)
  if (csrf) return csrf

  const { user, error } = await requireAdmin('whatsapp.manage')
  if (error) return error
  try {
    const { id } = await ctx.params
    const campaign = await getCampaign(id)
    await deleteCampaign(id)

    await recordAudit({
      actorId: user.id,
      actorType: 'ADMIN',
      action: 'WHATSAPP_CAMPAIGN_DELETED',
      entityType: 'BulkCampaign',
      entityId: id,
      summary: `Campaign "${campaign.name}" deleted (status was ${campaign.status})`,
    })

    return NextResponse.json({ ok: true })
  } catch (err) {
    if (err instanceof WhatsAppAdminError) {
      return NextResponse.json({ error: err.message }, { status: err.status })
    }
    console.error('admin whatsapp campaign DELETE error', err)
    return NextResponse.json({ error: 'Failed to delete campaign' }, { status: 500 })
  }
}
