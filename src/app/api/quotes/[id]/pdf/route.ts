import { NextRequest, NextResponse } from 'next/server'
import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from 'pdf-lib'
import { getSessionUser } from '@/lib/auth'
import { userHasPlatformPermission } from '@/server/modules/rbac/service'
import { db } from '@/lib/db'

/**
 * GET /api/quotes/[id]/pdf — server-rendered quote document.
 *
 * Auth mirrors RFQ thread access: the buyer (requester), platform staff with
 * rfq.pipeline.view, or the issuing seller (platform-facilitated quotes →
 * the admin who issued). Output: a single-page A4 PDF letterhead with line
 * items, totals, terms and validity — a B2B-ready document buyers can
 * attach to POs.
 */

const INK = rgb(0.13, 0.11, 0.1) // warm near-black
const MUTED = rgb(0.45, 0.42, 0.4)
const BRAND = rgb(0.77, 0.33, 0.12) // burnt orange (Vendora primary)
const HAIR = rgb(0.85, 0.83, 0.81)
const SOFT = rgb(0.976, 0.964, 0.949) // stone-50-ish tint for rows

const usd = (n: number) =>
  n.toLocaleString('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 2 })

function fmtDate(d: Date | null | undefined): string {
  if (!d) return '—'
  return d.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' })
}

const STATUS_LABEL: Record<string, string> = {
  SENT: 'OPEN OFFER',
  ACCEPTED: 'ACCEPTED',
  DECLINED: 'DECLINED',
  EXPIRED: 'EXPIRED',
  WITHDRAWN: 'WITHDRAWN',
  CONVERTED: 'CONVERTED TO ORDER',
}

function text(
  page: PDFPage,
  font: PDFFont,
  size: number,
  x: number,
  y: number,
  s: string,
  color = INK
) {
  page.drawText(s, { x, y, size, font, color })
}

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSessionUser()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { id } = await params

  const quote = await db.quote.findUnique({
    where: { id },
    include: {
      rfq: { include: { organization: true, user: { select: { id: true, name: true, email: true } } } },
      createdBy: { select: { id: true, name: true, storeName: true } },
      lines: { include: { product: { select: { title: true } } } },
    },
  })
  if (!quote) return NextResponse.json({ error: 'Quote not found' }, { status: 404 })

  const isRequester = quote.rfq.userId === session.id
  // Canonical platform check (legacy User.role === 'ADMIN' bypass retired).
  const isAdmin = await userHasPlatformPermission(session.id, 'rfq.pipeline.view')
  const isIssuer = quote.sellerId === session.id || quote.createdBy.id === session.id
  if (!isRequester && !isAdmin && !isIssuer) {
    return NextResponse.json({ error: 'Access denied' }, { status: 403 })
  }

  // ── Render ──
  const pdf = await PDFDocument.create()
  const page = pdf.addPage([595.28, 841.89]) // A4
  const font = await pdf.embedFont(StandardFonts.Helvetica)
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold)

  const M = 48 // margin
  const W = page.getWidth() - M * 2
  let y = page.getHeight() - 64

  // Letterhead
  text(page, bold, 22, M, y, 'VENDORA', BRAND)
  text(page, font, 9, M + 92, y + 2, 'B2B Marketplace', MUTED)
  text(page, font, 9, M, y - 2, `Quote ${quote.number}`, INK) // visually offset below
  y -= 14
  text(page, font, 10, M, y, `${STATUS_LABEL[quote.status] ?? quote.status}`, MUTED)
  y -= 6

  // Right-aligned meta block
  const metaX = M + W
  const meta: [string, string][] = [
    ['Quote date', fmtDate(quote.sentAt ?? quote.createdAt)],
    ['Valid until', quote.validUntil ? fmtDate(quote.validUntil) : 'No expiry'],
    ['Payment terms', quote.paymentTerms ?? 'Prepaid'],
    ['Currency', quote.currency],
  ]
  let my = y
  for (const [k, v] of meta) {
    const label = `${k}:  `
    const value = v
    const lw = font.widthOfTextAtSize(label, 9)
    const vw = font.widthOfTextAtSize(value, 9)
    text(page, font, 9, metaX - lw - vw, my, label, MUTED)
    text(page, font, 9, metaX - vw, my, value, INK)
    my -= 13
  }
  y = my - 12

  // Parties
  const sellerName = quote.sellerId
    ? quote.createdBy.storeName || quote.createdBy.name
    : 'Vendora (platform-facilitated)'
  const buyerName = quote.rfq.organization?.name ?? quote.rfq.user.name
  const colW = W / 2 - 10
  text(page, bold, 8.5, M, y, 'FROM', MUTED)
  text(page, bold, 8.5, M + colW + 20, y, 'TO', MUTED)
  y -= 14
  text(page, bold, 11, M, y, sellerName.slice(0, 42))
  text(page, bold, 11, M + colW + 20, y, buyerName.slice(0, 42))
  y -= 13
  text(page, font, 9, M, y, 'Via Vendora B2B Marketplace', MUTED)
  text(page, font, 9, M + colW + 20, y, quote.rfq.user.email.slice(0, 48), MUTED)
  if (quote.rfq.organization?.name) {
    y -= 12
    text(
      page,
      font,
      9,
      M + colW + 20,
      y,
      `Request ${quote.rfq.number} · ${quote.rfq.organization.name}`,
      MUTED
    )
  }
  y -= 24

  // Table header
  const colQty = M + W - 240
  const colUnit = M + W - 160
  const colTotal = M + W - 70
  page.drawRectangle({ x: M, y: y - 4, width: W, height: 20, color: SOFT })
  text(page, bold, 8.5, M + 8, y + 2, 'ITEM')
  text(page, bold, 8.5, colQty, y + 2, 'QTY')
  text(page, bold, 8.5, colUnit, y + 2, 'UNIT PRICE')
  text(page, bold, 8.5, colTotal, y + 2, 'AMOUNT')
  y -= 20

  // Lines
  for (const l of quote.lines) {
    const title = `${l.product?.title ?? 'Item'}${l.variantName ? ` — ${l.variantName}` : ''}`
    // Wrap long titles to the available width
    const maxTitleW = colQty - M - 16
    let line1 = ''
    for (const word of title.split(' ')) {
      const candidate = line1 ? `${line1} ${word}` : word
      if (font.widthOfTextAtSize(candidate, 9.5) > maxTitleW) break
      line1 = candidate
    }
    const overflow = title.slice(line1.length).trim()
    const price = l.unitPrice
    text(page, font, 9.5, M + 8, y - 8, line1)
    if (overflow) text(page, font, 8, M + 8, y - 19, `${overflow.slice(0, 64)}…`, MUTED)
    text(page, font, 9.5, colQty, y - 8, String(l.quantity))
    text(page, font, 9.5, colUnit, y - 8, usd(price))
    const amount = font.widthOfTextAtSize(usd(price * l.quantity), 9.5)
    text(page, font, 9.5, colTotal + 70 - amount, y - 8, usd(price * l.quantity))
    y -= overflow ? 30 : 22
    if (y < 150) break // safety valve — single-page doc for v1
  }

  // Totals
  y -= 8
  const totals: [string, string, boolean][] = [
    ['Subtotal', usd(quote.subtotal), false],
    ...(quote.discountTotal > 0
      ? [['Discount', `− ${usd(quote.discountTotal)}`, false] as [string, string, boolean]]
      : []),
    ...(quote.shippingTotal > 0
      ? [['Shipping', usd(quote.shippingTotal), false] as [string, string, boolean]]
      : []),
    ...(quote.taxTotal > 0
      ? [['Tax', usd(quote.taxTotal), false] as [string, string, boolean]]
      : []),
    ['Total', usd(quote.total), true],
  ]
  for (const [label, value, strong] of totals) {
    const f = strong ? bold : font
    const size = strong ? 12 : 9.5
    const vw = f.widthOfTextAtSize(value, size)
    text(page, f, size, colTotal + 70 - vw, y, value, strong ? BRAND : INK)
    text(page, f, size, M + 8, y, label, strong ? INK : MUTED)
    y -= strong ? 20 : 15
  }

  // Notes / terms
  if (quote.notes) {
    y -= 6
    text(page, bold, 9, M, y, 'NOTES')
    y -= 13
    for (const chunk of quote.notes.match(/.{1,95}(\s|$)/g)?.slice(0, 5) ?? []) {
      text(page, font, 9, M, y, chunk.trim(), MUTED)
      y -= 12
    }
  }
  y -= 4
  text(page, bold, 9, M, y, 'TERMS')
  y -= 13
  text(
    page,
    font,
    9,
    M,
    y,
    `Payment ${quote.paymentTerms ?? 'Prepaid'} · Offer valid until ${quote.validUntil ? fmtDate(quote.validUntil) : 'withdrawn'}. Stock is confirmed at conversion.`,
    MUTED
  )

  // Footer
  const fy = 56
  page.drawLine({ start: { x: M, y: fy + 18 }, end: { x: page.getWidth() - M, y: fy + 18 }, thickness: 0.75, color: HAIR })
  text(page, font, 8, M, fy + 6, 'Generated by Vendora — this document supersedes screen pricing.', MUTED)
  const gen = `Issued ${fmtDate(new Date())}`
  const gw = font.widthOfTextAtSize(gen, 8)
  text(page, font, 8, page.getWidth() - M - gw, fy + 6, gen, MUTED)

  const bytes = await pdf.save()
  return new NextResponse(bytes as unknown as BodyInit, {
    status: 200,
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="${quote.number}.pdf"`,
      'Cache-Control': 'no-store',
    },
  })
}
