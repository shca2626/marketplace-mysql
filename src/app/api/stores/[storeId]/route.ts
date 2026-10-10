import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { resolveAuthzContext } from '@/server/authz/context'
import { updateStore, archiveStore, CatalogServiceError } from '@/server/modules/catalog/service'
import { assertSameOrigin } from '@/lib/http'

const updateSchema = z.object({
  organizationId: z.string().min(1),
  name: z.string().trim().min(2).max(80).optional(),
  description: z.string().trim().max(2000).optional().nullable(),
  city: z.string().trim().max(80).optional().nullable(),
  phone: z.string().trim().max(30).optional().nullable(),
  logoUrl: z.string().trim().max(500).optional().nullable(),
  isActive: z.boolean().optional(),
  archive: z.boolean().optional(),
})

export async function PATCH(req: NextRequest, ctxParams: { params: Promise<{ storeId: string }> }) {
  const csrf = assertSameOrigin(req)
  if (csrf) return csrf
  const ctx = await resolveAuthzContext()
  if (ctx.error) {
    return NextResponse.json({ error: ctx.error.message, code: ctx.error.reason }, { status: ctx.error.status })
  }
  try {
    const { storeId } = await ctxParams.params
    const parsed = updateSchema.safeParse(await req.json())
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'Invalid input' }, { status: 400 })
    }
    const { organizationId, archive, ...fields } = parsed.data
    if (archive) {
      await archiveStore(ctx.user.id, organizationId, storeId)
      return NextResponse.json({ ok: true, archived: true })
    }
    const store = await updateStore(ctx.user.id, organizationId, storeId, fields)
    return NextResponse.json({ store })
  } catch (err) {
    if (err instanceof CatalogServiceError) {
      return NextResponse.json({ error: err.message, code: 'DENIED' }, { status: err.status })
    }
    console.error('store PATCH error', err)
    return NextResponse.json({ error: 'Failed to update store' }, { status: 500 })
  }
}
