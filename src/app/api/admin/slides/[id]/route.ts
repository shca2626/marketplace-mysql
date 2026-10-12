import { NextResponse, type NextRequest } from 'next/server'
import { requireAdmin } from '@/server/guards'
import { z } from 'zod'
import { db } from '@/lib/db'
import { getSessionUser } from '@/lib/auth'
import { assertSameOrigin, enforceRateLimit } from '@/lib/http'
import { invalidateTags } from '@/lib/cache'
import { mediaUrlSchema } from '@/lib/catalog/validation'

// /api/admin/slides/[id] — update or delete one banner slide (ADMIN only).
// PUT    → partial field update; `move: 'up' | 'down'` swaps with the
//          neighbour (reordering), applied before field patches.
// DELETE → remove the slide.

const slideUpdateSchema = z.object({
  eyebrow: z.string().trim().max(120).nullable().optional(),
  title: z.string().trim().max(200).nullable().optional(),
  subtitle: z.string().trim().max(400).nullable().optional(),
  image: mediaUrlSchema.optional(),
  ctaLabel: z.string().trim().max(80).nullable().optional(),
  ctaView: z.enum(['catalog', 'seller', 'home', 'favorites', 'orders', 'account']).nullable().optional(),
  ctaCategory: z.string().trim().max(191).nullable().optional(),
  active: z.boolean().optional(),
  /** reordering shortcut — swaps position with the adjacent slide */
  move: z.enum(['up', 'down']).optional(),
})


type RouteContext = { params: Promise<{ id: string }> }

export async function PUT(req: NextRequest, { params }: RouteContext) {
  const { user, error } = await requireAdmin('storefront.manage')
  if (error) return error

  const csrf = assertSameOrigin(req)
  if (csrf) return csrf

  const rl = enforceRateLimit(req, 'admin:slides', { limit: 60, windowMs: 60_000 })
  if (rl) return rl

  const { id } = await params
  try {
    const input = slideUpdateSchema.parse(await req.json())

    const existing = await db.bannerSlide.findUnique({ where: { id } })
    if (!existing) return NextResponse.json({ error: 'Slide not found' }, { status: 404 })

    // ── reorder (swap positions with the adjacent slide) ──
    if (input.move) {
      const dir = input.move === 'up' ? -1 : 1
      const neighbour = await db.bannerSlide.findFirst({
        where: { position: existing.position + dir },
        orderBy: { position: dir === -1 ? 'desc' : 'asc' },
      })
      if (neighbour) {
        await db.$transaction([
          db.bannerSlide.update({ where: { id: neighbour.id }, data: { position: existing.position } }),
          db.bannerSlide.update({ where: { id }, data: { position: neighbour.position } }),
        ])
      }
    }

    // ── field patches ──
    const { move: _move, ...fields } = input
    const hasPatch = Object.keys(fields).length > 0
    if (hasPatch) {
      await db.bannerSlide.update({ where: { id }, data: fields })
    }

    if (input.move || hasPatch) invalidateTags('settings')

    const slide = await db.bannerSlide.findUnique({ where: { id } })
    return NextResponse.json({ slide })
  } catch (err) {
    if (err instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Invalid slide update', details: err.issues.map((i) => `${i.path.join('.')}: ${i.message}`) },
        { status: 400 }
      )
    }
    console.error('[api/admin/slides/[id] PUT] failed', err)
    return NextResponse.json({ error: 'Failed to update slide' }, { status: 500 })
  }
}

export async function DELETE(req: NextRequest, { params }: RouteContext) {
  const { user, error } = await requireAdmin('storefront.manage')
  if (error) return error

  const csrf = assertSameOrigin(req)
  if (csrf) return csrf

  const rl = enforceRateLimit(req, 'admin:slides', { limit: 30, windowMs: 60_000 })
  if (rl) return rl

  const { id } = await params
  try {
    const existing = await db.bannerSlide.findUnique({ where: { id } })
    if (!existing) return NextResponse.json({ error: 'Slide not found' }, { status: 404 })
    await db.bannerSlide.delete({ where: { id } })
    invalidateTags('settings')
    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error('[api/admin/slides/[id] DELETE] failed', err)
    return NextResponse.json({ error: 'Failed to delete slide' }, { status: 500 })
  }
}
