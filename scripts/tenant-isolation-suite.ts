// ─────────────────────────────────────────────────────────────────────────────
// TENANT-ISOLATION NEGATIVE SUITE (TENANT-AUDIT round) — the account-creation /
// onboarding / workspace-selection / tenant-data-isolation matrix.
//
//   bun scripts/tenant-isolation-suite.ts
//   STAGING_BASE_URL=https://staging.example bun scripts/tenant-isolation-suite.ts
//
// Complements scripts/negative-authz-suite.ts (org approvals, vault URLs, MFA)
// with the audit-round fixes + the cross-account matrix:
//
//   TI-01  F-04  VIEWER member of applicant org accepts SENT offer     → 403
//   TI-02  F-04  BUYER-role member accepts SENT offer                   → 403
//   TI-03  F-04  OWNER accepts (positive control)                       → 200 + agreement
//   TI-04  F-02  financier staff reads doc on DRAFT (unforwarded) req  → 403
//   TI-05  F-02  after platform forward the same staff CAN read        → 201 (gate opens)
//   TI-06  F-03  SUSPENDED institution staff by-id request detail      → 403
//   TI-07  F-03  suspended staff offer path                             → 403
//   TI-08  F-05  PENDING institution creates a service                 → 403
//   TI-09  F-01  User.role=ADMIN with NO RBAC → /api/admin/stats       → 403
//   TI-10  F-01  …reads a foreign financing request dossier           → 403
//   TI-11  F-01  …soft-deletes a foreign vault document                → 403
//   TI-12  F-01  …seller earnings surface                              → 403
//   TI-13  H-3   checkout with a foreign organizationId                → 403 + ZERO side effects
//   TI-14  two institutions: X staff reads Y's request by id           → 403/404
//   TI-15  two buyers: order list carries ONLY the caller's rows        → no foreign data
//   TI-16  removed member loses org access immediately                  → 403/404
//   TI-17  pending applicant sees OWN tracker (positive control)       → 200 + PENDING org
//   TI-18  denied responses leak no tenant payload (shape check)       → error text only
// ─────────────────────────────────────────────────────────────────────────────
import { assertNotProd } from './lib/assert-not-prod'
import { db } from '../src/lib/db'
import { hashPassword, createSessionToken } from '../src/lib/auth'
import { sha256Hex } from '../src/lib/secret-box'

const BASE = process.env.STAGING_BASE_URL ?? 'http://localhost:3000'
const PW = 'TenantSuite-Passw0rd!'

interface Case {
  id: string
  name: string
  expect: string
  result: 'PASS' | 'FAIL'
  detail: string
}
const results: Case[] = []

function record(id: string, name: string, expect: string, pass: boolean, detail: string) {
  results.push({ id, name, expect, result: pass ? 'PASS' : 'FAIL', detail })
  console.log(`${pass ? '✓' : '✗'} ${id} ${name}${pass ? '' : ' — ' + detail}`)
}

async function http(
  method: string,
  path: string,
  cookie: string | null,
  body?: unknown
): Promise<{ status: number; json: any }> {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: {
      ...(body ? { 'content-type': 'application/json', 'x-requested-with': 'tenant-suite' } : {}),
      ...(cookie ? { cookie } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  })
  let json: any = null
  try {
    json = await res.json()
  } catch {
    /* non-JSON */
  }
  return { status: res.status, json }
}

async function login(identifier: string): Promise<string | null> {
  const res = await fetch(`${BASE}/api/auth/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ identifier, password: PW }),
  })
  const setCookie = res.headers.get('set-cookie')
  if (!setCookie) return null
  return setCookie.split(';')[0]
}

async function mkUser(opts: { email: string; name?: string; role?: string }) {
  return db.user.create({
    data: {
      email: opts.email,
      name: opts.name ?? opts.email,
      password: hashPassword(PW),
      role: opts.role ?? 'BUYER',
      status: 'ACTIVE',
    },
  })
}

function mkOrgData(name: string, orgType: string, status: string) {
  return { name, slug: name.toLowerCase(), orgType, status }
}

async function main() {
  assertNotProd({ http: BASE })
  console.log(`── tenant-isolation negative suite → ${BASE} ──────────────`)

  const stamp = Date.now().toString(36)

  // ── fixtures ──────────────────────────────────────────────────────────────
  // Buyer org C (applicant) — OWNER + VIEWER member + BUYER-role member
  const orgC = await db.organization.create({
    data: mkOrgData(`TI-C-${stamp}`, 'COMPANY', 'ACTIVE'),
  })
  const ownerC = await mkUser({ email: `ti-owner-c-${stamp}@staging.invalid` })
  const viewerC = await mkUser({ email: `ti-viewer-c-${stamp}@staging.invalid` })
  const buyerC = await mkUser({ email: `ti-buyer-c-${stamp}@staging.invalid` })
  await db.organizationMember.create({ data: { organizationId: orgC.id, userId: ownerC.id, role: 'OWNER' } })
  await db.organizationMember.create({ data: { organizationId: orgC.id, userId: viewerC.id, role: 'VIEWER' } })
  await db.organizationMember.create({ data: { organizationId: orgC.id, userId: buyerC.id, role: 'BUYER' } })

  // Institution X (ACTIVE) — staff owner + service
  const instX = await db.organization.create({ data: mkOrgData(`TI-X-${stamp}`, 'BANK', 'ACTIVE') })
  const staffX = await mkUser({ email: `ti-staff-x-${stamp}@staging.invalid` })
  await db.organizationMember.create({ data: { organizationId: instX.id, userId: staffX.id, role: 'OWNER' } })
  const profileX = await db.financierProfile.create({ data: { organizationId: instX.id } })
  const serviceX = await db.financierService.create({
    data: {
      financierProfileId: profileX.id,
      serviceKind: 'FINANCING',
      category: 'WORKING_CAPITAL',
      name: `TI working capital ${stamp}`,
      status: 'ACTIVE',
    },
  })

  // Institution Y (ACTIVE, competitor) — for the cross-institution read
  const instY = await db.organization.create({ data: mkOrgData(`TI-Y-${stamp}`, 'MFI', 'ACTIVE') })
  const staffY = await mkUser({ email: `ti-staff-y-${stamp}@staging.invalid` })
  await db.organizationMember.create({ data: { organizationId: instY.id, userId: staffY.id, role: 'OWNER' } })
  const profileY = await db.financierProfile.create({ data: { organizationId: instY.id } })
  const serviceY = await db.financierService.create({
    data: {
      financierProfileId: profileY.id,
      serviceKind: 'FINANCING',
      category: 'WORKING_CAPITAL',
      name: `TI competitor service ${stamp}`,
      status: 'ACTIVE',
    },
  })

  // Institution Z (SUSPENDED) — for the F-03 by-id probes
  const instZ = await db.organization.create({ data: mkOrgData(`TI-Z-${stamp}`, 'BANK', 'SUSPENDED') })
  const staffZ = await mkUser({ email: `ti-staff-z-${stamp}@staging.invalid` })
  await db.organizationMember.create({ data: { organizationId: instZ.id, userId: staffZ.id, role: 'OWNER' } })
  const profileZ = await db.financierProfile.create({ data: { organizationId: instZ.id } })
  const serviceZ = await db.financierService.create({
    data: {
      financierProfileId: profileZ.id,
      serviceKind: 'FINANCING',
      category: 'WORKING_CAPITAL',
      name: `TI suspended service ${stamp}`,
      status: 'ACTIVE',
    },
  })

  // Institution W (PENDING_VERIFICATION) — for the F-05 mutation probe
  const instW = await db.organization.create({
    data: mkOrgData(`TI-W-${stamp}`, 'EWALLET', 'PENDING_VERIFICATION'),
  })
  const staffW = await mkUser({ email: `ti-staff-w-${stamp}@staging.invalid` })
  await db.organizationMember.create({ data: { organizationId: instW.id, userId: staffW.id, role: 'OWNER' } })
  await db.financierProfile.create({ data: { organizationId: instW.id } })

  // Forwarded org-scoped financing request (org C → service X) + a SENT offer
  const reqForwarded = await db.financingRequest.create({
    data: {
      number: `TIFWD-${stamp}`,
      organizationId: orgC.id,
      createdById: ownerC.id,
      serviceId: serviceX.id,
      targetType: 'WORKING_CAPITAL',
      amountRequested: 50000,
      status: 'FORWARDED_TO_FINANCIER',
      forwardedAt: new Date(),
      submittedAt: new Date(),
    },
  })
  const sentOffer = await db.financingOffer.create({
    data: {
      requestId: reqForwarded.id,
      createdById: staffX.id,
      amount: 45000,
      tenorMonths: 12,
      status: 'SENT',
      sentAt: new Date(),
      validUntil: new Date(Date.now() + 7 * 24 * 3600 * 1000),
    },
  })

  // DRAFT (never forwarded) request (org C → service X) with an attached doc
  const reqDraft = await db.financingRequest.create({
    data: {
      number: `TIDRAFT-${stamp}`,
      organizationId: orgC.id,
      createdById: ownerC.id,
      serviceId: serviceX.id,
      targetType: 'WORKING_CAPITAL',
      amountRequested: 12000,
      status: 'DRAFT',
    },
  })

  // Request on service Y (forwarded) for the cross-institution probe TI-14
  const reqY = await db.financingRequest.create({
    data: {
      number: `TIY-${stamp}`,
      organizationId: orgC.id,
      createdById: ownerC.id,
      serviceId: serviceY.id,
      targetType: 'WORKING_CAPITAL',
      amountRequested: 8000,
      status: 'FORWARDED_TO_FINANCIER',
      forwardedAt: new Date(),
      submittedAt: new Date(),
    },
  })

  // Request on service Z (forwarded, institution suspended afterwards)
  const reqZ = await db.financingRequest.create({
    data: {
      number: `TIZ-${stamp}`,
      organizationId: orgC.id,
      createdById: ownerC.id,
      serviceId: serviceZ.id,
      targetType: 'WORKING_CAPITAL',
      amountRequested: 3000,
      status: 'FORWARDED_TO_FINANCIER',
      forwardedAt: new Date(),
      submittedAt: new Date(),
    },
  })

  // Legacy-ADMIN fixture: User.role = 'ADMIN' with ZERO UserRole rows (F-01)
  const legacyAdmin = await mkUser({ email: `ti-legacy-admin-${stamp}@staging.invalid`, role: 'ADMIN' })

  // Two unrelated plain buyers (TI-15) with one order each
  const buyer1 = await mkUser({ email: `ti-b1-${stamp}@staging.invalid` })
  const buyer2 = await mkUser({ email: `ti-b2-${stamp}@staging.invalid` })
  const order1 = await db.order.create({
    data: { buyerId: buyer1.id, total: 100, status: 'PAID', paymentStatus: 'PAID', fullName: 'TI One', address: '1 St', city: 'City', country: 'US', zip: '00000' },
  })
  const order2 = await db.order.create({
    data: { buyerId: buyer2.id, total: 200, status: 'PENDING_PAYMENT', paymentStatus: 'AWAITING_PAYMENT', fullName: 'TI Two', address: '2 St', city: 'City', country: 'US', zip: '00000' },
  })

  // Vault document fixture (ownerC upload) attached to the DRAFT request
  const { processImageUpload } = await import('../src/lib/storage/image-pipeline')
  const { VAULT_NAMESPACE } = await import('../src/lib/storage/namespace')
  const sharp = (await import('sharp')).default
  const png = await sharp({ create: { width: 64, height: 64, channels: 3, background: '#445566' } }).png().toBuffer()
  const processed = await processImageUpload(png, { namespace: VAULT_NAMESPACE })
  const vaultAsset = await db.mediaAsset.create({
    data: {
      key: processed.baseKey,
      namespace: VAULT_NAMESPACE,
      originalName: 'ti-suite-fixture.png',
      mime: processed.mime,
      size: processed.originalBytes,
      width: processed.width,
      height: processed.height,
      sha256: processed.sha256,
      variants: JSON.stringify(processed.variants),
      uploadedById: ownerC.id,
    },
  })
  const draftDoc = await db.accountDocument.create({
    data: {
      userId: ownerC.id,
      organizationId: orgC.id,
      mediaId: vaultAsset.id,
      documentType: 'BANK_STATEMENT',
      status: 'PENDING',
    },
  })
  await db.requestAttachment.create({
    data: { accountDocumentId: draftDoc.id, parentType: 'FINANCING_REQUEST', parentId: reqDraft.id, kind: 'OTHER' },
  })

  const ownerCCookie = await login(`ti-owner-c-${stamp}@staging.invalid`)
  const viewerCCookie = await login(`ti-viewer-c-${stamp}@staging.invalid`)
  const buyerCCookie = await login(`ti-buyer-c-${stamp}@staging.invalid`)
  const staffXCookie = await login(`ti-staff-x-${stamp}@staging.invalid`)
  const staffYCookie = await login(`ti-staff-y-${stamp}@staging.invalid`)
  const staffZCookie = await login(`ti-staff-z-${stamp}@staging.invalid`)
  const staffWCookie = await login(`ti-staff-w-${stamp}@staging.invalid`)
  const legacyAdminCookie = await login(`ti-legacy-admin-${stamp}@staging.invalid`)
  const buyer1Cookie = await login(`ti-b1-${stamp}@staging.invalid`)

  // Fixtures created with a direct session (no login dance) where OTP rules
  // would interfere (phone-optional accounts created above DO have emails).
  const agreementIds: string[] = []

  try {
    // TI-01 — VIEWER member cannot accept an org-scoped offer (F-04) ────────
    {
      const r = await http(
        'POST',
        `/api/financing/requests/${reqForwarded.id}/offers/${sentOffer.id}/accept`,
        viewerCCookie,
        {}
      )
      const pass = r.status === 403 && /owners, admins and approvers/i.test(r.json?.error ?? '')
      record('TI-01', 'VIEWER member of applicant org accepts SENT offer', '403 approver-role refusal', pass, `got ${r.status} ${(r.json?.error ?? '').slice(0, 80)}`)
    }

    // TI-02 — BUYER-role member cannot accept either (F-04) ────────────────
    {
      const r = await http(
        'POST',
        `/api/financing/requests/${reqForwarded.id}/offers/${sentOffer.id}/accept`,
        buyerCCookie,
        {}
      )
      const pass = r.status === 403 && /owners, admins and approvers/i.test(r.json?.error ?? '')
      record('TI-02', 'BUYER-role member accepts SENT offer', '403 approver-role refusal', pass, `got ${r.status} ${(r.json?.error ?? '').slice(0, 80)}`)
    }

    // TI-03 — OWNER accepts (positive control — the door still opens) ──────
    {
      const ordersBefore = await db.order.count({ where: { buyerId: buyer1.id } })
      const r = await http(
        'POST',
        `/api/financing/requests/${reqForwarded.id}/offers/${sentOffer.id}/accept`,
        ownerCCookie,
        {}
      )
      if (r.status === 200 && r.json?.agreementId) agreementIds.push(r.json.agreementId as string)
      const pass = r.status === 200 && !!r.json?.agreementId
      record('TI-03', 'OWNER accepts the offer (positive control)', '200 + agreementId', pass, `got ${r.status} ${r.json?.error ?? r.json?.agreementId ?? ''}`)
      // no side effect on unrelated buyer's orders
      const ordersAfter = await db.order.count({ where: { buyerId: buyer1.id } })
      if (ordersAfter !== ordersBefore) {
        record('TI-03b', 'accept side-effect check (foreign order count)', 'unchanged', false, `before=${ordersBefore} after=${ordersAfter}`)
      }
    }

    // TI-04 — financier staff cannot read a DRAFT request's document (F-02) ─
    {
      const r = await http('POST', `/api/documents/${draftDoc.id}/access`, staffXCookie, {})
      const pass = r.status === 403 || r.status === 404
      record('TI-04', 'financier staff reads doc on DRAFT (unforwarded) request', '403/404 R-4 gate', pass, `got ${r.status} ${(r.json?.error ?? '').slice(0, 60)}`)
    }

    // TI-05 — after the platform forwards, the same staff CAN read (F-02) ──
    {
      // attach the same document to the FORWARDED request, then probe
      await db.requestAttachment.create({
        data: { accountDocumentId: draftDoc.id, parentType: 'FINANCING_REQUEST', parentId: reqForwarded.id, kind: 'OTHER' },
      })
      const r = await http('POST', `/api/documents/${draftDoc.id}/access`, staffXCookie, {})
      const pass = r.status === 201 && !!r.json?.url
      record('TI-05', 'after platform forward the same staff CAN read the doc', '201 + one-time url', pass, `got ${r.status}`)
      await db.requestAttachment.deleteMany({
        where: { accountDocumentId: draftDoc.id, parentType: 'FINANCING_REQUEST', parentId: reqForwarded.id },
      })
    }

    // TI-06 — suspended institution staff by-id detail (F-03) ──────────────
    {
      const r = await http('GET', `/api/financier/requests/${reqZ.id}`, staffZCookie)
      const pass = r.status === 403 || r.status === 404
      record('TI-06', 'SUSPENDED institution staff by-id request detail', '403/404', pass, `got ${r.status} ${(r.json?.error ?? '').slice(0, 60)}`)
    }

    // TI-07 — suspended staff offer creation path (F-03) ───────────────────
    {
      const r = await http('POST', '/api/financier/offers', staffZCookie, {
        requestId: reqZ.id,
        amount: 2500,
        tenorMonths: 6,
      })
      const pass = r.status === 403 || r.status === 404
      const offerCount = await db.financingOffer.count({ where: { requestId: reqZ.id } })
      record(
        'TI-07',
        'suspended staff create-offer path (no side effects)',
        '403/404 + zero offers created',
        pass && offerCount === 0,
        `got ${r.status}, offers=${offerCount}`
      )
    }

    // TI-08 — PENDING institution cannot create services (F-05) ────────────
    {
      const r = await http('POST', '/api/financier/services', staffWCookie, {
        serviceKind: 'FINANCING',
        category: 'WORKING_CAPITAL',
        name: `TI pending probe ${stamp}`,
        status: 'DRAFT',
      })
      const pass = r.status === 403 && /read-only|PENDING_VERIFICATION|REJECTED|SUSPENDED/i.test(r.json?.error ?? '')
      const svcCount = await db.financierService.count({ where: { financierProfile: { organizationId: instW.id } } })
      record(
        'TI-08',
        'PENDING institution creates a service (no side effects)',
        '403 read-only + zero services',
        pass && svcCount === 0,
        `got ${r.status}, services=${svcCount}`
      )
    }

    // TI-09..TI-12 — legacy User.role='ADMIN' with NO RBAC (F-01) ──────────
    {
      const r1 = await http('GET', '/api/admin/stats', legacyAdminCookie)
      record('TI-09', "User.role=ADMIN without RBAC → /api/admin/stats", '403', r1.status === 403, `got ${r1.status}`)

      const r2 = await http('GET', `/api/financing/requests/${reqY.id}`, legacyAdminCookie)
      const p2 = r2.status === 403 || r2.status === 404
      const leaked = r2.json?.request ? JSON.stringify(r2.json.request).slice(0, 60) : 'none'
      record('TI-10', '…reads a foreign financing request dossier', '403/404, no dossier', p2 && r2.json?.request === undefined, `got ${r2.status}, payload=${leaked}`)

      const r3 = await http('DELETE', `/api/documents/${draftDoc.id}?confirm=force`, legacyAdminCookie)
      const stillActive = await db.accountDocument.findUnique({ where: { id: draftDoc.id }, select: { isActive: true } })
      record(
        'TI-11',
        '…soft-deletes a foreign vault document (no side effects)',
        '403 + document untouched',
        r3.status === 403 && stillActive?.isActive === true,
        `got ${r3.status}, isActive=${stillActive?.isActive}`
      )

      const r4 = await http('GET', '/api/seller/earnings', legacyAdminCookie)
      record('TI-12', '…seller earnings surface', '403', r4.status === 403, `got ${r4.status}`)
    }

    // TI-13 — checkout with a foreign organizationId (H-3) ─────────────────
    {
      // buyer1 is NOT a member of orgC — attribute their "order" to orgC
      const ordersBefore = await db.order.count({ where: { buyerId: buyer1.id } })
      const r = await http('POST', '/api/orders', buyer1Cookie, {
        items: [{ productId: 'nonexistent-product', quantity: 1 }],
        fullName: 'TI Probe',
        address: '1 Probe Street',
        city: 'Probe City',
        country: 'United States',
        zip: '00000',
        organizationId: orgC.id,
      })
      const ordersAfter = await db.order.count({ where: { buyerId: buyer1.id } })
      // the foreign-org refusal must fire BEFORE any product validation writes
      const pass = r.status === 403 && /not an active member/i.test(r.json?.error ?? '')
      record(
        'TI-13',
        'checkout with a foreign organizationId (no side effects)',
        '403 membership refusal + zero orders',
        pass && ordersAfter === ordersBefore,
        `got ${r.status}, orders ${ordersBefore}→${ordersAfter}`
      )
    }

    // TI-14 — cross-institution by-id read (X staff → Y's request) ─────────
    {
      const r = await http('GET', `/api/financier/requests/${reqY.id}`, staffXCookie)
      const pass = r.status === 403 || r.status === 404
      const leaked = r.json?.request ? 'DOSSIER LEAKED' : 'none'
      record('TI-14', 'institution X staff reads institution Y request by id', '403/404, no dossier', pass && !r.json?.request, `got ${r.status}, payload=${leaked}`)
    }

    // TI-15 — two buyers: order list isolation ──────────────────────────────
    {
      const r = await http('GET', '/api/orders', buyer1Cookie)
      const orders: any[] = r.json?.orders ?? []
      const foreignLeak = orders.some((o) => o.id === order2.id || o.buyerId === buyer2.id)
      const ownPresent = orders.some((o) => o.id === order1.id)
      record(
        'TI-15',
        'two buyers: order list carries ONLY the caller rows',
        'own order only',
        r.status === 200 && !foreignLeak,
        `status=${r.status}, rows=${orders.length}, own=${ownPresent}, foreignLeak=${foreignLeak}`
      )
    }

    // TI-16 — removed member loses org access immediately ──────────────────
    {
      // viewerC is removed from org C mid-session
      await db.organizationMember.deleteMany({ where: { organizationId: orgC.id, userId: viewerC.id } })
      const r = await http('GET', `/api/organizations/${orgC.id}`, viewerCCookie)
      const pass = r.status === 403 || r.status === 404
      record('TI-16', 'member removed from org → next org-scoped read refused', '403/404', pass, `got ${r.status}`)
    }

    // TI-17 — pending applicant sees OWN tracker (positive control) ────────
    {
      const r = await http('GET', '/api/financier/context', staffWCookie)
      const ctx = r.json?.context
      const pass =
        r.status === 200 &&
        ctx?.organizationId === instW.id &&
        ctx?.organizationStatus === 'PENDING_VERIFICATION'
      record(
        'TI-17',
        'pending applicant sees OWN application tracker',
        '200 + own PENDING org',
        pass,
        `status=${r.status}, org=${ctx?.organizationId === instW.id ? 'own' : ctx?.organizationId ?? 'none'}, state=${ctx?.organizationStatus}`
      )
    }

    // TI-18 — denied responses leak no tenant payload (shape check) ───────
    {
      const probes = [
        await http('GET', `/api/financier/requests/${reqY.id}`, staffXCookie),
        await http('GET', `/api/organizations/${orgC.id}`, legacyAdminCookie),
        await http('GET', '/api/seller/earnings', legacyAdminCookie),
      ]
      const leaky = probes.filter(
        (p) =>
          p.status >= 400 &&
          p.json &&
          Object.keys(p.json).some((k) => !['error', 'code', 'module', 'message'].includes(k))
      )
      record(
        'TI-18',
        'denied responses carry no tenant data (error field only)',
        'no extra keys in 4xx bodies',
        leaky.length === 0,
        leaky.length === 0 ? 'all bodies are error-only' : `leaky: ${leaky.map((p) => Object.keys(p.json).join(',')).join(' | ')}`
      )
    }
  } finally {
    // ── cleanup (fixtures only; audit rows stay as the immutable trail) ────
    const fixtureUserIds = [
      ownerC.id, viewerC.id, buyerC.id, staffX.id, staffY.id, staffZ.id, staffW.id,
      legacyAdmin.id, buyer1.id, buyer2.id,
    ]
    try {
      // financing chain (agreement → fees/events → offer → request)
      for (const aid of agreementIds) {
        const agr = await db.financingAgreement.findUnique({ where: { id: aid }, select: { offerId: true } })
        if (agr) {
          await db.financingFee.deleteMany({ where: { agreementId: aid } })
          await db.financingEvent.deleteMany({ where: { agreementId: aid } })
          await db.financingAgreement.deleteMany({ where: { id: aid } })
        }
      }
      await db.financingOffer.deleteMany({ where: { requestId: { in: [reqForwarded.id, reqDraft.id, reqY.id, reqZ.id] } } })
      await db.requestAttachment.deleteMany({ where: { parentId: { in: [reqDraft.id, reqForwarded.id] } } })
      await db.financingRequest.deleteMany({ where: { id: { in: [reqForwarded.id, reqDraft.id, reqY.id, reqZ.id] } } })
      await db.financierService.deleteMany({ where: { id: { in: [serviceX.id, serviceY.id, serviceZ.id] } } })
      await db.financierProfile.deleteMany({ where: { organizationId: { in: [instX.id, instY.id, instZ.id, instW.id] } } })
      await db.vaultAccessGrant.deleteMany({ where: { documentId: draftDoc.id } })
      await db.accountDocument.deleteMany({ where: { id: draftDoc.id } })
      await db.mediaAsset.deleteMany({ where: { id: vaultAsset.id } })
      const storage = (await import('../src/lib/storage')).getStorage()
      for (const k of Object.values(processed.variants)) {
        await storage.delete(k).catch(() => {})
      }
      await db.order.deleteMany({ where: { id: { in: [order1.id, order2.id] } } })
      await db.notification.deleteMany({ where: { userId: { in: fixtureUserIds } } })
      await db.organizationMember.deleteMany({
        where: { organizationId: { in: [orgC.id, instX.id, instY.id, instZ.id, instW.id] } },
      })
      await db.sessionRegistry.deleteMany({ where: { userId: { in: fixtureUserIds } } })
      await db.userRole.deleteMany({ where: { userId: { in: fixtureUserIds } } })
      await db.user.deleteMany({ where: { id: { in: fixtureUserIds } } })
      await db.organization.deleteMany({ where: { id: { in: [orgC.id, instX.id, instY.id, instZ.id, instW.id] } } })
      console.log('✓ fixtures cleaned up')
    } catch (err) {
      console.error('cleanup warning:', err)
    }
  }

  // ── report ─────────────────────────────────────────────────────────────────
  const failed = results.filter((r) => r.result === 'FAIL')
  const md = `# Tenant-isolation negative suite — ${new Date().toISOString()}

Target: \`${BASE}\` (dev; STAGING_BASE_URL parameterizes; production markers abort the run).
Scope: the TENANT-AUDIT fix matrix (F-01..F-05, H-3) + cross-account probes.

| Case | Name | Expected | Result | Detail |
|---|---|---|---|---|
${results.map((r) => `| ${r.id} | ${r.name} | ${r.expect} | **${r.result}** | ${r.detail.replace(/\|/g, '\\|')} |`).join('\n')}

**${results.filter((r) => r.result === 'PASS').length}/${results.length} passed**${failed.length ? ` — ✗ ${failed.length} FAILED` : ' — all green'}

Run book: \`bun scripts/tenant-isolation-suite.ts\` (fixtures are created in the DB and removed; the immutable audit trail keeps the run's evidence rows).
`
  const { writeFileSync } = await import('fs')
  const path = `audit/tenant-isolation-suite-${new Date().toISOString().slice(0, 10)}.md`
  writeFileSync(path, md)
  console.log(`\n${failed.length === 0 ? '✓' : '✗'} ${results.filter((r) => r.result === 'PASS').length} passed, ${failed.length} failed → ${path}`)
  process.exit(failed.length === 0 ? 0 : 1)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
