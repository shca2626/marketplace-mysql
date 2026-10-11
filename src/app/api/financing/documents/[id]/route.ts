import { NextResponse, type NextRequest } from 'next/server'
import { requireUser } from '@/server/guards'
import { financingError } from '@/lib/financing-api'
import { getDocument } from '@/server/modules/financing/documents'

// GET /api/financing/documents/[id] — one vault document (owner, org
// OWNER/ADMIN or platform admin — service-guarded).
export async function GET(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { user, error } = await requireUser()
  if (error) return error
  try {
    const { id } = await ctx.params
    const document = await getDocument(user, id)
    return NextResponse.json({ document })
  } catch (err) {
    return financingError(err, 'load the document')
  }
}
