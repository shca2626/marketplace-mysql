import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from 'pdf-lib'

/**
 * Commission invoice PDF — pdf-lib renderer (mirrors the quote PDF pattern).
 *
 * Input: the payload of `getCommissionInvoiceForPdf(id)`:
 *   invoice (number, amount, status, dueAt, issuedAt)
 *   · statement (number, period, base, seller)
 *   · statement.obligations (per delivered order: order ref, buyer, base, rate, amount)
 */

const INK = rgb(0.13, 0.11, 0.1)
const MUTED = rgb(0.45, 0.42, 0.4)
const BRAND = rgb(0.77, 0.33, 0.12) // burnt orange (Vendora primary)
const HAIR = rgb(0.85, 0.83, 0.81)
const SOFT = rgb(0.976, 0.964, 0.949)

const usd = (n: number) =>
  n.toLocaleString('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 2 })

function fmtDate(d: Date | null | undefined): string {
  if (!d) return '—'
  return new Date(d).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' })
}

function text(page: PDFPage, font: PDFFont, size: number, x: number, y: number, s: string, color = INK) {
  page.drawText(s, { x, y, size, font, color })
}

export interface CommissionInvoicePdfPayload {
  number: string
  amount: { toNumber(): number }
  status: string
  dueAt: Date | null
  issuedAt: Date
  statement: {
    number: string
    periodStart: Date
    periodEnd: Date
    baseAmount: { toNumber(): number }
    seller: { name: string; storeName: string | null; email: string }
    obligations: {
      commissionRate: number
      baseAmount: { toNumber(): number }
      amount: { toNumber(): number }
      status: string
      order: { poNumber: string | null; buyer: { name: string } | null } | null
    }[]
  }
}

export async function renderCommissionInvoicePdf(invoice: CommissionInvoicePdfPayload): Promise<Uint8Array> {
  const pdf = await PDFDocument.create()
  const page = pdf.addPage([595.28, 841.89]) // A4
  const font = await pdf.embedFont(StandardFonts.Helvetica)
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold)

  const M = 48
  const W = page.getWidth() - M * 2
  let y = page.getHeight() - 64

  // Letterhead
  text(page, bold, 22, M, y, 'VENDORA', BRAND)
  text(page, font, 9, M + 92, y + 2, 'B2B Marketplace', MUTED)
  text(page, font, 9, M, y - 2, `Commission invoice ${invoice.number}`, INK)
  y -= 14
  const statusLabel =
    invoice.status === 'PAID' ? 'PAID' : invoice.status === 'VOID' ? 'VOID' : 'PAYMENT DUE'
  text(page, font, 10, M, y, statusLabel, invoice.status === 'PAID' ? BRAND : MUTED)
  y -= 6

  // Right-aligned meta
  const metaX = M + W
  const meta: [string, string][] = [
    ['Issue date', fmtDate(invoice.issuedAt)],
    ['Due date', invoice.dueAt ? fmtDate(invoice.dueAt) : 'On receipt'],
    ['Statement', invoice.statement.number],
    ['Period', `${fmtDate(invoice.statement.periodStart)} – ${fmtDate(invoice.statement.periodEnd)}`],
  ]
  let my = y
  for (const [k, v] of meta) {
    const label = `${k}:  `
    const lw = font.widthOfTextAtSize(label, 9)
    const vw = font.widthOfTextAtSize(v, 9)
    text(page, font, 9, metaX - lw - vw, my, label, MUTED)
    text(page, font, 9, metaX - vw, my, v, INK)
    my -= 13
  }
  y = my - 12

  // Parties: platform bills the supplier
  const seller = invoice.statement.seller
  text(page, bold, 8.5, M, y, 'FROM', MUTED)
  text(page, bold, 8.5, M + W / 2, y, 'BILLED TO', MUTED)
  y -= 14
  text(page, bold, 11, M, y, 'Vendora Marketplace Ltd')
  text(page, bold, 11, M + W / 2, y, (seller.storeName ?? seller.name).slice(0, 42))
  y -= 13
  text(page, font, 9, M, y, 'Platform commission · third-party marketplace', MUTED)
  text(page, font, 9, M + W / 2, y, seller.email.slice(0, 48), MUTED)
  y -= 26

  // Table header
  const colBase = M + W - 320
  const colRate = M + W - 190
  const colAmount = M + W - 80
  page.drawRectangle({ x: M, y: y - 4, width: W, height: 20, color: SOFT })
  text(page, bold, 8.5, M + 8, y + 2, 'DELIVERED ORDER')
  text(page, bold, 8.5, colBase, y + 2, 'BASE')
  text(page, bold, 8.5, colRate, y + 2, 'RATE')
  text(page, bold, 8.5, colAmount, y + 2, 'COMMISSION')
  y -= 20

  // Obligation lines
  for (const o of invoice.statement.obligations) {
    const orderRef = o.order?.poNumber || 'Order'
    const buyer = o.order?.buyer?.name ?? ''
    const label = buyer ? `${orderRef} · ${buyer}` : orderRef
    text(page, font, 9.5, M + 8, y - 8, label.slice(0, 52))
    text(page, font, 9.5, colBase, y - 8, usd(o.baseAmount.toNumber()))
    text(page, font, 9.5, colRate, y - 8, `${o.commissionRate.toFixed(2)}%`)
    const amt = usd(o.amount.toNumber())
    text(page, font, 9.5, colAmount + 80 - font.widthOfTextAtSize(amt, 9.5), y - 8, amt)
    y -= 22
    if (y < 170) break // single-page safety valve
  }

  // Totals
  y -= 8
  page.drawLine({ start: { x: M, y }, end: { x: M + W, y }, thickness: 1, color: HAIR })
  y -= 24
  const totals: [string, string, boolean][] = [
    ['Commission base', usd(invoice.statement.baseAmount.toNumber()), false],
    ['Commission due', usd(invoice.amount.toNumber()), true],
  ]
  for (const [label, value, strong] of totals) {
    const f = strong ? bold : font
    const size = strong ? 12 : 9.5
    const vw = f.widthOfTextAtSize(value, size)
    text(page, f, size, M, y, label, strong ? INK : MUTED)
    text(page, f, size, M + W - vw, y, value, strong ? BRAND : INK)
    y -= strong ? 22 : 16
  }

  // Footer note
  y -= 14
  text(
    page,
    font,
    8,
    M,
    y,
    'Commission is charged on delivered orders per the marketplace supplier agreement. Buyer-supplier',
    MUTED
  )
  y -= 11
  text(
    page,
    font,
    8,
    M,
    y,
    'settlement happens outside the platform; this invoice covers the platform commission only.',
    MUTED
  )

  return pdf.save()
}
