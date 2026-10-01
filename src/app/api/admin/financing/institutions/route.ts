import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { requireAdmin } from '@/server/guards'
import { assertSameOrigin, enforceRateLimit } from '@/lib/http'
import { adminCreateInstitution, adminListInstitutions } from '@/server/modules/financing/services'
import { FinancingError } from '@/server/modules/financing/shared'

// GET /api/admin/financing/institutions — financier orgs (BANK/MFI/EWALLET,
// with OR without a profile) + stats (services, forwarded requests, live
// accreditations, fees).
export async function GET(req: NextRequest) {
  const { error } = await requireAdmin('financing.institutions.manage')
  if (error) return error
  try {
    const sp = req.nextUrl.searchParams
    const institutions = await adminListInstitutions({
      search: sp.get('q') ?? sp.get('search') ?? undefined,
      status: sp.get('status') ?? undefined,
    })
    return NextResponse.json({ institutions })
  } catch (err) {
    console.error('admin institutions error', err)
    return NextResponse.json({ error: 'Failed to load the institutions' }, { status: 500 })
  }
}

// POST /api/admin/financing/institutions — create an institution: either
// activate an existing BANK/MFI/EWALLET org (one-click "Activate") or create
// the org + its FinancierProfile with the admin-provided facts (FIN-002).
const factsFields = {
  licenseNumber: z.string().trim().max(80).nullish(),
  regulator: z.string().trim().max(120).nullish(),
  minTicket: z.number().min(0).nullish(),
  maxTicket: z.number().min(0).nullish(),
  contactEmail: z.string().trim().email('Enter a valid contact email').max(160).nullish(),
  contactPhone: z.string().trim().max(40).nullish(),
  about: z.string().trim().max(2000).nullish(),
  website: z
    .string()
    .trim()
    .url('Enter a valid website URL')
    .max(255)
    .nullish()
    .or(z.literal('')),
}

const createSchema = z
  .object({
    organizationId: z.string().trim().min(1).optional(),
    name: z.string().trim().min(2, 'Institution name must be at least 2 characters').max(160).optional(),
    orgType: z.enum(['BANK', 'MFI', 'EWALLET']).optional(),
    ownerEmail: z.string().trim().email('Enter a valid owner email').optional(),
    ...factsFields,
  })
  .refine((d) => d.organizationId || (d.name && d.orgType), {
    message: 'Pick an existing organization or provide a name and type for the new one',
  })

export async function POST(req: NextRequest) {
  const csrf = assertSameOrigin(req)
  if (csrf) return csrf
  const { user, error } = await requireAdmin('financing.institutions.manage')
  if (error) return error
  const rl = enforceRateLimit(req, 'admin:institution-create', { limit: 20, windowMs: 60_000 }, user.id)
  if (rl) return rl

  try {
    const body = await req.json()
    const parsed = createSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'Invalid input' }, { status: 400 })
    }
    const institution = await adminCreateInstitution(user.id, parsed.data)
    return NextResponse.json({ institution }, { status: 201 })
  } catch (err) {
    if (err instanceof FinancingError) {
      return NextResponse.json({ error: err.message }, { status: err.status })
    }
    console.error('admin institution create error', err)
    return NextResponse.json({ error: 'Failed to create the institution' }, { status: 500 })
  }
}
