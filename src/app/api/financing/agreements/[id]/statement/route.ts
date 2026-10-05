import { NextRequest, NextResponse } from 'next/server'
import { requireUser } from '@/server/guards'
import { agreementStatement } from '@/server/modules/financing/installments'
import { FinancingError, assertApplicantActor } from '@/server/modules/financing/shared'
import { db } from '@/lib/db'

// GET /api/financing/agreements/[id]/statement — the buyer-obligation ledger:
// installment schedule with paid/outstanding/aging, payments history with
// allocation summary + reversal links, totals + NPL flag. Applicant (or an
// admin) only — a financing user must not see another buyer's statement.
export async function GET(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { user, error } = await requireUser()
  if (error) return error
  try {
    const { id } = await ctx.params
    if (user.role !== 'ADMIN') {
      const agreement = await db.financingAgreement.findUnique({
        where: { id },
        select: {
          offer: {
            select: {
              request: { select: { createdById: true, organizationId: true } },
            },
          },
        },
      })
      if (!agreement) throw new FinancingError('Agreement not found', 404)
      await assertApplicantActor(user.id, agreement.offer.request)
    }
    const statement = await agreementStatement({ id: user.id, role: user.role }, id)
    return NextResponse.json({ statement })
  } catch (err) {
    if (err instanceof FinancingError) {
      return NextResponse.json({ error: err.message }, { status: err.status })
    }
    console.error('buyer statement error', err)
    return NextResponse.json({ error: 'Failed to load the statement' }, { status: 500 })
  }
}
