import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { resolveAuthzContext } from '@/server/authz/context'
import { listOrgStores, createStore, CatalogServiceError, getStoreSettings } from '@/server/modules/catalog/service'
import { assertSameOrigin } from '@/lib/http'

export const dynamic = 'force-dynamic'

const createSchema = z.object({
  organizationId: z.string().min(1),
  name: z.string().trim().min(2).max(80),
  description: z.string().trim().max(2000).optional().nullable(),
  city: z.string().trim().max(80).optional().nullable(),
  phone: z.string().trim().max(30).optional().nullable(),
  logoUrl: z.string().trim().max(500).optional().nullable(),
})

// GET /api/stores?organizationId=… — org stores (authz-checked)
export async function GET(req: NextRequest) {
  const ctx = await resolveAuthzContext()
  if (ctx.error) {
    return NextResponse.json({ error: ctx.error.message, code: ctx.error.reason }, { status: ctx.error.status })
  }
  const organizationId = req.nextUrl.searchParams.get('organizationId') || ''
  if (!organizationId) {
    // No org specified: return the platform store settings (multi-store status)
    return NextResponse.json({ settings: await getStoreSettings(), stores: [] })
  }
  const member = ctx.orgs.find((o) => o.id === organizationId)
  if (!member) {
    return NextResponse.json({ error: 'You are not a member of that organization', code: 'NO_MEMBERSHIP' }, { status: 403 })
  }
  try {
    const stores = await listOrgStores(ctx.user.id, organizationId)
    return NextResponse.json({ stores, settings: await getStoreSettings() })
  } catch (err) {
    if (err instanceof CatalogServiceError) {
      return NextResponse.json({ error: err.message, code: 'DENIED' }, { status: err.status })
    }
    console.error('stores GET error', err)
    return NextResponse.json({ error: 'Failed to load stores' }, { status: 500 })
  }
}

// POST /api/stores — create (multi-store limit enforced transactionally)
export async function POST(req: NextRequest) {
  const csrf = assertSameOrigin(req)
  if (csrf) return csrf
  const ctx = await resolveAuthzContext()
  if (ctx.error) {
    return NextResponse.json({ error: ctx.error.message, code: ctx.error.reason }, { status: ctx.error.status })
  }
  try {
    const parsed = createSchema.safeParse(await req.json())
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'Invalid input' }, { status: 400 })
    }
    const store = await createStore(ctx.user.id, parsed.data.organizationId, parsed.data)
    return NextResponse.json({ store }, { status: 201 })
  } catch (err) {
    if (err instanceof CatalogServiceError) {
      return NextResponse.json({ error: err.message, code: 'DENIED' }, { status: err.status })
    }
    console.error('stores POST error', err)
    return NextResponse.json({ error: 'Failed to create store' }, { status: 500 })
  }
}
