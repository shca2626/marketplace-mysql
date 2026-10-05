import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/server/guards'
import { assertSameOrigin } from '@/lib/http'
import { recordAudit } from '@/server/modules/audit/service'
import { WhatsAppAdminError } from '@/server/modules/whatsapp/admin'
import {
  chatThreadPatchSchema,
  deleteChatThread,
  getChatThread,
  updateChatThread,
} from '@/server/modules/whatsapp/chats'

// GET /api/admin/whatsapp/chats/[id] — open a thread: full history (asc) and
// the thread is marked read for this admin (unread badge clears).
export async function GET(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { error } = await requireAdmin('whatsapp.manage')
  if (error) return error
  try {
    const { id } = await ctx.params
    const data = await getChatThread(id)
    return NextResponse.json(data)
  } catch (err) {
    if (err instanceof WhatsAppAdminError) {
      return NextResponse.json({ error: err.message }, { status: err.status })
    }
    console.error('admin whatsapp chat GET error', err)
    return NextResponse.json({ error: 'Failed to load the chat' }, { status: 500 })
  }
}

// PATCH /api/admin/whatsapp/chats/[id] — rename a thread / toggle its
// per-thread auto-reply switch (agent mode takes over when off).
export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const csrf = assertSameOrigin(req)
  if (csrf) return csrf

  const { error } = await requireAdmin('whatsapp.manage')
  if (error) return error
  try {
    const { id } = await ctx.params
    const parsed = chatThreadPatchSchema.safeParse(await req.json())
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message ?? 'Invalid input' },
        { status: 400 }
      )
    }

    const thread = await updateChatThread(id, parsed.data)
    return NextResponse.json({ thread })
  } catch (err) {
    if (err instanceof WhatsAppAdminError) {
      return NextResponse.json({ error: err.message }, { status: err.status })
    }
    console.error('admin whatsapp chat PATCH error', err)
    return NextResponse.json({ error: 'Failed to update the chat' }, { status: 500 })
  }
}

// DELETE /api/admin/whatsapp/chats/[id] — removes the thread and its messages.
export async function DELETE(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const csrf = assertSameOrigin(req)
  if (csrf) return csrf

  const { user, error } = await requireAdmin('whatsapp.manage')
  if (error) return error
  try {
    const { id } = await ctx.params
    const thread = await deleteChatThread(id)

    await recordAudit({
      actorId: user.id,
      actorType: 'ADMIN',
      action: 'WHATSAPP_CHAT_DELETED',
      entityType: 'WhatsAppChatThread',
      entityId: id,
      summary: `Chat thread "${thread.name}" deleted (${thread.source}${thread.phone ? `, ${thread.phone}` : ''})`,
    })

    return NextResponse.json({ ok: true })
  } catch (err) {
    if (err instanceof WhatsAppAdminError) {
      return NextResponse.json({ error: err.message }, { status: err.status })
    }
    console.error('admin whatsapp chat DELETE error', err)
    return NextResponse.json({ error: 'Failed to delete the chat' }, { status: 500 })
  }
}
