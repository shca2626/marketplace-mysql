import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { requireUser } from '@/server/guards'
import { createOrganization, listMyOrganizations, OrgServiceError } from '@/server/modules/organizations/service'
import { assertSameOrigin } from '@/lib/http'

const createOrgSchema = z.object({
  name: z.string().trim().min(2, 'Business name must be at least 2 characters').max(120),
  legalName: z.string().trim().max(160).optional().nullable(),
  taxId: z.string().trim().max(50).optional().nullable(),
  registrationNumber: z.string().trim().max(50).optional().nullable(),
  industry: z.string().trim().max(80).optional().nullable(),
  website: z.string().trim().url('Enter a valid URL').max(200).optional().nullable().or(z.literal('')),
})

// GET /api/organizations — my business accounts (with my role in each)
export async function GET() {
  const { user, error } = await requireUser()
  if (error) return error
  try {
    const organizations = await listMyOrganizations(user!.id)
    return NextResponse.json({ organizations })
  } catch (err) {
    console.error('organizations GET error', err)
    return NextResponse.json({ error: 'Failed to load organizations' }, { status: 500 })
  }
}

// POST /api/organizations — register a business account (requester becomes OWNER)
export async function POST(req: NextRequest) {
  const csrf = assertSameOrigin(req)
  if (csrf) return csrf

  const { user, error } = await requireUser()
  if (error) return error
  try {
    const body = await req.json()
    const parsed = createOrgSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'Invalid input' }, { status: 400 })
    }
    const organization = await createOrganization(user!.id, parsed.data)
    return NextResponse.json({ organization }, { status: 201 })
  } catch (err) {
    if (err instanceof OrgServiceError) {
      return NextResponse.json({ error: err.message }, { status: err.status })
    }
    console.error('organizations POST error', err)
    return NextResponse.json({ error: 'Failed to create organization' }, { status: 500 })
  }
}
