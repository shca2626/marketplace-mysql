import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { db } from '@/lib/db'
import { requireAdmin } from '@/server/guards'
import { assertSameOrigin, enforceRateLimit } from '@/lib/http'
import { recordAudit } from '@/server/modules/audit/service'
import { DOCUMENT_TYPES } from '@/server/modules/financing/shared'
import {
  availableProviderKeys,
  listProviderSecrets,
  rotateProviderSecret,
  transmittedFieldsFor,
} from '@/server/modules/kyc/provider/dispatch'

// ─────────────────────────────────────────────────────────────────────────────
// ADMIN · KYC PROVIDER CONFIGS (Phase 12.4).
//
//   GET  /api/admin/kyc/provider-configs — the per-doc-type routing table +
//        the webhook signing secrets (console display).
//   PUT  /api/admin/kyc/provider-configs — upsert one doc type's routing:
//        mode MANUAL | PROVIDER | PROVIDER_THEN_MANUAL, provider, timeoutMs,
//        enabled, mock outcome (settings JSON). staff.manage.
//   POST /api/admin/kyc/provider-configs — {action:'rotate-secret'} → new
//        webhook signing secret for a provider.
// ─────────────────────────────────────────────────────────────────────────────

const putSchema = z.object({
  docType: z.enum(DOCUMENT_TYPES),
  mode: z.enum(['MANUAL', 'PROVIDER', 'PROVIDER_THEN_MANUAL']),
  providerKey: z.string().trim().min(1).max(32).default('mock'),
  timeoutMs: z.number().int().min(1000).max(120000).default(30000),
  enabled: z.boolean().default(true),
  outcome: z.enum(['approve', 'reject', 'error500', 'timeout']).optional(),
})

const postSchema = z.discriminatedUnion('action', [
  z.object({ action: z.literal('rotate-secret'), providerKey: z.string().trim().min(1).max(32) }),
])

export async function GET(req: NextRequest) {
  const { error } = await requireAdmin('staff.manage')
  if (error) return error
  void req
  const rows = await db.kycProviderConfig.findMany({ orderBy: { docType: 'asc' } })
  const secrets = await listProviderSecrets()
  const providers = availableProviderKeys()
  return NextResponse.json({
    configs: rows.map((r) => {
      let settings: { outcome?: string } = {}
      try {
        settings = r.settings ? JSON.parse(r.settings) : {}
      } catch {
        settings = {}
      }
      return {
        id: r.id,
        docType: r.docType,
        mode: r.mode,
        providerKey: r.providerKey,
        enabled: r.enabled,
        timeoutMs: r.timeoutMs,
        outcome: settings.outcome ?? 'approve',
        changedById: r.changedById,
        updatedAt: r.updatedAt.toISOString(),
        transmittedFields: transmittedFieldsFor(r.docType),
      }
    }),
    secrets,
    providers,
  })
}

export async function PUT(req: NextRequest) {
  const { user, error } = await requireAdmin('staff.manage')
  if (error) return error
  const csrf = assertSameOrigin(req)
  if (csrf) return csrf
  const rl = enforceRateLimit(req, 'admin:kyc-provider-configs', { limit: 60, windowMs: 60_000 }, user.id)
  if (rl) return rl

  const parsed = putSchema.safeParse(await req.json())
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid provider config', details: parsed.error.flatten() }, { status: 400 })
  }
  const { docType, mode, providerKey, timeoutMs, enabled, outcome } = parsed.data
  if (!availableProviderKeys().includes(providerKey)) {
    return NextResponse.json({ error: `Unknown provider "${providerKey}"` }, { status: 400 })
  }

  const settings = JSON.stringify({ ...(outcome ? { outcome } : {}) })
  const row = await db.kycProviderConfig.upsert({
    where: { docType },
    update: { mode, providerKey, timeoutMs, enabled, settings, changedById: user.id },
    create: { docType, mode, providerKey, timeoutMs, enabled, settings, changedById: user.id },
  })
  await recordAudit({
    actorId: user.id,
    actorType: 'ADMIN',
    action: 'KYC_PROVIDER_CONFIG_UPDATED',
    entityType: 'KycProviderConfig',
    entityId: row.id,
    summary: `${docType} verification routing → ${enabled ? mode : 'MANUAL (disabled)'} via "${providerKey}"`,
    metadata: { docType, mode, providerKey, timeoutMs, enabled, outcome: outcome ?? null },
  })
  return NextResponse.json({ ok: true, config: { id: row.id, docType: row.docType } })
}

export async function POST(req: NextRequest) {
  const { user, error } = await requireAdmin('staff.manage')
  if (error) return error
  const csrf = assertSameOrigin(req)
  if (csrf) return csrf
  const rl = enforceRateLimit(req, 'admin:kyc-provider-configs', { limit: 60, windowMs: 60_000 }, user.id)
  if (rl) return rl

  const parsed = postSchema.safeParse(await req.json())
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid action', details: parsed.error.flatten() }, { status: 400 })
  }
  if (parsed.data.action === 'rotate-secret') {
    if (!availableProviderKeys().includes(parsed.data.providerKey)) {
      return NextResponse.json({ error: `Unknown provider "${parsed.data.providerKey}"` }, { status: 400 })
    }
    const secret = await rotateProviderSecret(parsed.data.providerKey, user.id)
    return NextResponse.json({ ok: true, providerKey: parsed.data.providerKey, secret })
  }
  return NextResponse.json({ error: 'Unsupported action' }, { status: 400 })
}
