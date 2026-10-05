import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { db } from '@/lib/db'
import { getSessionUser, toSessionUser } from '@/lib/auth'
import { assertSameOrigin, enforceRateLimit } from '@/lib/http'
import { STORE_COVERS } from '@/lib/store-covers'
import { recordAudit } from '@/server/modules/audit/service'
import { buildSessionRbac } from '@/server/modules/rbac/service'

// PATCH /api/seller/profile — store-profile self-service (STAB-8).
// The signed-in SELLER edits their own storefront scalars: store name, bio
// and the curated storefront cover. Field semantics: undefined = not sent
// (leave untouched); storeCover null/'' = clear back to the default gradient;
// any other value must be an id from the curated STORE_COVERS set.

const patchSchema = z.object({
  storeName: z
    .string()
    .trim()
    .min(2, 'Store name must be at least 2 characters')
    .max(80, 'Store name must be at most 80 characters')
    .optional(),
  storeBio: z.preprocess(
    (v) => (v === '' ? null : v),
    z
      .string()
      .trim()
      .max(2000, 'Store bio must be at most 2000 characters')
      .nullable()
      .optional()
  ),
  storeCover: z.preprocess(
    (v) => (v === '' ? null : v),
    z.string().nullable().optional()
  ),
})

export async function PATCH(req: NextRequest) {
  try {
    const csrf = assertSameOrigin(req)
    if (csrf) return csrf

    const user = await getSessionUser()
    if (!user) return NextResponse.json({ error: 'Please sign in first' }, { status: 401 })
    if (user.role !== 'SELLER')
      return NextResponse.json({ error: 'Seller account required' }, { status: 403 })

    // Same per-user policy as /api/auth/me PATCH: profile edits are cheap but
    // should not be hammerable (picker spam / scraping damping).
    const rl = enforceRateLimit(req, 'sellerProfileUpdate', { limit: 20, windowMs: 10 * 60_000 }, user.id)
    if (rl) return rl

    let body: unknown
    try {
      body = await req.json()
    } catch {
      return NextResponse.json({ error: 'Expected a JSON body' }, { status: 400 })
    }

    const parsed = patchSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message ?? 'Invalid input' },
        { status: 400 }
      )
    }
    const { storeName, storeBio, storeCover } = parsed.data

    // The cover must resolve to a curated entry — arbitrary ids/URLs are
    // rejected so the storefront never renders an unvetted image.
    if (storeCover !== undefined && storeCover !== null && !STORE_COVERS.some((c) => c.id === storeCover)) {
      return NextResponse.json({ error: 'Unknown cover' }, { status: 400 })
    }

    if (storeName === undefined && storeBio === undefined && storeCover === undefined) {
      return NextResponse.json(
        { error: 'Nothing to update — send storeName, storeBio or storeCover' },
        { status: 400 }
      )
    }

    const updated = await db.user.update({
      where: { id: user.id },
      data: {
        ...(storeName !== undefined ? { storeName } : {}),
        ...(storeBio !== undefined ? { storeBio } : {}),
        ...(storeCover !== undefined ? { storeCover } : {}),
      },
    })

    await recordAudit({
      actorId: user.id,
      actorType: 'USER',
      action: 'SELLER_PROFILE_UPDATED',
      entityType: 'User',
      entityId: user.id,
      summary: `Seller profile updated: ${updated.email}`,
      metadata: {
        fields: [
          ...(storeName !== undefined ? ['storeName'] : []),
          ...(storeBio !== undefined ? ['storeBio'] : []),
          ...(storeCover !== undefined ? ['storeCover'] : []),
        ],
      },
    })

    // Same session-user shape as /api/auth/me so the client can swap its
    // cached user 1:1 after a save.
    const rbac = await buildSessionRbac(updated)
    return NextResponse.json({ user: toSessionUser(updated, rbac) })
  } catch (err) {
    console.error('seller profile PATCH error', err)
    return NextResponse.json({ error: 'Could not update your store profile' }, { status: 500 })
  }
}
