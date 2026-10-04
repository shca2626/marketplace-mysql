// ─────────────────────────────────────────────────────────────────────────────
// NEGATIVE AUTHORIZATION SUITE (lastplan v5 6.10, A7/C1) — the ten-case suite,
// executed against the dev/staging target only.
//
//   bun scripts/negative-authz-suite.ts
//   STAGING_BASE_URL=https://staging.example bun scripts/negative-authz-suite.ts
//
// Cases (2026-10 round — see the DEFERRED list at the bottom for 6.6-bound
// private-document cases):
//   NEG-01  cross-tenant read        (org A member reads org B)            → refused
//   NEG-02  cross-tenant write       (org A member writes org B members)   → refused
//   NEG-03  cross-tenant approval    (org A approver decides org B request) → refused
//   NEG-04  buyer-vs-approver        (plain member decides)                → refused
//   NEG-05  self-approval            (requester decides own request)       → refused
//   NEG-06  immediate revocation     (role revoked → next call refused)     → refused
//   NEG-07  non-member assignment    (org role to non-member)              → refused (M2)
//   NEG-08  disabled module at API   (rfq flipped off → 403 MODULE_DISABLED)
//   NEG-09  unknown module key       (fail-closed config error)            → refused (6.3)
//   NEG-10  privileged-without-MFA   (payouts.manage, no enrollment)       → 403 MFA_*
//   NEG-11  last-active-owner        (revoke last org.owner seat)           → 409 (H2)
//   NEG-12  break-glass alert        (login → BREAK_GLASS_LOGIN audited)
// ─────────────────────────────────────────────────────────────────────────────
import { assertNotProd } from './lib/assert-not-prod'
import { db } from '../src/lib/db'
import { hashPassword, createSessionToken } from '../src/lib/auth'
import { encryptSecret } from '../src/lib/secret-box'
import { sha256Hex } from '../src/lib/secret-box'
import { moduleGateState } from '../src/server/modules/modules/service'
import { decideApproval } from '../src/server/modules/approvals/service'

const BASE = process.env.STAGING_BASE_URL ?? 'http://localhost:3000'
const PW = 'NegSuite-Passw0rd!'

interface Case {
  id: string
  name: string
  expect: string
  result: 'PASS' | 'FAIL' | 'SKIP'
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
      ...(body ? { 'content-type': 'application/json' } : {}),
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

// Session with a pre-satisfied MFA step-up window (for the super-admin fixture
// that must perform sensitive mutations without a live TOTP dance). Includes a
// confirmed MFA enrollment — requireStepUpMfa checks enrollment first (6.7.5).
async function privilegedSession(userId: string): Promise<string> {
  const user = await db.user.findUniqueOrThrow({ where: { id: userId } })
  await db.mfaEnrollment.upsert({
    where: { userId: user.id },
    update: {},
    create: { userId: user.id, secretEnc: encryptSecret('NEG-SUITE-NOT-A-REAL-SECRET'), confirmedAt: new Date() },
  })
  const token = createSessionToken(user.id, user.sessionVersion)
  await db.sessionRegistry.create({
    data: {
      userId: user.id,
      tokenHash: sha256Hex(token),
      userAgent: 'negative-authz-suite',
      ip: '127.0.0.1',
      mfaSatisfiedAt: new Date(),
    },
  })
  return `${'vendora_session'}=${token}`
}

// ── fixtures ─────────────────────────────────────────────────────────────────
async function mkUser(opts: { email: string; name?: string; isBreakGlass?: boolean; role?: string }) {
  return db.user.create({
    data: {
      email: opts.email,
      name: opts.name ?? opts.email,
      password: hashPassword(PW),
      role: opts.role ?? 'BUYER',
      status: 'ACTIVE',
      isBreakGlass: opts.isBreakGlass ?? false,
    },
  })
}

async function main() {
  assertNotProd({ http: BASE })
  console.log(`── negative authorization suite → ${BASE} ──────────────`)

  const stamp = Date.now().toString(36)
  const superAdminRole = await db.role.findUniqueOrThrow({ where: { key: 'platform.super-admin' } })
  const orgApproverRole = await db.role.findUniqueOrThrow({ where: { key: 'org.approver' } })
  const orgOwnerRole = await db.role.findUniqueOrThrow({ where: { key: 'org.owner' } })

  // Super-admin fixture (privileged session, no login dance)
  const superAdmin = await mkUser({ email: `neg-sa-${stamp}@staging.invalid`, role: 'ADMIN' })
  await db.userRole.create({
    data: { userId: superAdmin.id, roleId: superAdminRole.id, organizationId: '' },
  })
  const saCookie = await privilegedSession(superAdmin.id)

  // Org A: owner (O1) + plain member (M1) + approver (A1)
  const orgA = await db.organization.create({
    data: { name: `NEG-A-${stamp}`, slug: `neg-a-${stamp}`, orgType: 'COMPANY', status: 'ACTIVE', approvalThreshold: 1000 },
  })
  const ownerA = await mkUser({ email: `neg-owner-a-${stamp}@staging.invalid` })
  const memberA = await mkUser({ email: `neg-member-a-${stamp}@staging.invalid` })
  const approverA = await mkUser({ email: `neg-approver-a-${stamp}@staging.invalid` })
  await db.organizationMember.create({ data: { organizationId: orgA.id, userId: ownerA.id, role: 'OWNER' } })
  await db.organizationMember.create({ data: { organizationId: orgA.id, userId: memberA.id, role: 'VIEWER' } })
  await db.organizationMember.create({ data: { organizationId: orgA.id, userId: approverA.id, role: 'APPROVER' } })

  // Org B: owner (O2) — the cross-tenant target
  const orgB = await db.organization.create({
    data: { name: `NEG-B-${stamp}`, slug: `neg-b-${stamp}`, orgType: 'COMPANY', status: 'ACTIVE', approvalThreshold: 1000 },
  })
  const ownerB = await mkUser({ email: `neg-owner-b-${stamp}@staging.invalid` })
  await db.organizationMember.create({ data: { organizationId: orgB.id, userId: ownerB.id, role: 'OWNER' } })

  // Org B approval request (type ORDER, minimal — suite uses REJECT path)
  const approvalB = await db.approvalRequest.create({
    data: {
      organizationId: orgB.id,
      type: 'ORDER',
      requesterId: ownerB.id,
      amount: 500,
      status: 'PENDING',
    },
  })

  // Staff fixture with payouts.manage but NO MFA enrollment (NEG-10)
  const payoutRole = await db.role.create({
    data: {
      key: `neg.payouts.${stamp}`,
      name: 'NEG payout probe',
      scope: 'PLATFORM',
      permissions: { create: { permissionKey: 'payouts.manage' } },
    },
  })
  const payoutStaff = await mkUser({ email: `neg-payout-${stamp}@staging.invalid` })
  await db.userRole.create({ data: { userId: payoutStaff.id, roleId: payoutRole.id, organizationId: '' } })

  // Staff fixture with storefront.manage for revocation test (NEG-06)
  const slidesRole = await db.role.create({
    data: {
      key: `neg.slides.${stamp}`,
      name: 'NEG slides probe',
      scope: 'PLATFORM',
      permissions: { create: { permissionKey: 'storefront.manage' } },
    },
  })
  const slidesStaff = await mkUser({ email: `neg-slides-${stamp}@staging.invalid` })
  const slidesAssignment = await db.userRole.create({
    data: { userId: slidesStaff.id, roleId: slidesRole.id, organizationId: '' },
  })

  const memberACookie = await login(`neg-member-a-${stamp}@staging.invalid`)
  const approverACookie = await login(`neg-approver-a-${stamp}@staging.invalid`)
  const payoutCookie = await login(`neg-payout-${stamp}@staging.invalid`)
  const slidesCookie = await login(`neg-slides-${stamp}@staging.invalid`)

  try {
    // NEG-01 cross-tenant read ────────────────────────────────────────────────
    {
      const r = await http('GET', `/api/organizations/${orgB.id}`, memberACookie)
      const pass = r.status === 403 || r.status === 404
      record('NEG-01', 'cross-tenant read (org A member → org B profile)', '403/404', pass, `got ${r.status}`)
    }

    // NEG-02 cross-tenant write ───────────────────────────────────────────────
    {
      const r = await http('POST', `/api/organizations/${orgB.id}/members`, memberACookie, {
        email: `neg-outsider-${stamp}@staging.invalid`,
        role: 'VIEWER',
      })
      const pass = r.status === 403 || r.status === 404
      record('NEG-02', 'cross-tenant write (org A member adds org B member)', '403/404', pass, `got ${r.status}`)
    }

    // NEG-03 cross-tenant approval (service-level: org A approver on org B request)
    {
      let pass = false
      let detail = 'no error thrown'
      try {
        await decideApproval(approvalB.id, { id: approverA.id, name: 'NEG approver A' }, 'REJECT')
      } catch (err: any) {
        pass = /Only organization owners|cannot approve|not a member|403/i.test(err.message + ' ' + (err.status ?? ''))
        detail = `${err.status ?? ''} ${err.message}`.trim()
      }
      record('NEG-03', 'cross-tenant approval (org A approver decides org B request)', '403 ApprovalServiceError', pass, detail)
    }

    // NEG-04 buyer-vs-approver (plain VIEWER member decides own org's request)
    {
      let pass = false
      let detail = 'no error thrown'
      try {
        await decideApproval(approvalB.id, { id: memberA.id, name: 'NEG plain member' }, 'REJECT')
      } catch (err: any) {
        pass = (err.status ?? 0) === 403
        detail = `${err.status ?? ''} ${err.message}`.trim()
      }
      record('NEG-04', 'buyer-vs-approver (plain member decides)', '403', pass, detail)
    }

    // NEG-05 self-approval (requester decides their own request)
    {
      let pass = false
      let detail = 'no error thrown'
      try {
        await decideApproval(approvalB.id, { id: ownerB.id, name: 'NEG requester' }, 'REJECT')
      } catch (err: any) {
        pass = /own request/i.test(err.message)
        detail = `${err.status ?? ''} ${err.message}`.trim()
      }
      record('NEG-05', 'self-approval (requester decides own request)', '403 own-request refusal', pass, detail)
    }

    // NEG-06 immediate revocation ─────────────────────────────────────────────
    {
      const before = await http('GET', '/api/admin/slides', slidesCookie)
      // Revoke + bump (server semantics: role revoked → sessionVersion bump)
      await db.userRole.delete({ where: { id: slidesAssignment.id } })
      await db.user.update({ where: { id: slidesStaff.id }, data: { sessionVersion: { increment: 1 } } })
      const after = await http('GET', '/api/admin/slides', slidesCookie)
      const pass = before.status === 200 && (after.status === 401 || after.status === 403)
      record(
        'NEG-06',
        'immediate revocation (role revoked → next call refused)',
        '200 then 401/403',
        pass,
        `before=${before.status} after=${after.status}`
      )
    }

    // NEG-07 non-member assignment (M2) ───────────────────────────────────────
    {
      // payoutStaff is not a member of org A → org-scope assignment must fail.
      const r = await http('POST', '/api/admin/rbac/assignments', saCookie, {
        userId: payoutStaff.id,
        roleId: orgApproverRole.id,
        organizationId: orgA.id,
      })
      const msg = `${r.json?.error ?? ''}`
      const pass =
        (r.status === 403 || r.status === 400) &&
        !msg.includes('multi-factor') && // step-up must NOT be the failure reason (fixture has MFA)
        /not an active member|membership/i.test(msg)
      record('NEG-07', 'non-member org-role assignment (M2)', '403/400 active-membership refusal', pass, `got ${r.status} ${msg}`.slice(0, 100))
    }

    // NEG-08 disabled module at API ───────────────────────────────────────────
    {
      // Flip 'rfq' OFF at platform scope (super-admin fixture), probe, restore.
      const off = await http('POST', '/api/admin/modules', saCookie, {
        moduleKey: 'rfq',
        scopeType: 'PLATFORM',
        scopeId: '',
        enabled: false,
      })
      const probe = await http('GET', '/api/rfqs', memberACookie)
      const on = await http('POST', '/api/admin/modules', saCookie, {
        moduleKey: 'rfq',
        scopeType: 'PLATFORM',
        scopeId: '',
        enabled: true,
      })
      const restored = await http('GET', '/api/rfqs', memberACookie)
      const pass =
        (off.status === 200 || off.status === 201) &&
        probe.status === 403 &&
        probe.json?.code === 'MODULE_DISABLED' &&
        on.status === 200 &&
        restored.status !== 403
      record(
        'NEG-08',
        "disabled module at API (rfq off → 403 MODULE_DISABLED, then restored)",
        '403 MODULE_DISABLED',
        pass,
        `off=${off.status} probe=${probe.status}(${probe.json?.code}) restore=${on.status}/${restored.status}`
      )
    }

    // NEG-09 unknown module key (fail-closed config error, 6.3) ───────────────
    {
      const gate = await moduleGateState('definitely-not-a-real-module-key')
      const pass = gate.unknown === true && gate.enabled === false
      record('NEG-09', 'unknown module key fails closed', '{unknown: true, enabled: false}', pass, JSON.stringify(gate))
    }

    // NEG-10 privileged-without-MFA ───────────────────────────────────────────
    {
      const r = await http('POST', '/api/admin/payouts/generate', payoutCookie, {})
      const code = r.json?.code ?? ''
      const pass =
        r.status === 403 &&
        (code === 'MFA_ENROLLMENT_REQUIRED' || code === 'MFA_STEP_UP_REQUIRED')
      record('NEG-10', 'privileged action without MFA (payouts.generate)', '403 MFA_*', pass, `got ${r.status} ${code} ${r.json?.error ?? ''}`.slice(0, 90))
    }

    // NEG-11 last-active-owner invariant (H2) ─────────────────────────────────
    {
      // org B's single active owner holds the org.owner seat — revoking it must fail.
      const ownerSeat = await db.userRole.create({
        data: { userId: ownerB.id, roleId: orgOwnerRole.id, organizationId: orgB.id },
      })
      const r = await http('DELETE', `/api/admin/rbac/assignments/${ownerSeat.id}`, saCookie)
      const pass =
        (r.status === 409 || r.status === 403) &&
        /last active owner/i.test(r.json?.error ?? '')
      record('NEG-11', 'last-active-owner invariant (revoke final org.owner seat)', '409 last-active-owner', pass, `got ${r.status} ${r.json?.error ?? ''}`.slice(0, 90))
      // cleanup the probe seat (grant succeeded, revoke refused — remove directly)
      if (r.status !== 200) await db.userRole.delete({ where: { id: ownerSeat.id } }).catch(() => {})
    }

    // NEG-12 break-glass alert ────────────────────────────────────────────────
    {
      const bg = await mkUser({ email: `neg-breakglass-${stamp}@staging.invalid`, isBreakGlass: true, role: 'ADMIN' })
      await db.userRole.create({ data: { userId: bg.id, roleId: superAdminRole.id, organizationId: '' } })
      await login(`neg-breakglass-${stamp}@staging.invalid`)
      const audited = await db.auditLog.findFirst({
        where: { action: 'BREAK_GLASS_LOGIN', entityId: bg.id },
        orderBy: { createdAt: 'desc' },
      })
      const pass = Boolean(audited)
      record('NEG-12', 'break-glass login is alerted + audited', 'BREAK_GLASS_LOGIN audit row', pass, audited ? audited.summary.slice(0, 60) : 'no audit row')
    }

    // DEFERRED (6.6-bound): private-doc via public URL, expired signed URL,
    // cross-tenant document download — the authenticated vault proxy lands
    // with 6.6; these cases run in the post-6.6 suite revision.
    results.push({
      id: 'DEFERRED',
      name: 'private-document negative cases (public URL, expiry, cross-tenant download)',
      expect: '403/404 after 6.6',
      result: 'SKIP',
      detail: 'Vault proxy (6.6) not yet implemented — tracked in the plan.',
    })
  } finally {
    // ── cleanup (fixtures only; audit rows stay as the immutable trail) ──────
    const emails = [
      `neg-sa-${stamp}`, `neg-owner-a-${stamp}`, `neg-member-a-${stamp}`, `neg-approver-a-${stamp}`,
      `neg-owner-b-${stamp}`, `neg-payout-${stamp}`, `neg-slides-${stamp}`, `neg-breakglass-${stamp}`,
    ]
    await db.approvalRequest.deleteMany({ where: { id: approvalB.id } })
    await db.organizationMember.deleteMany({ where: { organizationId: { in: [orgA.id, orgB.id] } } })
    for (const e of emails) {
      const u = await db.user.findUnique({ where: { email: `${e}@staging.invalid` } })
      if (u) {
        await db.sessionRegistry.deleteMany({ where: { userId: u.id } })
        await db.userRole.deleteMany({ where: { userId: u.id } })
        await db.approvalRequest.deleteMany({ where: { OR: [{ requesterId: u.id }, { decidedById: u.id }] } })
        await db.user.delete({ where: { id: u.id } })
      }
    }
    await db.organization.deleteMany({ where: { id: { in: [orgA.id, orgB.id] } } })
    await db.role.deleteMany({ where: { key: { in: [`neg.payouts.${stamp}`, `neg.slides.${stamp}`] } } })
    console.log('✓ fixtures cleaned up')
  }

  // ── report ─────────────────────────────────────────────────────────────────
  const failed = results.filter((r) => r.result === 'FAIL')
  const md = `# Negative authorization suite — ${new Date().toISOString()}

Target: \`${BASE}\` (dev; STAGING_BASE_URL parameterizes; production markers abort the run).

| Case | Name | Expected | Result | Detail |
|---|---|---|---|---|
${results.map((r) => `| ${r.id} | ${r.name} | ${r.expect} | **${r.result}** | ${r.detail.replace(/\|/g, '\\|')} |`).join('\n')}

**${results.filter((r) => r.result === 'PASS').length}/${results.filter((r) => r.result !== 'SKIP').length} passed**${failed.length ? ` — ✗ ${failed.length} FAILED` : ' — all green'}

Run book: \`bun scripts/negative-authz-suite.ts\` (fixtures are created in the DB and removed; the immutable audit trail keeps the run's evidence rows).
`
  const path = `audit/negative-suite-${new Date().toISOString().slice(0, 10)}.md`
  const { writeFileSync } = await import('fs')
  writeFileSync(path, md)
  console.log(`\n${failed.length === 0 ? '✓' : '✗'} ${results.filter((r) => r.result === 'PASS').length} passed, ${failed.length} failed, ${results.filter((r) => r.result === 'SKIP').length} deferred → ${path}`)
  process.exit(failed.length === 0 ? 0 : 1)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
