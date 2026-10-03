import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { requireAdmin } from '@/server/guards'
import { assertSameOrigin } from '@/lib/http'
import {
  effectiveMatrix,
  listModulesForAdmin,
  ModuleServiceError,
  setModuleActivation,
} from '@/server/modules/modules/service'

// GET /api/admin/modules — the module catalog + every activation override +
// the effective matrix (what each org type / overridden org currently resolves).
export async function GET() {
  const { error } = await requireAdmin('modules.manage')
  if (error) return error
  try {
    const [modules, effective] = await Promise.all([listModulesForAdmin(), effectiveMatrix()])
    return NextResponse.json({ modules, effective })
  } catch (err) {
    console.error('admin modules GET error', err)
    return NextResponse.json({ error: 'Failed to load modules' }, { status: 500 })
  }
}

const setSchema = z.object({
  moduleKey: z.string().min(1).max(80),
  scopeType: z.enum(['PLATFORM', 'ORG_TYPE', 'ORG']),
  scopeId: z.string().max(120).default(''),
  enabled: z.boolean(),
  note: z.string().max(500).nullable().optional(),
  remove: z.boolean().optional(),
})

// POST /api/admin/modules — set or remove one activation override.
export async function POST(req: NextRequest) {
  const csrf = assertSameOrigin(req)
  if (csrf) return csrf

  const { user, error } = await requireAdmin('modules.manage')
  if (error) return error
  try {
    const parsed = setSchema.safeParse(await req.json())
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message ?? 'Invalid input' },
        { status: 400 }
      )
    }
    const { note, ...rest } = parsed.data
    const moduleView = await setModuleActivation(user!.id, { ...rest, note: note ?? undefined })
    const effective = await effectiveMatrix()
    return NextResponse.json({ module: moduleView, effective })
  } catch (err) {
    if (err instanceof ModuleServiceError) {
      return NextResponse.json({ error: err.message }, { status: err.status })
    }
    console.error('admin modules POST error', err)
    return NextResponse.json({ error: 'Failed to save module activation' }, { status: 500 })
  }
}
