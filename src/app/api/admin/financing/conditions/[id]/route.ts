import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { requireAdmin } from '@/server/guards'
import { assertSameOrigin, enforceRateLimit } from '@/lib/http'
import {
  updateConditionTemplate,
  setConditionTemplateActive,
} from '@/server/modules/financing/conditions'
import { FinancingError } from '@/server/modules/financing/shared'

const DOCUMENT_TYPES = [
  'NATIONAL_ID', 'PASSPORT', 'RESIDENCE_PERMIT', 'COMMERCIAL_REG', 'TAX_CARD',
  'BUSINESS_LICENSE', 'BANK_STATEMENT', 'FINANCIAL_STATEMENT', 'PROOF_OF_ADDRESS',
  'GUARANTEE_DOC', 'FEASIBILITY_STUDY', 'INVOICE', 'PURCHASE_ORDER', 'PROJECT_FILE', 'OTHER',
] as const
const PROFILE_FIELD_KEYS = [
  'user.phone', 'user.identityNumber', 'user.dateOfBirth',
  'org.taxId', 'org.registrationNumber', 'org.industry',
] as const

const patchSchema = z.object({
  title: z.string().trim().min(3).max(160).optional(),
  code: z.string().trim().max(32).nullable().optional(),
  description: z.string().trim().max(1000).nullable().optional(),
  profileFieldKey: z.enum(PROFILE_FIELD_KEYS).nullable().optional(),
  documentType: z.enum(DOCUMENT_TYPES).nullable().optional(),
  validationMin: z.number().nullable().optional(),
  validationMax: z.number().nullable().optional(),
  validityMonths: z.number().int().min(1).max(120).nullable().optional(),
  isRepeatable: z.boolean().optional(),
  options: z.array(z.string().trim().min(1).max(120)).max(20).optional(),
  isActive: z.boolean().optional(),
})

// PATCH /api/admin/financing/conditions/[id] — update / deactivate a GENERAL
// library condition.
export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { user, error } = await requireAdmin()
  if (error) return error
  const csrf = assertSameOrigin(req)
  if (csrf) return csrf
  const rl = enforceRateLimit(req, 'admin:conditions', { limit: 60, windowMs: 60_000 }, user.id)
  if (rl) return rl

  try {
    const { id } = await ctx.params
    const parsed = patchSchema.safeParse(await req.json())
    if (!parsed.success) {
      return NextResponse.json({ error: 'Invalid condition patch', details: parsed.error.flatten() }, { status: 400 })
    }
    const { isActive, ...input } = parsed.data
    let template = await updateConditionTemplate({ id: user.id, role: user.role }, id, input)
    if (isActive !== undefined) {
      template = await setConditionTemplateActive({ id: user.id, role: user.role }, id, isActive)
    }
    return NextResponse.json({ template })
  } catch (err) {
    if (err instanceof FinancingError) {
      return NextResponse.json({ error: err.message }, { status: err.status })
    }
    console.error('admin condition PATCH error', err)
    return NextResponse.json({ error: 'Failed to update the condition' }, { status: 500 })
  }
}
