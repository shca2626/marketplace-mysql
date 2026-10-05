import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { requireAdmin } from '@/server/guards'
import { listReviewQueue, decideProductReview, decideOfferReview, decideFinancierServiceReview, ReviewError } from '@/server/modules/catalog/review'
import { assertSameOrigin, enforceRateLimit } from '@/lib/http'

// GET /api/admin/catalog/review — the unified publish-approval queue:
// pending + recently-rejected products, multi-vendor offers, financier services.
export async function GET() {
  const { error } = await requireAdmin('catalog.products.moderate')
  if (error) return error
  try {
    const queue = await listReviewQueue()
    return NextResponse.json(queue)
  } catch (err) {
    console.error('admin review queue GET error', err)
    return NextResponse.json({ error: 'Failed to load the review queue' }, { status: 500 })
  }
}

const decisionSchema = z.object({
  kind: z.enum(['PRODUCT', 'OFFER', 'SERVICE']),
  id: z.string().min(1),
  action: z.enum(['APPROVE', 'REJECT']),
  note: z.string().trim().max(1000).optional(),
})

// POST /api/admin/catalog/review — approve/reject one queue item.
// Rejections require a reason (shown to the owner). Every decision notifies
// the owner and lands in the audit log.
export async function POST(req: NextRequest) {
  const { user, error } = await requireAdmin('catalog.products.moderate')
  if (error) return error
  const csrf = assertSameOrigin(req)
  if (csrf) return csrf
  const rl = enforceRateLimit(req, 'admin:review', { limit: 60, windowMs: 60_000 }, user.id)
  if (rl) return rl

  try {
    const parsed = decisionSchema.safeParse(await req.json())
    if (!parsed.success)
      return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'Invalid decision' }, { status: 400 })
    const { kind, id, action, note } = parsed.data
    const admin = { id: user.id, name: user.name }

    if (kind === 'PRODUCT') {
      const product = await decideProductReview(admin, id, action, note)
      return NextResponse.json({ product: { id: product.id, status: product.status } })
    }
    if (kind === 'OFFER') {
      const offer = await decideOfferReview(admin, id, action, note)
      return NextResponse.json({ offer: { id: offer.id, status: offer.status } })
    }
    const service = await decideFinancierServiceReview(admin, id, action, note)
    return NextResponse.json({ service: { id: service.id, status: service.status } })
  } catch (err) {
    if (err instanceof ReviewError) return NextResponse.json({ error: err.message }, { status: err.status })
    console.error('admin review POST error', err)
    return NextResponse.json({ error: 'Failed to record the review decision' }, { status: 500 })
  }
}
