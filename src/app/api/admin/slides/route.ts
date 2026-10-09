import { NextResponse, type NextRequest } from 'next/server'
import { z } from 'zod'
import { db } from '@/lib/db'
import { getSessionUser } from '@/lib/auth'
import { userHasPlatformPermission } from '@/server/modules/rbac/service'
import { assertSameOrigin, enforceRateLimit } from '@/lib/http'
import { getAllSlides, type BannerSlideDTO } from '@/lib/settings/server'
import { invalidateTags } from '@/lib/cache'
import { mediaUrlSchema } from '@/lib/catalog/validation'

// /api/admin/slides — banner slide management (ADMIN only).
// GET  → all slides (incl. inactive), position-ordered.
// POST → create a slide (position = appended at the end).

const slideInputSchema = z.object({
  eyebrow: z.string().trim().max(120).optional().nullable(),
  title: z.string().trim().max(200).optional().nullable(),
  subtitle: z.string().trim().max(400).optional().nullable(),
  image: mediaUrlSchema,
  ctaLabel: z.string().trim().max(80).optional().nullable(),
  ctaView: z.enum(['catalog', 'seller', 'home', 'favorites', 'orders', 'account']).optional().nullable(),
  ctaCategory: z.string().trim().max(191).optional().nullable(),
  active: z.boolean().optional(),
})

async function requireAdmin(permission?: string) {
  const user = await getSessionUser()
  if (!user) return { error: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) }
  if (user.role === 'ADMIN') return { user }
  if (permission) {
    const allowed = await userHasPlatformPermission(user.id, permission)
    if (allowed) return { user }
  }
  return { error: NextResponse.json({ error: 'Admin access required' }, { status: 403 }) }
}

export async function GET() {
  const guard = await requireAdmin('storefront.manage')
  if (guard.error) return guard.error
  const slides = await getAllSlides()
  return NextResponse.json({ slides })
}

export async function POST(req: NextRequest) {
  const guard = await requireAdmin('storefront.manage')
  if (guard.error) return guard.error

  const csrf = assertSameOrigin(req)
  if (csrf) return csrf

  const rl = enforceRateLimit(req, 'admin:slides', { limit: 30, windowMs: 60_000 })
  if (rl) return rl

  try {
    const input = slideInputSchema.parse(await req.json())
    const last = await db.bannerSlide.findFirst({ orderBy: { position: 'desc' }, select: { position: true } })
    const slide = await db.bannerSlide.create({
      data: {
        eyebrow: input.eyebrow ?? null,
        title: input.title ?? null,
        subtitle: input.subtitle ?? null,
        image: input.image,
        ctaLabel: input.ctaLabel ?? null,
        ctaView: input.ctaView ?? null,
        ctaCategory: input.ctaCategory ?? null,
        active: input.active ?? true,
        position: (last?.position ?? -1) + 1,
      },
    })
    invalidateTags('settings')
    return NextResponse.json({ slide }, { status: 201 })
  } catch (err) {
    if (err instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Invalid slide', details: err.issues.map((i) => `${i.path.join('.')}: ${i.message}`) },
        { status: 400 }
      )
    }
    console.error('[api/admin/slides POST] failed', err)
    return NextResponse.json({ error: 'Failed to create slide' }, { status: 500 })
  }
}
