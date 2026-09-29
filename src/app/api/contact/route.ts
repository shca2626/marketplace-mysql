import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { db } from '@/lib/db'
import { rateLimit } from '@/lib/rate-limit'
import { clientIp } from '@/lib/http'

// POST /api/contact — public website contact form + newsletter signups
// (pagedesign.md §5.5). Rate-limited, validated, persisted for a future
// admin inbox; email notifications can layer on via the digest provider.

const TOPICS = ['order', 'funding', 'selling', 'partnership', 'newsletter', 'general'] as const

const bodySchema = z.object({
  name: z.string().trim().min(2, 'Please tell us your name').max(80),
  email: z.string().trim().email('Enter a valid email').max(160),
  topic: z.enum(TOPICS).default('general'),
  message: z.string().trim().max(2000).optional().default(''),
})

export async function POST(req: NextRequest) {
  try {
    // Public endpoint: strict sliding-window limit (5 submissions / 10 min / IP)
    const limit = rateLimit(`contact:${clientIp(req)}`, 5, 10 * 60 * 1000)
    if (!limit.ok) {
      return NextResponse.json(
        { error: `Too many messages. Please try again in ${limit.retryAfterSec}s.` },
        { status: 429, headers: { 'Retry-After': String(limit.retryAfterSec) } }
      )
    }

    let body: unknown
    try {
      body = await req.json()
    } catch {
      return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
    }

    const parsed = bodySchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'Invalid input' }, { status: 400 })
    }

    const { name, email, topic, message } = parsed.data

    // Newsletter signups only need an email — keep the row meaningful.
    if (topic === 'newsletter' && !message) {
      await db.contactMessage.create({
        data: { name, email, topic, message: 'Newsletter subscription from the website footer/homepage.' },
      })
      return NextResponse.json({ ok: true, kind: 'newsletter' })
    }

    if (message.length < 10) {
      return NextResponse.json({ error: 'Please write a few words so we can help (min. 10 characters).' }, { status: 400 })
    }

    await db.contactMessage.create({ data: { name, email, topic, message } })
    return NextResponse.json({ ok: true, kind: 'contact' })
  } catch (err) {
    console.error('contact POST error', err)
    return NextResponse.json({ error: 'Failed to send message. Please try again.' }, { status: 500 })
  }
}
