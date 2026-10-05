import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/server/guards'
import { listWhatsAppMessages } from '@/server/modules/whatsapp/admin'

// GET /api/admin/whatsapp/messages?take=50 — the outbound WhatsApp ledger
// (OTP sends, notification mirrors, admin tests — with DEV-fallback rows).
export async function GET(req: NextRequest) {
  const { error } = await requireAdmin('whatsapp.view')
  if (error) return error
  try {
    const take = parseInt(req.nextUrl.searchParams.get('take') || '50') || 50
    const messages = await listWhatsAppMessages(take)
    return NextResponse.json({ messages })
  } catch (err) {
    console.error('admin whatsapp messages GET error', err)
    return NextResponse.json({ error: 'Failed to load WhatsApp messages' }, { status: 500 })
  }
}
