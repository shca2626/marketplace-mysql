import { NextRequest, NextResponse } from 'next/server'
import { getSessionUser } from '@/lib/auth'
import {
  getCommissionInvoiceForPdf,
  CommissionServiceError,
} from '@/server/modules/commission/service'
import { userHasPlatformPermission } from '@/server/modules/rbac/service'
import { renderCommissionInvoicePdf } from '@/lib/commission-invoice-pdf'

// GET /api/admin/commission/invoices/[id]/pdf — the commission invoice
// document (pdf-lib, same pattern as the quote PDF). Platform staff with
// payouts.view and the billed seller can download.
export async function GET(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const user = await getSessionUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  try {
    const { id } = await ctx.params
    const invoice = await getCommissionInvoiceForPdf(id)

    // Canonical platform check (legacy User.role === 'ADMIN' bypass retired).
    const isAdmin = await userHasPlatformPermission(user.id, 'payouts.view')
    const isSeller = invoice.sellerId === user.id
    if (!isAdmin && !isSeller) {
      return NextResponse.json({ error: 'Access denied' }, { status: 403 })
    }

    const pdf = await renderCommissionInvoicePdf(invoice as unknown as Parameters<typeof renderCommissionInvoicePdf>[0])
    return new NextResponse(new Uint8Array(pdf), {
      status: 200,
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `inline; filename="${invoice.number}.pdf"`,
      },
    })
  } catch (err) {
    if (err instanceof CommissionServiceError) {
      return NextResponse.json({ error: err.message }, { status: err.status })
    }
    console.error('commission invoice pdf error', err)
    return NextResponse.json({ error: 'Failed to render invoice' }, { status: 500 })
  }
}
