// ─────────────────────────────────────────────────────────────────────────────
// PHASE3-VERIFY — one-shot E2E proof that the migrated legacy-admin routes
// now enforce canonical platform permissions:
//   • a super-admin (via platform.super-admin assignment) → allowed
//   • a plain BUYER (no platform roles) → 403 typed deny
// Fixtures are created here and cleaned up at the end. Run against dev only.
// ─────────────────────────────────────────────────────────────────────────────
import { db } from '../../src/lib/db'
import { hashPassword, createSessionToken } from '../../src/lib/auth'
import { sha256Hex } from '../../src/lib/secret-box'

const BASE = process.env.STAGING_BASE_URL ?? 'http://localhost:3000'
const PW = 'Phase3-Verify!'

const results: { id: string; ok: boolean; detail: string }[] = []
function check(id: string, ok: boolean, detail: string) {
  results.push({ id, ok, detail })
  console.log(`${ok ? '✓' : '✗'} ${id} — ${detail}`)
}

async function mkSession(user: { id: string; sessionVersion: number }): Promise<string> {
  const token = createSessionToken(user.id, user.sessionVersion)
  await db.sessionRegistry.create({
    data: {
      userId: user.id,
      tokenHash: sha256Hex(token),
      userAgent: 'phase3-verify',
      ip: '127.0.0.1',
    },
  })
  return `vendora_session=${token}`
}

async function get(path: string, cookie: string | null): Promise<{ status: number; body: string; total?: unknown }> {
  const res = await fetch(`${BASE}${path}`, {
    headers: { ...(cookie ? { cookie } : {}) },
  })
  const text = await res.text()
  let json: any = null
  try {
    json = JSON.parse(text)
  } catch {
    /* pdf / csv */
  }
  return { status: res.status, body: text.slice(0, 140), total: json?.total }
}

async function main() {
  const stamp = Date.now().toString(36)
  const superAdminRole = await db.role.findUniqueOrThrow({ where: { key: 'platform.super-admin' } })

  // Fixtures: a super-admin (canonical assignment only) + a plain buyer.
  const sa = await db.user.create({
    data: { email: `p3-sa-${stamp}@staging.invalid`, name: 'P3 SuperAdmin', password: hashPassword(PW), role: 'BUYER', status: 'ACTIVE' },
  })
  await db.userRole.create({ data: { userId: sa.id, roleId: superAdminRole.id, organizationId: '' } })
  const buyer = await db.user.create({
    data: { email: `p3-buyer-${stamp}@staging.invalid`, name: 'P3 Buyer', password: hashPassword(PW), role: 'BUYER', status: 'ACTIVE' },
  })
  const saCookie = await mkSession(sa)
  const buyerCookie = await mkSession(buyer)

  // Live data to exercise: one product (owned by a real seller — NOT us),
  // one org, one order, one quote, one media asset, one commission invoice.
  const product = await db.product.findFirstOrThrow({
    where: { seller: { email: { startsWith: 'seller' } } },
    select: { id: true, sellerId: true, title: true },
  })
  const org = await db.organization.findFirstOrThrow({ where: { orgType: 'COMPANY' }, select: { id: true, name: true } })
  const order = await db.order.findFirstOrThrow({ select: { id: true } })
  const quote = await db.quote.findFirst({ select: { id: true, number: true } })
  const invoice = await db.commissionInvoice.findFirst({ select: { id: true, number: true } })
  const asset = await db.mediaAsset.findFirst({ select: { id: true, key: true } })
  const mediaCount = await db.mediaAsset.count()

  try {
    // ── Domain 2: organizations ──────────────────────────────────────────
    {
      const a = await get(`/api/organizations/${org.id}`, saCookie)
      check('ORG-GET-SA', a.status === 200, `super-admin reads foreign org "${org.name}" → ${a.status}`)
      const b = await get(`/api/organizations/${org.id}`, buyerCookie)
      check('ORG-GET-BUYER', b.status === 403, `plain buyer refused → ${b.status}`)
    }

    // ── Domain 3: products collection + detail ──────────────────────────
    {
      const a = await get('/api/products?scope=all&limit=5', saCookie)
      check('PROD-LIST-SA', a.status === 200, `super-admin scope=all → ${a.status}`)
      const b = await get('/api/products?scope=all&limit=5', buyerCookie)
      check('PROD-LIST-BUYER', b.status === 403, `plain buyer scope=all refused → ${b.status}`)
      const c = await get(`/api/products/${product.id}`, null)
      check('PROD-DETAIL-PUBLIC', c.status === 200, `anonymous product detail → ${c.status} (${product.title})`)
    }

    // ── Domain 4: orders + commission invoice PDF ──────────────────────
    {
      const a = await get(`/api/orders/${order.id}`, saCookie)
      check('ORDER-GET-SA', a.status === 200, `super-admin (orders.view) reads order → ${a.status}`)
      const b = await get(`/api/orders/${order.id}`, buyerCookie)
      check('ORDER-GET-BUYER', b.status === 403, `uninvolved buyer refused → ${b.status}`)
      if (invoice) {
        const i = await get(`/api/admin/commission/invoices/${invoice.id}/pdf`, saCookie)
        check('INVOICE-PDF-SA', i.status === 200 && i.body.startsWith('%PDF'), `super-admin (payouts.view) invoice PDF → ${i.status}`)
      } else {
        check('INVOICE-PDF-SA', true, 'no commission invoice in DB — skipped')
      }
    }

    // ── Domain 5: quote PDF ─────────────────────────────────────────────
    if (quote) {
      const a = await get(`/api/quotes/${quote.id}/pdf`, saCookie)
      check('QUOTE-PDF-SA', a.status === 200 && a.body.startsWith('%PDF'), `super-admin (rfq.pipeline.view) quote PDF → ${a.status}`)
      const b = await get(`/api/quotes/${quote.id}/pdf`, buyerCookie)
      check('QUOTE-PDF-BUYER', b.status === 403, `uninvolved buyer refused → ${b.status}`)
    } else {
      check('QUOTE-PDF-SA', true, 'no quote in DB — skipped')
    }

    // ── Domain 8: admin stats + uploads + digest gate ──────────────────
    {
      const a = await get('/api/admin/stats', saCookie)
      check('STATS-SA', a.status === 200, `super-admin (platform.overview.view) stats → ${a.status}`)
      const b = await get('/api/admin/stats', buyerCookie)
      check('STATS-BUYER', b.status === 403, `plain buyer refused → ${b.status}`)
      const u = await get('/api/uploads?limit=60', saCookie)
      check('UPLOADS-SA', u.status === 200 && Number(u.total) === mediaCount, `super-admin sees ALL ${u.total}/${mediaCount} assets`)
      const ub = await get('/api/uploads?limit=60', buyerCookie)
      check('UPLOADS-BUYER', ub.status === 200 && Number(ub.total) === 0, `plain buyer sees only own (0) → total=${ub.total}`)
      // digest/run gate — buyer must be refused; super-admin passes the gate
      // (send a browser-like same-origin attestation for the CSRF check)
      const dr = await fetch(`${BASE}/api/admin/notifications/digest/run`, {
        method: 'POST',
        headers: { cookie: buyerCookie, 'sec-fetch-site': 'same-origin' },
      })
      check('DIGEST-BUYER', dr.status === 403, `plain buyer digest/run refused → ${dr.status}`)
      const dsa = await fetch(`${BASE}/api/admin/notifications/digest/run`, {
        method: 'POST',
        headers: { cookie: saCookie, 'sec-fetch-site': 'same-origin' },
      })
      check('DIGEST-SA', dsa.status === 200, `super-admin (notifications.digest.run) digest/run → ${dsa.status} ${(await dsa.text()).slice(0, 60)}`)
    }

    // ── seller/earnings: seller by type, platform by payouts.view ──────
    {
      const a = await get('/api/seller/earnings', saCookie)
      check('EARNINGS-SA', a.status === 200, `super-admin (payouts.view) earnings → ${a.status}`)
      const b = await get('/api/seller/earnings', buyerCookie)
      check('EARNINGS-BUYER', b.status === 403, `plain buyer (not seller, no payouts.view) refused → ${b.status}`)
    }
  } finally {
    // ── cleanup ──────────────────────────────────────────────────────────
    await db.sessionRegistry.deleteMany({ where: { userId: { in: [sa.id, buyer.id] } } })
    await db.userRole.deleteMany({ where: { userId: sa.id } })
    await db.user.deleteMany({ where: { id: { in: [sa.id, buyer.id] } } })
    console.log('── fixtures cleaned up ──')
  }

  const failed = results.filter((r) => !r.ok)
  console.log(`\n══ PHASE3-VERIFY: ${results.length - failed.length} passed, ${failed.length} failed ══`)
  if (failed.length > 0) process.exit(1)
  process.exit(0)
}

main().catch((err) => {
  console.error('phase3-verify crashed:', err)
  process.exit(1)
})
