import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/server/guards'
import { checkoutMethods, getPaymentsConfig, updatePaymentsConfig } from '@/server/modules/payments/service'

// GET /api/admin/payments/config — bank-transfer details + offered methods.
export async function GET() {
  const { error } = await requireAdmin()
  if (error) return error
  const [config, methods] = await Promise.all([getPaymentsConfig(), Promise.resolve(checkoutMethods())])
  return NextResponse.json({ config, methods, cardGateway: process.env.PAYMENT_DRIVER !== 'manual' ? 'simulated' : 'disabled' })
}

// PUT /api/admin/payments/config — update the bank details buyers see when
// choosing bank transfer at checkout.
export async function PUT(req: NextRequest) {
  const { error } = await requireAdmin()
  if (error) return error
  try {
    const body = await req.json()
    const config = await updatePaymentsConfig({
      bankName: typeof body.bankName === 'string' ? body.bankName : undefined,
      accountName: typeof body.accountName === 'string' ? body.accountName : undefined,
      accountDetails: typeof body.accountDetails === 'string' ? body.accountDetails : undefined,
      instructions: typeof body.instructions === 'string' ? body.instructions : undefined,
    })
    return NextResponse.json({ config })
  } catch (err) {
    console.error('payments config PUT error', err)
    return NextResponse.json({ error: 'Failed to update payment config' }, { status: 500 })
  }
}
