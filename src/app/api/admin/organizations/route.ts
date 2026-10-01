import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { requireAdmin } from '@/server/guards'
import {
  adminCreateOrganization,
  adminListOrganizations,
  OrgServiceError,
} from '@/server/modules/organizations/service'

// GET /api/admin/organizations — every business account (filterable)
export async function GET(req: NextRequest) {
  const { error } = await requireAdmin('orgs.view')
  if (error) return error
  try {
    const { searchParams } = new URL(req.url)
    const organizations = await adminListOrganizations({
      status: searchParams.get('status') ?? undefined,
      search: searchParams.get('search') ?? undefined,
    })
    return NextResponse.json({ organizations })
  } catch (err) {
    if (err instanceof OrgServiceError) {
      return NextResponse.json({ error: err.message }, { status: err.status })
    }
    console.error('admin orgs GET error', err)
    return NextResponse.json({ error: 'Failed to load organizations' }, { status: 500 })
  }
}
import { assertSameOrigin } from '@/lib/http'

const createSchema = z.object({
  name: z.string().trim().min(2).max(160),
  orgType: z.enum(['COMPANY', 'BANK', 'MFI', 'EWALLET']).optional(),
  legalName: z.string().max(200).nullable().optional(),
  taxId: z.string().max(60).nullable().optional(),
  registrationNumber: z.string().max(60).nullable().optional(),
  industry: z.string().max(80).nullable().optional(),
  website: z.string().max(255).nullable().optional(),
  status: z.enum(['PENDING_VERIFICATION', 'ACTIVE']).default('ACTIVE'),
  creditTermsDays: z.number().int().min(0).max(180).optional(),
  creditLimit: z.number().min(0).max(10_000_000).optional(),
  notes: z.string().max(5000).nullable().optional(),
  ownerEmail: z.string().email().optional(),
})

// POST /api/admin/organizations — create a business account on behalf of the platform
export async function POST(req: NextRequest) {
  const csrf = assertSameOrigin(req)
  if (csrf) return csrf

  const { user, error } = await requireAdmin('orgs.view')
  if (error) return error
  try {
    const body = await req.json()
    const parsed = createSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message ?? 'Invalid input' },
        { status: 400 }
      )
    }
    const organization = await adminCreateOrganization(user!.id, parsed.data)
    return NextResponse.json({ organization })
  } catch (err) {
    if (err instanceof OrgServiceError) {
      return NextResponse.json({ error: err.message }, { status: err.status })
    }
    console.error('admin org POST error', err)
    return NextResponse.json({ error: 'Failed to create organization' }, { status: 500 })
  }
}
