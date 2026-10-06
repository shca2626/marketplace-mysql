import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { requireAdmin } from '@/server/guards'
import { assertSameOrigin } from '@/lib/http'
import { listPlans, upsertPlan, SubscriptionServiceError } from '@/server/modules/subscriptions/service'

// GET /api/admin/subscriptions/plans — the subscription plan catalog (Phase 11.2).
// Guard: payouts.view (the monetization console reads the plans grid).
export async function GET() {
  const { error } = await requireAdmin('payouts.view')
  if (error) return error
  try {
    return NextResponse.json({ plans: await listPlans() })
  } catch (err) {
    if (err instanceof SubscriptionServiceError) {
      return NextResponse.json({ error: err.message, code: err.code }, { status: err.status })
    }
    console.error('admin subscription plans GET error', err)
    return NextResponse.json({ error: 'Failed to load plans' }, { status: 500 })
  }
}

const planSchema = z.object({
  key: z.string().trim().min(1).max(40),
  name: z.string().trim().min(1).max(80),
  description: z.string().trim().max(500).nullable().optional(),
  priceMonthly: z.number().min(0).max(1_000_000),
  currency: z.string().trim().length(3).optional(),
  modules: z.array(z.string().trim().min(1).max(60)).max(20),
  limits: z.object({
    maxProducts: z.number().int().min(0).nullable(),
    maxActiveOffers: z.number().int().min(0).nullable(),
    maxUsers: z.number().int().min(0).nullable(),
  }),
  isActive: z.boolean().optional(),
  sortOrder: z.number().int().min(0).max(999).optional(),
})

// PUT /api/admin/subscriptions/plans — create or edit a plan. Editing a live
// plan re-clamps every subscriber's ceiling on the next resolution (the plan
// cache is invalidated by the service). Guard: payouts.manage.
export async function PUT(req: NextRequest) {
  const csrf = assertSameOrigin(req)
  if (csrf) return csrf

  const { user, error } = await requireAdmin('payouts.manage')
  if (error) return error
  try {
    let body: unknown
    try {
      body = await req.json()
    } catch {
      return NextResponse.json({ error: 'Expected a JSON body' }, { status: 400 })
    }
    const parsed = planSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message ?? 'Invalid input' },
        { status: 400 }
      )
    }
    const plan = await upsertPlan(
      { ...parsed.data, description: parsed.data.description ?? null },
      user!.id
    )
    return NextResponse.json({ plan })
  } catch (err) {
    if (err instanceof SubscriptionServiceError) {
      return NextResponse.json({ error: err.message, code: err.code }, { status: err.status })
    }
    console.error('admin subscription plans PUT error', err)
    return NextResponse.json({ error: 'Failed to save the plan' }, { status: 500 })
  }
}
