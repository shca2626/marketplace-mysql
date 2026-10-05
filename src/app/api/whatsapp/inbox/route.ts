import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireAdmin } from '@/server/guards'

// ─────────────────────────────────────────────────────────────────────────────
// /api/whatsapp/inbox — unified conversation list (WhatsApp + widget)
//   ?kind= &status= &q=  — q matches visitorName / visitorPhone / subject.
// Seller store names are batch-resolved (sellerOrgId holds the seller USER id).
// ─────────────────────────────────────────────────────────────────────────────

export async function GET(req: NextRequest) {
  const { error } = await requireAdmin('storefront.manage')
  if (error) return error
  try {
    const sp = req.nextUrl.searchParams
    const kind = sp.get('kind')?.trim()
    const status = sp.get('status')?.trim()
    const q = sp.get('q')?.trim()

    const where = {
      ...(kind === 'WHATSAPP' || kind === 'WIDGET' ? { kind } : {}),
      ...(status === 'OPEN' || status === 'CLOSED' ? { status } : {}),
      ...(q ? { OR: [{ visitorName: { contains: q } }, { visitorPhone: { contains: q } }, { subject: { contains: q } }] } : {}),
    }

    const rows = await db.chatConversation.findMany({
      where,
      orderBy: { lastMessageAt: 'desc' },
      take: 100,
      include: { _count: { select: { messages: true } } },
    })

    const sellerIds = [...new Set(rows.map((r) => r.sellerOrgId).filter((v): v is string => !!v))]
    const sellers = sellerIds.length
      ? await db.user.findMany({ where: { id: { in: sellerIds } }, select: { id: true, name: true, storeName: true } })
      : []
    const sellerMap = new Map(sellers.map((s) => [s.id, s.storeName || s.name]))

    return NextResponse.json({
      conversations: rows.map((r) => ({
        id: r.id,
        kind: r.kind,
        channelRef: r.channelRef,
        visitorName: r.visitorName,
        visitorPhone: r.visitorPhone,
        visitorEmail: r.visitorEmail,
        sellerStoreName: r.sellerOrgId ? (sellerMap.get(r.sellerOrgId) ?? null) : null,
        subject: r.subject,
        lastMessageAt: r.lastMessageAt,
        lastMessagePreview: r.lastMessagePreview,
        unreadStaff: r.unreadStaff,
        status: r.status,
        messageCount: r._count.messages,
      })),
    })
  } catch (err) {
    console.error('[api/whatsapp/inbox] GET failed', err)
    return NextResponse.json({ error: 'Failed to load inbox' }, { status: 500 })
  }
}
