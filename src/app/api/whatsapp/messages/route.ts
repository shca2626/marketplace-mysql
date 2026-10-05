import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireAdmin } from '@/server/guards'

// ─────────────────────────────────────────────────────────────────────────────
// /api/whatsapp/messages — paginated outbound/inbound message log
//   ?campaignId= &status= &q= &page= &pageSize=25  (newest first)
// ─────────────────────────────────────────────────────────────────────────────

export async function GET(req: NextRequest) {
  const { error } = await requireAdmin('storefront.manage')
  if (error) return error
  try {
    const sp = req.nextUrl.searchParams
    const campaignId = sp.get('campaignId')?.trim() || null
    const status = sp.get('status')?.trim() || null
    const q = sp.get('q')?.trim() || null
    const page = Math.max(1, parseInt(sp.get('page') ?? '1', 10) || 1)
    const pageSize = Math.min(100, Math.max(1, parseInt(sp.get('pageSize') ?? '25', 10) || 25))

    const where = {
      ...(campaignId ? { campaignId } : {}),
      ...(status ? { status } : {}),
      ...(q
        ? { OR: [{ toNumber: { contains: q } }, { body: { contains: q } }] }
        : {}),
    }

    const [messages, total] = await Promise.all([
      db.whatsAppMessage.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
        select: {
          id: true,
          campaignId: true,
          toNumber: true,
          fromNumber: true,
          body: true,
          direction: true,
          status: true,
          error: true,
          waMessageId: true,
          sentAt: true,
          createdAt: true,
        },
      }),
      db.whatsAppMessage.count({ where }),
    ])

    return NextResponse.json({ messages, total, page, pageSize })
  } catch (err) {
    console.error('[api/whatsapp/messages] GET failed', err)
    return NextResponse.json({ error: 'Failed to load messages' }, { status: 500 })
  }
}
