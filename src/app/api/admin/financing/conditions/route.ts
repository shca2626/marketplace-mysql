import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { requireAdmin } from '@/server/guards'
import { assertSameOrigin, enforceRateLimit } from '@/lib/http'
import {
  listVisibleConditionTemplates,
  createConditionTemplate,
} from '@/server/modules/financing/conditions'
import { FinancingError } from '@/server/modules/financing/shared'

// GET /api/admin/financing/conditions — the GENERAL library (platform's
// shared conditions — R-5). Admin role sees the full GENERAL scope.
export async function GET(req: NextRequest) {
  const { user, error } = await requireAdmin()
  if (error) return error
  try {
    const sp = req.nextUrl.searchParams
    const templates = await listVisibleConditionTemplates(user.id, user.role, {
      search: sp.get('q') ?? sp.get('search') ?? undefined,
      conditionType: sp.get('conditionType') ?? undefined,
      includeInactive: sp.get('includeInactive') === 'true',
    })
    return NextResponse.json({ templates })
  } catch (err) {
    if (err instanceof FinancingError) {
      return NextResponse.json({ error: err.message }, { status: err.status })
    }
    console.error('admin conditions GET error', err)
    return NextResponse.json({ error: 'Failed to load the condition library' }, { status: 500 })
  }
}

const DOCUMENT_TYPES = [
  'NATIONAL_ID', 'PASSPORT', 'RESIDENCE_PERMIT', 'COMMERCIAL_REG', 'TAX_CARD',
  'BUSINESS_LICENSE', 'BANK_STATEMENT', 'FINANCIAL_STATEMENT', 'PROOF_OF_ADDRESS',
  'GUARANTEE_DOC', 'FEASIBILITY_STUDY', 'INVOICE', 'PURCHASE_ORDER', 'PROJECT_FILE', 'OTHER',
] as const
const PROFILE_FIELD_KEYS = [
  'user.phone', 'user.identityNumber', 'user.dateOfBirth',
  'org.taxId', 'org.registrationNumber', 'org.industry',
] as const

const createSchema = z
  .object({
    conditionType: z.enum([
      'DOCUMENT', 'PROFILE_FIELD', 'DECLARATION', 'TEXT', 'NUMBER', 'DATE', 'SELECT', 'MULTI_SELECT',
    ]),
    title: z.string().trim().min(3).max(160),
    code: z.string().trim().max(32).nullable().optional(),
    description: z.string().trim().max(1000).nullable().optional(),
    profileFieldKey: z.enum(PROFILE_FIELD_KEYS).nullable().optional(),
    documentType: z.enum(DOCUMENT_TYPES).nullable().optional(),
    validationMin: z.number().nullable().optional(),
    validationMax: z.number().nullable().optional(),
    validityMonths: z.number().int().min(1).max(120).nullable().optional(),
    isRepeatable: z.boolean().optional(),
    options: z.array(z.string().trim().min(1).max(120)).max(20).optional(),
  })
  .refine((v) => v.conditionType !== 'DOCUMENT' || !!v.documentType, {
    message: 'DOCUMENT conditions need a documentType',
  })
  .refine((v) => v.conditionType !== 'PROFILE_FIELD' || !!v.profileFieldKey, {
    message: 'PROFILE_FIELD conditions need a profileFieldKey',
  })
  .refine(
    (v) => (v.conditionType !== 'SELECT' && v.conditionType !== 'MULTI_SELECT') || (v.options?.length ?? 0) >= 2,
    { message: 'SELECT/MULTI_SELECT conditions need at least two options' }
  )

// POST /api/admin/financing/conditions — create a GENERAL library condition
// (admin-only scope — DP-24).
export async function POST(req: NextRequest) {
  const { user, error } = await requireAdmin()
  if (error) return error
  const csrf = assertSameOrigin(req)
  if (csrf) return csrf
  const rl = enforceRateLimit(req, 'admin:conditions', { limit: 60, windowMs: 60_000 }, user.id)
  if (rl) return rl

  try {
    const parsed = createSchema.safeParse(await req.json())
    if (!parsed.success) {
      return NextResponse.json({ error: 'Invalid condition payload', details: parsed.error.flatten() }, { status: 400 })
    }
    const template = await createConditionTemplate({ id: user.id, role: user.role }, {
      scope: 'GENERAL',
      ...parsed.data,
    })
    return NextResponse.json({ template }, { status: 201 })
  } catch (err) {
    if (err instanceof FinancingError) {
      return NextResponse.json({ error: err.message }, { status: err.status })
    }
    console.error('admin conditions POST error', err)
    return NextResponse.json({ error: 'Failed to create the condition' }, { status: 500 })
  }
}
