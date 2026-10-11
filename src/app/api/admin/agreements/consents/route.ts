import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/server/guards'
import { AgreementError, exportConsents, searchConsents } from '@/server/modules/catalog/agreements'
import { enforceRateLimit } from '@/lib/http'

/**
 * GET /api/admin/agreements/consents — the consent ledger.
 *
 * Filters: ?templateId= &userId= &productId= &q= (product title snapshot /
 * seller name / store) &from= &to= (ISO datetime; a bare YYYY-MM-DD "to" is
 * inclusive of that whole day) &page= &pageSize=
 *
 * ?export=csv returns the SAME filtered set as a text/csv download
 * (Content-Disposition: attachment) for compliance/audit sharing.
 */
export async function GET(req: NextRequest) {
  const { user, error } = await requireAdmin('catalog.products.moderate')
  if (error) return error
  // CSV generation is heavier than a page of JSON — keep it rate-limited too
  const rl = enforceRateLimit(req, 'admin:agreement-consents', { limit: 120, windowMs: 60_000 }, user.id)
  if (rl) return rl

  try {
    const sp = req.nextUrl.searchParams
    const filters = {
      templateId: sp.get('templateId')?.trim() || null,
      userId: sp.get('userId')?.trim() || null,
      productId: sp.get('productId')?.trim() || null,
      q: sp.get('q')?.trim() || null,
      from: parseDate(sp.get('from')),
      to: parseDate(sp.get('to'), true),
      page: Math.max(1, parseInt(sp.get('page') || '1') || 1),
      pageSize: Math.min(100, Math.max(1, parseInt(sp.get('pageSize') || '25') || 25)),
    }

    if (sp.get('export') === 'csv') {
      const csv = await exportConsents(filters)
      const stamp = new Date().toISOString().slice(0, 10)
      return new NextResponse(csv, {
        headers: {
          'Content-Type': 'text/csv; charset=utf-8',
          'Content-Disposition': `attachment; filename="vendora-publication-consents-${stamp}.csv"`,
          'Cache-Control': 'no-store',
        },
      })
    }

    const result = await searchConsents(filters)
    return NextResponse.json(result)
  } catch (err) {
    if (err instanceof AgreementError) return NextResponse.json({ error: err.message }, { status: err.status })
    console.error('admin agreement consents GET error', err)
    return NextResponse.json({ error: 'Failed to load consent records' }, { status: 500 })
  }
}

/** ISO datetime / YYYY-MM-DD parsing; a bare date on the "to" side extends to
 *  end-of-day so the day itself is included. Returns null for absent/invalid. */
function parseDate(raw: string | null, endOfDay = false): Date | null {
  if (!raw) return null
  const isBareDate = /^\d{4}-\d{2}-\d{2}$/.test(raw)
  const d = new Date(isBareDate && endOfDay ? `${raw}T23:59:59.999` : raw)
  return Number.isNaN(d.getTime()) ? null : d
}
