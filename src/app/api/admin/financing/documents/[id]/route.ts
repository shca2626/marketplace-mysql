import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { requireAdmin } from '@/server/guards'
import { assertSameOrigin, enforceRateLimit } from '@/lib/http'
import {
  verifyAccountDocument,
  rejectAccountDocument,
} from '@/server/modules/financing/documents'
import { FinancingError } from '@/server/modules/financing/shared'

// POST /api/admin/financing/documents/[id] — platform verification of a vault
// document (verify ONCE, reused everywhere — DP-27). REJECT requires a note.
const schema = z.discriminatedUnion('action', [
  z.object({ action: z.literal('VERIFY'), note: z.string().trim().max(500).optional() }),
  z.object({ action: z.literal('REJECT'), note: z.string().trim().min(3).max(500) }),
])

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { user, error } = await requireAdmin('financing.documents.verify')
  if (error) return error
  const csrf = assertSameOrigin(req)
  if (csrf) return csrf
  const rl = enforceRateLimit(req, 'admin:document-verify', { limit: 120, windowMs: 60_000 }, user.id)
  if (rl) return rl

  try {
    const { id } = await ctx.params
    const parsed = schema.safeParse(await req.json())
    if (!parsed.success) {
      return NextResponse.json({ error: 'Invalid verification', details: parsed.error.flatten() }, { status: 400 })
    }
    const document =
      parsed.data.action === 'VERIFY'
        ? await verifyAccountDocument(user.id, id, parsed.data.note)
        : await rejectAccountDocument(user.id, id, parsed.data.note)
    return NextResponse.json({ document })
  } catch (err) {
    if (err instanceof FinancingError) {
      return NextResponse.json({ error: err.message }, { status: err.status })
    }
    console.error('admin document verify error', err)
    return NextResponse.json({ error: 'Failed to verify the document' }, { status: 500 })
  }
}
