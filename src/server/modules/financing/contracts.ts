import { createHash } from 'crypto'
import { db } from '@/lib/db'
import { recordAudit } from '@/server/modules/audit/service'
import { FinancingError } from './shared'

/**
 * VERSIONED CONTRACT TEMPLATES (lastplan v5 §10.3) — the financier's
 * agreement text library the e-signature flow binds to.
 *
 *   • Versioning: (financierProfile, kind, version) unique — create mints
 *     max(version)+1; bodies are NEVER edited after activation (DRAFT-only
 *     edits, 409 otherwise) so a live sha256 can never drift.
 *   • sha256: computed server-side (node:crypto) on every save; it is the
 *     content hash the e-signature evidence package binds to (§10.4).
 *   • Single-active per kind: activateTemplate atomically retires every
 *     other template of the same (profile, kind) and activates this one.
 *     retireTemplate leaves NO active template — new signings fail closed
 *     until a new activation (fail-closed by design).
 *   • Placeholders render per agreement; unknown {{tokens}} stay visible
 *     and are returned in the `unresolved` list (no silent data loss).
 */

// ── DTOs ────────────────────────────────────────────────────────────────────

export type ContractKind = 'FINANCING_AGREEMENT' | 'MURABAHA'
export type TemplateStatus = 'DRAFT' | 'ACTIVE' | 'RETIRED'

export interface ContractTemplateDTO {
  id: string
  kind: ContractKind
  version: number
  title: string
  body: string
  sha256: string
  status: TemplateStatus
  createdAt: string
  updatedAt: string
  createdBy: { id: string; name: string }
}

export interface TemplateInput {
  kind: ContractKind
  title: string
  body: string
}

/** Everything renderForAgreement needs about the agreement's frozen offer. */
export interface AgreementRenderContext {
  agreementNumber: string
  financierOrgName: string
  applicantName: string
  amount: number
  currency: string
  tenorMonths: number
  rateType: string | null
  ratePercent: number | null
  offerNotes: string | null
  installments: { installmentNo: number; dueDate: Date; amount: number }[]
}

export interface RenderedContract {
  body: string
  /** Placeholders present in the template that no context value filled. */
  unresolved: string[]
}

// ── Helpers ─────────────────────────────────────────────────────────────────

/** sha256(body) — the content hash the e-signature binds to. */
export function hashBody(body: string): string {
  return createHash('sha256').update(body, 'utf8').digest('hex')
}

async function profileForOrg(financierOrgId: string) {
  const profile = await db.financierProfile.findUnique({
    where: { organizationId: financierOrgId },
    select: { id: true, organization: { select: { name: true } } },
  })
  if (!profile) throw new FinancingError('Financier profile not found for this organization', 404)
  return profile
}

/** OWNER/ADMIN membership guard (DP-1 — same pattern as agreements.ts). */
async function assertTemplateStaffAccess(userId: string, financierOrgId: string): Promise<void> {
  const membership = await db.organizationMember.findFirst({
    where: { userId, organizationId: financierOrgId, role: { in: ['OWNER', 'ADMIN'] } },
  })
  if (!membership) throw new FinancingError('Financier staff access required', 403)
}

const templateInclude = {
  createdBy: { select: { id: true, name: true } },
} as const

type TemplateRaw = Awaited<ReturnType<typeof db.financingContractTemplate.findFirstOrThrow>> & {
  createdBy: { id: string; name: string }
}

function serializeTemplate(t: TemplateRaw): ContractTemplateDTO {
  return {
    id: t.id,
    kind: t.kind as ContractKind,
    version: t.version,
    title: t.title,
    body: t.body,
    sha256: t.sha256,
    status: t.status as TemplateStatus,
    createdAt: t.createdAt.toISOString(),
    updatedAt: t.updatedAt.toISOString(),
    createdBy: { id: t.createdBy.id, name: t.createdBy.name },
  }
}

// ── Views ───────────────────────────────────────────────────────────────────

/** All templates for the org, newest version first (UI groups by kind). */
export async function listTemplates(financierOrgId: string): Promise<ContractTemplateDTO[]> {
  const profile = await profileForOrg(financierOrgId)
  const rows = await db.financingContractTemplate.findMany({
    where: { financierProfileId: profile.id },
    include: templateInclude,
    orderBy: [{ kind: 'asc' }, { version: 'desc' }],
  })
  return rows.map(serializeTemplate)
}

/** The org's ACTIVE template for a kind, or null (signings fail closed). */
export async function getActiveTemplate(
  financierOrgId: string,
  kind: ContractKind
): Promise<ContractTemplateDTO | null> {
  const profile = await profileForOrg(financierOrgId)
  const row = await db.financingContractTemplate.findFirst({
    where: { financierProfileId: profile.id, kind, status: 'ACTIVE' },
    include: templateInclude,
    orderBy: { version: 'desc' },
  })
  return row ? serializeTemplate(row) : null
}

// ── Mutations (OWNER/ADMIN staff, audited) ──────────────────────────────────

export async function createTemplate(
  staffUserId: string,
  financierOrgId: string,
  input: TemplateInput
): Promise<ContractTemplateDTO> {
  await assertTemplateStaffAccess(staffUserId, financierOrgId)
  const profile = await profileForOrg(financierOrgId)
  const title = input.title.trim()
  const body = input.body
  if (!title) throw new FinancingError('Template title is required')
  if (!body.trim()) throw new FinancingError('Template body is required')

  // version = max(version)+1 for the kind — minted inside the transaction
  // so two concurrent drafts cannot claim the same slot.
  const row = await db.$transaction(async (tx) => {
    const last = await tx.financingContractTemplate.findFirst({
      where: { financierProfileId: profile.id, kind: input.kind },
      orderBy: { version: 'desc' },
      select: { version: true },
    })
    return tx.financingContractTemplate.create({
      data: {
        financierProfileId: profile.id,
        kind: input.kind,
        version: (last?.version ?? 0) + 1,
        title,
        body,
        sha256: hashBody(body),
        status: 'DRAFT',
        createdById: staffUserId,
      },
      include: templateInclude,
    })
  })

  await recordAudit({
    actorId: staffUserId,
    actorType: 'USER',
    action: 'CONTRACT_TEMPLATE_CREATED',
    entityType: 'FinancingContractTemplate',
    entityId: row.id,
    summary: `Contract template v${row.version} drafted (${row.kind}) — ${row.title}`,
    metadata: { financierOrgId, kind: row.kind, version: row.version, sha256: row.sha256 },
  })
  return serializeTemplate(row)
}

/** DRAFT-only edits — an ACTIVE/RETIRED body is frozen (its sha256 is live). */
export async function updateDraft(
  staffUserId: string,
  financierOrgId: string,
  id: string,
  input: Partial<TemplateInput>
): Promise<ContractTemplateDTO> {
  await assertTemplateStaffAccess(staffUserId, financierOrgId)
  const profile = await profileForOrg(financierOrgId)
  const existing = await db.financingContractTemplate.findUnique({ where: { id } })
  if (!existing) throw new FinancingError('Template not found', 404)
  if (existing.financierProfileId !== profile.id) {
    throw new FinancingError('Financier staff access required', 403)
  }
  if (existing.status !== 'DRAFT') {
    throw new FinancingError(
      existing.status === 'ACTIVE'
        ? 'This template is ACTIVE — its text is frozen. Draft a new version to change the wording.'
        : 'This template is RETIRED and can no longer be edited',
      409
    )
  }
  const title = input.title !== undefined ? input.title.trim() : undefined
  if (title === '') throw new FinancingError('Template title is required')
  const body = input.body !== undefined ? input.body : undefined
  if (body !== undefined && !body.trim()) throw new FinancingError('Template body is required')

  const row = await db.financingContractTemplate.update({
    where: { id },
    data: {
      ...(title !== undefined ? { title } : {}),
      ...(body !== undefined ? { body, sha256: hashBody(body) } : {}),
    },
    include: templateInclude,
  })

  await recordAudit({
    actorId: staffUserId,
    actorType: 'USER',
    action: 'CONTRACT_TEMPLATE_UPDATED',
    entityType: 'FinancingContractTemplate',
    entityId: id,
    summary: `Contract template v${row.version} draft updated${body !== undefined ? ' (sha256 recomputed)' : ''}`,
    metadata: { financierOrgId, kind: row.kind, version: row.version, sha256: row.sha256 },
  })
  return serializeTemplate(row)
}

/**
 * Single-active activation: every other template of the same (profile, kind)
 * flips RETIRED, this one becomes ACTIVE — atomically. Existing e-signature
 * executions keep referencing their own template version.
 */
export async function activateTemplate(
  staffUserId: string,
  financierOrgId: string,
  id: string
): Promise<ContractTemplateDTO> {
  await assertTemplateStaffAccess(staffUserId, financierOrgId)
  const profile = await profileForOrg(financierOrgId)
  const existing = await db.financingContractTemplate.findUnique({ where: { id } })
  if (!existing) throw new FinancingError('Template not found', 404)
  if (existing.financierProfileId !== profile.id) {
    throw new FinancingError('Financier staff access required', 403)
  }
  if (existing.status === 'ACTIVE') {
    throw new FinancingError('This template is already the active version', 409)
  }

  const row = await db.$transaction(async (tx) => {
    await tx.financingContractTemplate.updateMany({
      where: { financierProfileId: profile.id, kind: existing.kind, status: 'ACTIVE', id: { not: id } },
      data: { status: 'RETIRED' },
    })
    return tx.financingContractTemplate.update({
      where: { id },
      data: { status: 'ACTIVE' },
      include: templateInclude,
    })
  })

  await recordAudit({
    actorId: staffUserId,
    actorType: 'USER',
    action: 'CONTRACT_TEMPLATE_ACTIVATED',
    entityType: 'FinancingContractTemplate',
    entityId: id,
    summary: `Contract template v${row.version} activated for ${row.kind} (previous active retired)`,
    metadata: { financierOrgId, kind: row.kind, version: row.version, sha256: row.sha256 },
  })
  return serializeTemplate(row)
}

/**
 * ACTIVE → RETIRED deliberately leaves no active template: new signings fail
 * closed until a new activation. DRAFT templates are retired through deletion
 * of the draft lifecycle instead (they simply stay DRAFT).
 */
export async function retireTemplate(
  staffUserId: string,
  financierOrgId: string,
  id: string
): Promise<ContractTemplateDTO> {
  await assertTemplateStaffAccess(staffUserId, financierOrgId)
  const profile = await profileForOrg(financierOrgId)
  const existing = await db.financingContractTemplate.findUnique({ where: { id } })
  if (!existing) throw new FinancingError('Template not found', 404)
  if (existing.financierProfileId !== profile.id) {
    throw new FinancingError('Financier staff access required', 403)
  }
  if (existing.status !== 'ACTIVE') {
    throw new FinancingError(`Template is ${existing.status} — only the active version can be retired`, 409)
  }

  const row = await db.financingContractTemplate.update({
    where: { id },
    data: { status: 'RETIRED' },
    include: templateInclude,
  })

  await recordAudit({
    actorId: staffUserId,
    actorType: 'USER',
    action: 'CONTRACT_TEMPLATE_RETIRED',
    entityType: 'FinancingContractTemplate',
    entityId: id,
    summary: `Contract template v${row.version} retired — new signings stay closed until a new activation`,
    metadata: { financierOrgId, kind: row.kind, version: row.version },
  })
  return serializeTemplate(row)
}

// ── Rendering ───────────────────────────────────────────────────────────────

function formatDay(d: Date): string {
  return d.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' })
}

/**
 * Placeholder substitution for an agreement context. Known tokens:
 *   {{agreementNumber}} {{financierOrgName}} {{applicantName}} {{amount}}
 *   {{currency}} {{tenorMonths}} {{rateType}} {{ratePercent}}
 *   {{installmentSchedule}} (numbered "1. <date> — <amount> <currency>" lines)
 *   {{date}} (today) {{offerNotes}}
 * Unknown placeholders stay VISIBLE in the text and are returned in
 * `unresolved` — the reviewer sees the gap instead of silently-emptied text.
 */
export function renderForAgreement(
  template: { body: string },
  ctx: AgreementRenderContext
): RenderedContract {
  const schedule = ctx.installments.length
    ? ctx.installments
        .map(
          (i) =>
            `${i.installmentNo}. ${formatDay(i.dueDate)} — ${i.amount.toLocaleString('en-US')} ${ctx.currency}`
        )
        .join('\n')
    : 'To be scheduled by the financier.'

  const values: Record<string, string> = {
    agreementNumber: ctx.agreementNumber,
    financierOrgName: ctx.financierOrgName,
    applicantName: ctx.applicantName,
    amount: ctx.amount.toLocaleString('en-US'),
    currency: ctx.currency,
    tenorMonths: String(ctx.tenorMonths),
    rateType: ctx.rateType ?? 'as offered',
    ratePercent: ctx.ratePercent != null ? String(ctx.ratePercent) : 'as offered',
    installmentSchedule: schedule,
    date: formatDay(new Date()),
    offerNotes: ctx.offerNotes ?? '—',
  }

  const unresolved: string[] = []
  const body = template.body.replace(/\{\{\s*([a-zA-Z][a-zA-Z0-9_]*)\s*\}\}/g, (full, token: string) => {
    if (Object.prototype.hasOwnProperty.call(values, token)) return values[token]
    if (!unresolved.includes(full)) unresolved.push(full)
    return full
  })
  return { body, unresolved }
}

/** The default starter body offered in the new-template dialog. */
export const PLACEHOLDER_CHEATSHEET: { token: string; fills: string }[] = [
  { token: '{{agreementNumber}}', fills: 'AGR-2026-000004' },
  { token: '{{financierOrgName}}', fills: 'Al-Amal Bank' },
  { token: '{{applicantName}}', fills: 'Alex Rivera' },
  { token: '{{amount}}', fills: '750,000' },
  { token: '{{currency}}', fills: 'YER' },
  { token: '{{tenorMonths}}', fills: '12' },
  { token: '{{rateType}}', fills: 'Murabaha (annual) / as offered' },
  { token: '{{ratePercent}}', fills: '14.5' },
  { token: '{{installmentSchedule}}', fills: 'numbered due-date lines' },
  { token: '{{date}}', fills: 'today' },
  { token: '{{offerNotes}}', fills: 'the offer notes, — when empty' },
]

export const STARTER_TEMPLATE_BODY = `FINANCING AGREEMENT {{agreementNumber}}

This financing agreement ("Agreement") is entered into on {{date}} between
{{financierOrgName}} ("Financier") and {{applicantName}} ("Applicant").

1. FACILITY
The Financier extends financing of {{amount}} {{currency}} to the Applicant,
 repayable over {{tenorMonths}} months ({{rateType}}; rate: {{ratePercent}}).

2. REPAYMENT SCHEDULE
{{installmentSchedule}}

3. OFFER TERMS
Offer notes: {{offerNotes}}

4. GENERAL
The Applicant consents to be bound by the terms of this Agreement and
understands the installment schedule and the obligation to pay on time.
`
