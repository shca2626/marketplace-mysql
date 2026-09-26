import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { requireUser } from '@/server/guards'
import { assertSameOrigin, enforceRateLimit } from '@/lib/http'
import {
  updateAccountDocument,
  softDeleteAccountDocument,
} from '@/server/modules/financing/documents'
import { FinancingError } from '@/server/modules/financing/shared'

// PATCH /api/documents/[id] — owner edits metadata (title/issuedAt/expiresAt).
const schema = z.object({
  title: z.string().max(200).nullable().optional(),
  issuedAt: z.string().nullable().optional(),
  expiresAt: z.string().nullable().optional(),
})

export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { user, error } = await requireUser()
  if (error) return error
  const csrf = assertSameOrigin(req)
  if (csrf) return csrf
  const rl = enforceRateLimit(req, 'documents:update', { limit: 60, windowMs: 10 * 60_000 }, user.id)
  if (rl) return rl

  try {
    const { id } = await ctx.params
    const parsed = schema.safeParse(await req.json())
    if (!parsed.success) {
      return NextResponse.json({ error: 'Invalid document metadata', details: parsed.error.flatten() }, { status: 400 })
    }
    const document = await updateAccountDocument(user.id, id, parsed.data)
    return NextResponse.json({ document })
  } catch (err) {
    if (err instanceof FinancingError) {
      return NextResponse.json({ error: err.message }, { status: err.status })
    }
    console.error('documents PATCH error', err)
    return NextResponse.json({ error: 'Failed to update the document' }, { status: 500 })
  }
}

// DELETE /api/documents/[id] — soft delete (isActive=false). Submissions that
// reference the document keep their evidence rows (R-2 history).
export async function DELETE(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { user, error } = await requireUser()
  if (error) return error
  const csrf = assertSameOrigin(req)
  if (csrf) return csrf
  const rl = enforceRateLimit(req, 'documents:delete', { limit: 30, windowMs: 10 * 60_000 }, user.id)
  if (rl) return rl

  try {
    const { id } = await ctx.params
    const result = await softDeleteAccountDocument(user.id, id)
    return NextResponse.json(result)
  } catch (err) {
    if (err instanceof FinancingError) {
      return NextResponse.json({ error: err.message }, { status: err.status })
    }
    console.error('documents DELETE error', err)
    return NextResponse.json({ error: 'Failed to remove the document' }, { status: 500 })
  }
}
