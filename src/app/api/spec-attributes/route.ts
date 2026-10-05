import { NextRequest, NextResponse } from 'next/server'
import { requireUser } from '@/server/guards'
import { listActiveSpecAttributes } from '@/server/modules/kyc/spec-attributes'

// GET /api/spec-attributes?categoryId= — the ACTIVE attribute set a seller
// fills for a category: the category's own rows plus every global row,
// position-ordered (category rows first). Any signed-in user (sellers filling
// the product form; read-only dictionary). 404 when the category doesn't exist.
export async function GET(req: NextRequest) {
  const { error } = await requireUser()
  if (error) return error
  try {
    const categoryId = req.nextUrl.searchParams.get('categoryId') || ''
    if (!categoryId) {
      return NextResponse.json({ error: 'categoryId is required' }, { status: 400 })
    }
    const attributes = await listActiveSpecAttributes(categoryId)
    return NextResponse.json({ attributes })
  } catch (err) {
    console.error('spec attributes GET error', err)
    return NextResponse.json({ error: 'Failed to load spec attributes' }, { status: 500 })
  }
}
