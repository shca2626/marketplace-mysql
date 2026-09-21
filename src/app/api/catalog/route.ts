import { NextResponse } from 'next/server'
import { CATEGORY_CATALOG, CONDITIONS } from '@/lib/catalog/definitions'
import { PRODUCT_CONDITIONS } from '@/lib/catalog/validation'

// GET /api/catalog — category attribute definitions for dynamic forms
// and filters. Public: the seller form + catalog filters render from this.
export async function GET() {
  try {
    return NextResponse.json({
      categories: CATEGORY_CATALOG,
      conditions: CONDITIONS,
      conditionValues: PRODUCT_CONDITIONS,
    })
  } catch (err) {
    console.error('catalog GET error', err)
    return NextResponse.json({ error: 'Failed to load catalog definitions' }, { status: 500 })
  }
}
