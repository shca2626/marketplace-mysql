import { z } from 'zod'
import { db } from '@/lib/db'
import { normalizeE164, normalizeYemeniPhone } from '@/lib/phone'
import { waService, WhatsAppAdminError } from './admin'

// ─────────────────────────────────────────────────────────────────────────────
// WA-BIZ — bulk sending campaigns (admin console "Campaigns" tab).
//
// The audience is resolved ONCE at creation into a newline-separated E.164
// snapshot stored on the row, so later user changes (new signups, edited
// phones) never mutate an existing campaign. Starting flips DRAFT→QUEUED and
// delegates the paced send loop to the Baileys mini-service
// POST /campaigns/run — this side only orchestrates and reads state back.
// ─────────────────────────────────────────────────────────────────────────────

export const CAMPAIGN_AUDIENCES = ['ALL_USERS', 'BUYERS', 'SELLERS', 'CUSTOM'] as const
export const CAMPAIGN_CONTROL_ACTIONS = ['pause', 'resume', 'cancel'] as const

export const campaignCreateSchema = z.object({
  name: z.string().trim().min(2).max(120),
  body: z.string().trim().min(1).max(4096),
  audience: z.enum(CAMPAIGN_AUDIENCES),
  customPhones: z.string().max(20_000).optional(),
  templateId: z.string().trim().min(1).optional().nullable(),
})

export const campaignRenameSchema = z.object({
  name: z.string().trim().min(2).max(120),
})

export const campaignControlSchema = z.object({
  action: z.enum(CAMPAIGN_CONTROL_ACTIONS),
})

// ── DTO ─────────────────────────────────────────────────────────────────────

export interface BulkCampaignDTO {
  id: string
  name: string
  body: string
  audience: string
  status: string
  total: number
  sent: number
  failed: number
  createdAt: string
  startedAt: string | null
  completedAt: string | null
  templateId: string | null
  templateName: string | null
}

type CampaignRow = {
  id: string
  name: string
  body: string
  audience: string
  status: string
  total: number
  sent: number
  failed: number
  createdAt: Date
  startedAt: Date | null
  completedAt: Date | null
  templateId: string | null
  template: { name: string } | null
}

const CAMPAIGN_SELECT = {
  id: true,
  name: true,
  body: true,
  audience: true,
  status: true,
  total: true,
  sent: true,
  failed: true,
  createdAt: true,
  startedAt: true,
  completedAt: true,
  templateId: true,
  template: { select: { name: true } },
} as const

export function serializeBulkCampaign(row: CampaignRow): BulkCampaignDTO {
  return {
    id: row.id,
    name: row.name,
    body: row.body,
    audience: row.audience,
    status: row.status,
    total: row.total,
    sent: row.sent,
    failed: row.failed,
    createdAt: row.createdAt.toISOString(),
    startedAt: row.startedAt ? row.startedAt.toISOString() : null,
    completedAt: row.completedAt ? row.completedAt.toISOString() : null,
    templateId: row.templateId,
    templateName: row.template?.name ?? null,
  }
}

// ── Audience resolution (ONCE, at creation) ─────────────────────────────────

/**
 * Resolves the audience into a deduped E.164 phone snapshot:
 *   ALL_USERS — every ACTIVE user with a phone
 *   BUYERS / SELLERS — ACTIVE users of that role with a phone
 *   CUSTOM — the admin-provided free-form list (one per line, comma or
 *            space separated), each token normalized with the shared phone
 *            helpers (Yemeni locals get the +967 prefix, internationals must
 *            already carry a +).
 */
async function resolveAudiencePhones(
  audience: (typeof CAMPAIGN_AUDIENCES)[number],
  customPhones: string | undefined
): Promise<string[]> {
  if (audience === 'CUSTOM') {
    const seen = new Set<string>()
    for (const chunk of (customPhones ?? '').split(/[\n\r,]+/)) {
      const trimmed = chunk.trim()
      if (!trimmed) continue
      // A chunk may still carry inner spacing ("+967 777 555 888") — the
      // normalizers strip that; only when the WHOLE chunk fails do we treat
      // the spaces as separators between several bare numbers.
      const direct = normalizeE164(trimmed) ?? normalizeYemeniPhone(trimmed)
      if (direct) {
        seen.add(direct)
        continue
      }
      for (const token of trimmed.split(/\s+/)) {
        const normalized = normalizeE164(token) ?? normalizeYemeniPhone(token)
        if (normalized) seen.add(normalized)
      }
    }
    return [...seen]
  }

  const where: { phone: { not: null }; status: string; role?: string } = {
    phone: { not: null },
    status: 'ACTIVE',
    ...(audience === 'BUYERS' ? { role: 'BUYER' } : {}),
    ...(audience === 'SELLERS' ? { role: 'SELLER' } : {}),
  }
  const users = await db.user.findMany({ where, select: { phone: true } })
  const seen = new Set<string>()
  for (const user of users) {
    if (user.phone) seen.add(user.phone) // stored canonical E.164
  }
  return [...seen]
}

// ── CRUD ────────────────────────────────────────────────────────────────────

export async function listCampaigns(): Promise<BulkCampaignDTO[]> {
  const rows = await db.bulkCampaign.findMany({
    orderBy: { createdAt: 'desc' },
    select: CAMPAIGN_SELECT,
  })
  return rows.map(serializeBulkCampaign)
}

export async function getCampaign(campaignId: string): Promise<BulkCampaignDTO> {
  const row = await db.bulkCampaign.findUnique({
    where: { id: campaignId },
    select: CAMPAIGN_SELECT,
  })
  if (!row) throw new WhatsAppAdminError(404, 'Campaign not found')
  return serializeBulkCampaign(row)
}

export async function createCampaign(
  input: z.infer<typeof campaignCreateSchema>,
  createdBy: string
): Promise<BulkCampaignDTO> {
  if (input.templateId) {
    const template = await db.whatsAppTemplate.findUnique({
      where: { id: input.templateId },
      select: { id: true },
    })
    if (!template) throw new WhatsAppAdminError(404, 'Template not found')
  }

  const phones = await resolveAudiencePhones(input.audience, input.customPhones)
  if (phones.length === 0) {
    throw new WhatsAppAdminError(400, 'The resolved audience is empty — nothing to send to')
  }

  const row = await db.bulkCampaign.create({
    data: {
      name: input.name,
      body: input.body,
      audience: input.audience,
      templateId: input.templateId ?? null,
      phones: phones.join('\n'),
      total: phones.length,
      status: 'DRAFT',
      createdBy,
    },
    select: CAMPAIGN_SELECT,
  })
  return serializeBulkCampaign(row)
}

export async function renameCampaign(
  campaignId: string,
  name: string
): Promise<BulkCampaignDTO> {
  const row = await db.bulkCampaign.findUnique({
    where: { id: campaignId },
    select: { id: true },
  })
  if (!row) throw new WhatsAppAdminError(404, 'Campaign not found')
  const updated = await db.bulkCampaign.update({
    where: { id: campaignId },
    data: { name },
    select: CAMPAIGN_SELECT,
  })
  return serializeBulkCampaign(updated)
}

export async function deleteCampaign(campaignId: string): Promise<void> {
  const row = await db.bulkCampaign.findUnique({
    where: { id: campaignId },
    select: { id: true, status: true },
  })
  if (!row) throw new WhatsAppAdminError(404, 'Campaign not found')
  if (!['DRAFT', 'COMPLETED', 'CANCELLED', 'FAILED'].includes(row.status)) {
    throw new WhatsAppAdminError(409, 'This campaign is running — pause or cancel it first')
  }
  await db.bulkCampaign.delete({ where: { id: campaignId } })
}

// ── Start / control — orchestration only, the send loop lives in the service ─

const SERVICE_CALL_TIMEOUT_MS = 15_000

/** DRAFT→QUEUED→(service kicks the loop). On any service failure the row is
 *  reverted to DRAFT so the admin can simply press Start again. */
export async function startCampaign(campaignId: string): Promise<BulkCampaignDTO> {
  const row = await db.bulkCampaign.findUnique({
    where: { id: campaignId },
    select: { id: true, status: true },
  })
  if (!row) throw new WhatsAppAdminError(404, 'Campaign not found')
  if (row.status !== 'DRAFT') {
    throw new WhatsAppAdminError(409, `Only a DRAFT campaign can be started (current status: ${row.status})`)
  }

  await db.bulkCampaign.update({ where: { id: campaignId }, data: { status: 'QUEUED' } })

  let res: { ok: boolean; status: number; data: { error?: string } }
  try {
    res = await waService<{ error?: string }>('/campaigns/run', {
      method: 'POST',
      body: { campaignId },
      timeoutMs: SERVICE_CALL_TIMEOUT_MS,
    })
  } catch (err) {
    await db.bulkCampaign
      .update({ where: { id: campaignId }, data: { status: 'DRAFT' } })
      .catch(() => undefined)
    if (err instanceof WhatsAppAdminError) throw err
    throw new WhatsAppAdminError(502, `WhatsApp service unreachable — ${err instanceof Error ? err.message : String(err)}`)
  }
  if (!res.ok) {
    await db.bulkCampaign
      .update({ where: { id: campaignId }, data: { status: 'DRAFT' } })
      .catch(() => undefined)
    throw new WhatsAppAdminError(502, `The WhatsApp service refused to run the campaign: ${res.data.error ?? `service responded ${res.status}`}`)
  }
  return getCampaign(campaignId)
}

/** pause | resume | cancel — proxied to the service's run-state switch. */
export async function controlCampaign(
  campaignId: string,
  action: (typeof CAMPAIGN_CONTROL_ACTIONS)[number]
): Promise<BulkCampaignDTO> {
  const row = await db.bulkCampaign.findUnique({
    where: { id: campaignId },
    select: { id: true },
  })
  if (!row) throw new WhatsAppAdminError(404, 'Campaign not found')

  let res: { ok: boolean; status: number; data: { error?: string } }
  try {
    res = await waService<{ error?: string }>('/campaigns/control', {
      method: 'POST',
      body: { campaignId, action },
      timeoutMs: SERVICE_CALL_TIMEOUT_MS,
    })
  } catch (err) {
    if (err instanceof WhatsAppAdminError) throw err
    throw new WhatsAppAdminError(502, `WhatsApp service unreachable — ${err instanceof Error ? err.message : String(err)}`)
  }
  if (!res.ok) {
    throw new WhatsAppAdminError(502, `The WhatsApp service could not ${action} the campaign: ${res.data.error ?? `service responded ${res.status}`}`)
  }
  return getCampaign(campaignId)
}
