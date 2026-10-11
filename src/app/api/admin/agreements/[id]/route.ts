import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { requireAdmin } from '@/server/guards'
import { AgreementError, activateTemplate, updateTemplate } from '@/server/modules/catalog/agreements'
import { assertSameOrigin, enforceRateLimit } from '@/lib/http'

const patchSchema = z.object({
  action: z.literal('activate').optional(),
  version: z.string().trim().min(1).max(32).optional(),
  title: z.string().trim().min(2).max(120).optional(),
  body: z.string().trim().min(20).max(20000).optional(),
})

// PATCH /api/admin/agreements/[id] — two intents:
//   { action: 'activate' }            make this version the ACTIVE agreement
//                                     (single-active invariant; all others flip
//                                     to draft — existing consents keep their
//                                     version)
//   { version?/title?/body? }         edit a DRAFT template (active templates
//                                     are immutable)
export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { user, error } = await requireAdmin('catalog.products.moderate')
  if (error) return error
  const csrf = assertSameOrigin(req)
  if (csrf) return csrf
  const rl = enforceRateLimit(req, 'admin:agreements', { limit: 60, windowMs: 60_000 }, user.id)
  if (rl) return rl

  try {
    const { id } = await ctx.params
    const parsed = patchSchema.safeParse(await req.json())
    if (!parsed.success)
      return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'Invalid patch' }, { status: 400 })

    if (parsed.data.action === 'activate') {
      const template = await activateTemplate(id, user.id)
      return NextResponse.json({ template })
    }

    const { version, title, body } = parsed.data
    if (!version && !title && !body)
      return NextResponse.json(
        { error: 'Provide version/title/body to edit the draft, or {"action":"activate"}' },
        { status: 400 }
      )
    const template = await updateTemplate(id, { version, title, body }, user.id)
    return NextResponse.json({ template })
  } catch (err) {
    if (err instanceof AgreementError) return NextResponse.json({ error: err.message }, { status: err.status })
    console.error('admin agreement PATCH error', err)
    return NextResponse.json({ error: 'Failed to update agreement template' }, { status: 500 })
  }
}
