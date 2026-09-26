import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { requireUser } from '@/server/guards'
import { listRfqMessages, postRfqMessage, RfqServiceError } from '@/server/modules/rfq/service'
import { assertSameOrigin } from '@/lib/http'

const postSchema = z.object({
  body: z.string().trim().min(1, 'Message cannot be empty').max(4000),
})

// GET /api/rfqs/[id]/messages — negotiation thread (requester/admin/involved
// or line-referenced sellers).
export async function GET(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { user, error } = await requireUser()
  if (error) return error
  try {
    const { id } = await ctx.params
    const messages = await listRfqMessages(id, user!)
    return NextResponse.json({ messages })
  } catch (err) {
    if (err instanceof RfqServiceError) {
      return NextResponse.json({ error: err.message }, { status: err.status })
    }
    console.error('rfq messages GET error', err)
    return NextResponse.json({ error: 'Failed to load messages' }, { status: 500 })
  }
}

// POST /api/rfqs/[id]/messages — post to the thread (closed on terminal states).
export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const csrf = assertSameOrigin(req)
  if (csrf) return csrf

  const { user, error } = await requireUser()
  if (error) return error
  try {
    const { id } = await ctx.params
    const parsed = postSchema.safeParse(await req.json())
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message ?? 'Invalid input' },
        { status: 400 }
      )
    }
    const message = await postRfqMessage(id, user!, parsed.data.body)
    return NextResponse.json({ message }, { status: 201 })
  } catch (err) {
    if (err instanceof RfqServiceError) {
      return NextResponse.json({ error: err.message }, { status: err.status })
    }
    console.error('rfq messages POST error', err)
    return NextResponse.json({ error: 'Failed to post message' }, { status: 500 })
  }
}
