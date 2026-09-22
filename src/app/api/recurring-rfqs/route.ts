import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { requireUser } from '@/server/guards'
import { assertSameOrigin, enforceRateLimit } from '@/lib/http'
import {
  createSchedule,
  listMySchedules,
  RecurringServiceError,
  type ScheduleLineInput,
} from '@/server/modules/rfq/recurring'

// GET /api/recurring-rfqs — my schedules (nudges the lazy spawn engine too)
export async function GET() {
  const { user, error } = await requireUser()
  if (error) return error
  try {
    const schedules = await listMySchedules(user!.id)
    return NextResponse.json({ schedules })
  } catch (err) {
    if (err instanceof RecurringServiceError) {
      return NextResponse.json({ error: err.message }, { status: err.status })
    }
    console.error('recurring GET error', err)
    return NextResponse.json({ error: 'Failed to load schedules' }, { status: 500 })
  }
}

const lineSchema = z.object({
  productId: z.string().optional().nullable(),
  productName: z.string().trim().max(200).optional().nullable(),
  sku: z.string().trim().max(80).optional().nullable(),
  variantId: z.string().optional().nullable(),
  quantity: z.number().int().min(1).max(1_000_000),
  targetPrice: z.number().min(0).max(1_000_000).optional().nullable(),
  notes: z.string().trim().max(2000).optional().nullable(),
})

const createSchema = z
  .object({
    title: z.string().trim().max(160).optional().nullable(),
    description: z.string().trim().max(5000).optional().nullable(),
    organizationId: z.string().optional().nullable(),
    frequency: z.enum(['WEEKLY', 'BIWEEKLY', 'MONTHLY', 'QUARTERLY', 'CUSTOM']),
    intervalDays: z.number().int().min(1).max(365).optional().nullable(),
    startInDays: z.number().int().min(0).max(365).optional().nullable(),
    lines: z.array(lineSchema).min(1, 'Add at least one item').max(50),
  })

// POST /api/recurring-rfqs — create a schedule from a line snapshot
export async function POST(req: NextRequest) {
  const { user, error } = await requireUser()
  if (error) return error
  const csrf = assertSameOrigin(req)
  if (csrf) return csrf
  const rl = enforceRateLimit(req, 'recurring:create', { limit: 20, windowMs: 60_000 })
  if (rl) return rl

  try {
    const parsed = createSchema.safeParse(await req.json())
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message ?? 'Invalid schedule' },
        { status: 400 }
      )
    }
    const { title, description, organizationId, frequency, intervalDays, startInDays, lines } = parsed.data
    const schedule = await createSchedule(user!.id, {
      title,
      description,
      organizationId,
      frequency,
      intervalDays,
      startInDays,
      lines: lines as ScheduleLineInput[],
    })
    return NextResponse.json({ schedule }, { status: 201 })
  } catch (err) {
    if (err instanceof RecurringServiceError) {
      return NextResponse.json({ error: err.message }, { status: err.status })
    }
    console.error('recurring POST error', err)
    return NextResponse.json({ error: 'Failed to create schedule' }, { status: 500 })
  }
}
