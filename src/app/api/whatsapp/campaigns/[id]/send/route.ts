import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireAdmin } from '@/server/guards'
import { normalizePhone, waServiceSend, waServiceStatus } from '@/server/modules/whatsapp/send'
import { buildUserVars, renderTemplateBody } from '@/server/modules/whatsapp/variables'

// ─────────────────────────────────────────────────────────────────────────────
// /api/whatsapp/campaigns/[id]/send — fire a bulk broadcast.
//
// Flow: verify the campaign can send → require the bridge to be up (fail
// fast with a 503 instead of 100 per-message error rows) → mark SENDING →
// walk the phone snapshot at concurrency 5: personalize, queue, send, and
// persist per-message SENT/FAILED results. The whole loop is wrapped so a
// crash still refreshes the persisted counters in `finally`.
// ─────────────────────────────────────────────────────────────────────────────

const SENDABLE_FROM = new Set(['DRAFT', 'QUEUED', 'PAUSED', 'FAILED'])
const CONCURRENCY = 5

/** Map normalized phone → user id, matching on every stored variant we know. */
async function loadUsersByPhones(phones: string[]): Promise<Map<string, string>> {
  if (!phones.length) return new Map()
  const variants = new Set<string>()
  for (const p of phones) {
    const n = normalizePhone(p)
    if (!n) continue
    variants.add(p.trim())
    variants.add(n)
    variants.add(n.replace('+', ''))
  }
  const users = await db.user.findMany({
    where: { phone: { not: null, in: [...variants] } },
    select: { id: true, phone: true },
  })
  const map = new Map<string, string>()
  for (const u of users) {
    const n = normalizePhone(u.phone ?? '')
    if (n) map.set(n, u.id)
  }
  return map
}

export async function POST(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { error } = await requireAdmin('storefront.manage')
  if (error) return error

  const { id } = await ctx.params
  const campaign = await db.bulkCampaign.findUnique({ where: { id } })
  if (!campaign) return NextResponse.json({ error: 'Campaign not found' }, { status: 404 })
  if (!SENDABLE_FROM.has(campaign.status)) {
    return NextResponse.json(
      { error: `This campaign is ${campaign.status.toLowerCase()} — only draft (or failed/paused) campaigns can be sent` },
      { status: 400 }
    )
  }

  let phones: string[] = []
  try {
    phones = (JSON.parse(campaign.phones ?? '[]') as unknown[]).map((p) => normalizePhone(String(p))).filter(Boolean)
  } catch {
    phones = []
  }

  // Fail fast when the bridge is down — no per-message error spam. The
  // campaign stays untouched (still sendable once the connection is up).
  const status = await waServiceStatus()
  if (!status.up) {
    return NextResponse.json(
      { error: 'WhatsApp service is not running — start the connection first' },
      { status: 503 }
    )
  }

  await db.bulkCampaign.update({
    where: { id },
    data: { status: 'SENDING', startedAt: campaign.startedAt ?? new Date() },
  })

  // Skip recipients already messaged in a previous (crashed/paused) attempt.
  const existing = new Set(
    (await db.whatsAppMessage.findMany({ where: { campaignId: id }, select: { toNumber: true } })).map(
      (m) => m.toNumber
    )
  )
  const queue = phones.filter((p) => !existing.has(p))
  const usersByPhone = await loadUsersByPhones(queue)

  let loopError: unknown = null
  try {
    for (let i = 0; i < queue.length; i += CONCURRENCY) {
      const batch = queue.slice(i, i + CONCURRENCY)
      let batchSent = 0
      let batchFailed = 0
      await Promise.all(
        batch.map(async (phone) => {
          try {
            const userId = usersByPhone.get(phone)
            const vars = userId
              ? await buildUserVars(userId)
              : { name: 'customer', phone, date: new Date().toLocaleDateString('en-GB') }
            const rendered = renderTemplateBody(campaign.body, vars)
            const row = await db.whatsAppMessage.create({
              data: {
                campaignId: id,
                toNumber: phone,
                body: rendered,
                direction: 'OUT',
                status: 'QUEUED',
              },
            })
            const result = await waServiceSend(phone, rendered)
            if (result.ok) {
              batchSent++
              await db.whatsAppMessage.update({
                where: { id: row.id },
                data: { status: 'SENT', sentAt: new Date(), waMessageId: result.id ?? null },
              })
            } else {
              batchFailed++
              await db.whatsAppMessage.update({
                where: { id: row.id },
                data: { status: 'FAILED', error: result.error ?? 'Send failed' },
              })
            }
          } catch (err) {
            console.error(`[campaigns/send] recipient ${phone} failed`, err)
            batchFailed++
          }
        })
      )
      // Persist progress after every batch so a crash keeps the counts honest.
      if (batchSent || batchFailed) {
        await db.bulkCampaign.update({
          where: { id },
          data: {
            sent: { increment: batchSent },
            failed: { increment: batchFailed },
          },
        })
      }
    }
  } catch (err) {
    loopError = err
    console.error('[api/whatsapp/campaigns/send] loop crashed', err)
  } finally {
    // Refresh authoritative counts from the message rows themselves.
    try {
      const [sentCount, failedCount] = await Promise.all([
        db.whatsAppMessage.count({ where: { campaignId: id, status: 'SENT' } }),
        db.whatsAppMessage.count({ where: { campaignId: id, status: 'FAILED' } }),
      ])
      await db.bulkCampaign.update({
        where: { id },
        data: {
          sent: sentCount,
          failed: failedCount,
          status: sentCount === 0 && campaign.total > 0 ? 'FAILED' : 'COMPLETED',
          finishedAt: new Date(),
        },
      })
      if (campaign.templateId) {
        await db.whatsAppTemplate.update({
          where: { id: campaign.templateId },
          data: { useCount: { increment: 1 } },
        }).catch(() => undefined)
      }
    } catch (err) {
      console.error('[api/whatsapp/campaigns/send] finally-refresh failed', err)
    }
  }

  const fresh = await db.bulkCampaign.findUnique({ where: { id } })
  if (loopError) {
    return NextResponse.json(
      { error: 'Send crashed partway — progress was saved. You can re-send to retry the remaining recipients.', campaign: fresh },
      { status: 500 }
    )
  }
  return NextResponse.json({ campaign: fresh })
}
