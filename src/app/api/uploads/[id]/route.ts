import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getSessionUser } from '@/lib/auth'
import { assertSameOrigin } from '@/lib/http'
import { deleteRenditions } from '@/lib/storage/image-pipeline'
import { getStorage } from '@/lib/storage'

// DELETE /api/uploads/[id] — remove an uploaded asset (owner or ADMIN).
// Refuses with 409 while the asset is referenced by a product (images JSON or
// a variant image) or appears in past order snapshots — those URLs must keep
// resolving. Files are removed idempotently.
export async function DELETE(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const csrf = assertSameOrigin(req)
  if (csrf) return csrf

  const user = await getSessionUser()
  if (!user) return NextResponse.json({ error: 'Please sign in first' }, { status: 401 })

  const { id } = await ctx.params
  const asset = await db.mediaAsset.findUnique({ where: { id } })
  if (!asset) return NextResponse.json({ error: 'Asset not found' }, { status: 404 })

  if (user.role !== 'ADMIN' && asset.uploadedById !== user.id) {
    return NextResponse.json({ error: 'You can only delete your own uploads' }, { status: 403 })
  }

  // Reference checks — block deletes that would break live or snapshot URLs.
  const referencedBy = await db.product.findFirst({
    where: { OR: [{ images: { contains: asset.key } }, { variants: { some: { image: { contains: asset.key } } } }] },
    select: { id: true },
  })
  if (referencedBy) {
    return NextResponse.json(
      { error: 'This image is used by one of your products — remove it there first' },
      { status: 409 },
    )
  }
  const orderedWith = await db.orderItem.findFirst({
    where: { image: { contains: asset.key } },
    select: { id: true },
  })
  if (orderedWith) {
    return NextResponse.json(
      { error: 'This image appears in past order records and cannot be deleted' },
      { status: 409 },
    )
  }

  let variants: Record<string, string> = {}
  try {
    variants = asset.variants ? JSON.parse(asset.variants) : {}
  } catch {
    variants = {}
  }
  await deleteRenditions(variants)
  await db.mediaAsset.delete({ where: { id } })

  return NextResponse.json({ ok: true, id })
}
