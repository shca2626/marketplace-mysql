import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { requireAdmin } from '@/server/guards'
import { assertSameOrigin } from '@/lib/http'
import { recordAudit } from '@/server/modules/audit/service'
import {
  createSenderAndStartPairing,
  listSenders,
  normalizeSenderPhone,
  WhatsAppAdminError,
} from '@/server/modules/whatsapp/admin'

const createSchema = z.object({
  label: z.string().trim().min(2).max(60),
  phoneNumber: z.string().trim().min(7).max(20),
  isDefault: z.boolean().optional(),
})

// GET /api/admin/whatsapp/senders — every sending line with pairing state.
export async function GET() {
  const { error } = await requireAdmin('whatsapp.view')
  if (error) return error
  try {
    const senders = await listSenders()
    return NextResponse.json({ senders })
  } catch (err) {
    console.error('admin whatsapp senders GET error', err)
    return NextResponse.json({ error: 'Failed to load WhatsApp senders' }, { status: 500 })
  }
}

// POST /api/admin/whatsapp/senders — add a sender and begin phone-number
// pairing. Any international number; the response carries the 8-char pairing
// code the admin types into WhatsApp → Linked devices → Link with phone number.
export async function POST(req: NextRequest) {
  const csrf = assertSameOrigin(req)
  if (csrf) return csrf

  const { user, error } = await requireAdmin('whatsapp.manage')
  if (error) return error
  try {
    const body = await req.json()
    const parsed = createSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message ?? 'Invalid input' },
        { status: 400 }
      )
    }
    const phoneNumber = normalizeSenderPhone(parsed.data.phoneNumber)
    if (!phoneNumber) {
      return NextResponse.json(
        { error: 'Enter a valid international phone number, e.g. +967 777 555 888' },
        { status: 400 }
      )
    }

    const result = await createSenderAndStartPairing({
      label: parsed.data.label,
      phoneNumber,
      isDefault: parsed.data.isDefault ?? false,
    })

    await recordAudit({
      actorId: user.id,
      actorType: 'ADMIN',
      action: 'WHATSAPP_SENDER_CREATED',
      entityType: 'WhatsAppSender',
      entityId: result.sender.id,
      summary: `WhatsApp sender "${result.sender.label}" (${phoneNumber}) added — pairing started`,
      metadata: { phoneNumber, pairingIssued: !!result.pairingCode },
    })

    return NextResponse.json(result, { status: 201 })
  } catch (err) {
    if (err instanceof WhatsAppAdminError) {
      return NextResponse.json({ error: err.message }, { status: err.status })
    }
    console.error('admin whatsapp senders POST error', err)
    return NextResponse.json({ error: 'Failed to add WhatsApp sender' }, { status: 500 })
  }
}
