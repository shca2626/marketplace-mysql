import { NextResponse } from 'next/server'
import { checkoutMethods } from '@/server/modules/payments/service'

// GET /api/payments/methods — payment options offered at checkout.
// CARD runs on the simulated gateway (disable with PAYMENT_DRIVER=manual);
// BANK_TRANSFER is settled by a platform operator.
export async function GET() {
  return NextResponse.json({ methods: checkoutMethods() })
}
