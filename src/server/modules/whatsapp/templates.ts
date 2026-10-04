import { z } from 'zod'
import { db } from '@/lib/db'
import { WhatsAppAdminError } from './admin'

// ─────────────────────────────────────────────────────────────────────────────
// WA-BIZ — reusable WhatsApp message templates (admin console "Templates" tab).
//
// A template is a named body with {{placeholder}} variables ({{name}},
// {{order}}, …). Rendering happens at SEND time in whatever flow uses it —
// campaigns store only the final rendered body, so editing a template never
// mutates a past send. useCount feeds the console KPIs (incremented by the
// campaign composer when a send is built from a template).
// ─────────────────────────────────────────────────────────────────────────────

export const TEMPLATE_CATEGORIES = ['MARKETING', 'UTILITY', 'NOTIFICATION', 'CUSTOM'] as const
export const TEMPLATE_LANGUAGES = ['ar', 'en'] as const
export const TEMPLATE_STATUSES = ['DRAFT', 'APPROVED', 'ARCHIVED'] as const

export const templateCreateSchema = z.object({
  name: z.string().trim().min(2).max(60),
  category: z.enum(TEMPLATE_CATEGORIES),
  language: z.enum(TEMPLATE_LANGUAGES),
  body: z.string().trim().min(1).max(4096),
  status: z.enum(TEMPLATE_STATUSES).optional(),
})

export const templateUpdateSchema = z.object({
  name: z.string().trim().min(2).max(60).optional(),
  category: z.enum(TEMPLATE_CATEGORIES).optional(),
  language: z.enum(TEMPLATE_LANGUAGES).optional(),
  body: z.string().trim().min(1).max(4096).optional(),
  status: z.enum(TEMPLATE_STATUSES).optional(),
})

// ── DTO ─────────────────────────────────────────────────────────────────────

export interface WhatsAppTemplateDTO {
  id: string
  name: string
  category: string
  language: string
  body: string
  status: string
  useCount: number
  createdAt: string
  updatedAt: string
}

type TemplateRow = {
  id: string
  name: string
  category: string
  language: string
  body: string
  status: string
  useCount: number
  createdAt: Date
  updatedAt: Date
}

const TEMPLATE_SELECT = {
  id: true,
  name: true,
  category: true,
  language: true,
  body: true,
  status: true,
  useCount: true,
  createdAt: true,
  updatedAt: true,
} as const

export function serializeWhatsAppTemplate(row: TemplateRow): WhatsAppTemplateDTO {
  return {
    id: row.id,
    name: row.name,
    category: row.category,
    language: row.language,
    body: row.body,
    status: row.status,
    useCount: row.useCount,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  }
}

// ── CRUD ────────────────────────────────────────────────────────────────────

export async function listTemplates(): Promise<WhatsAppTemplateDTO[]> {
  const rows = await db.whatsAppTemplate.findMany({
    orderBy: { updatedAt: 'desc' },
    select: TEMPLATE_SELECT,
  })
  return rows.map(serializeWhatsAppTemplate)
}

export async function createTemplate(
  input: z.infer<typeof templateCreateSchema>
): Promise<WhatsAppTemplateDTO> {
  const existing = await db.whatsAppTemplate.findUnique({
    where: { name: input.name },
    select: { id: true },
  })
  if (existing) {
    throw new WhatsAppAdminError(409, 'A template with this name already exists')
  }
  const row = await db.whatsAppTemplate.create({
    data: {
      name: input.name,
      category: input.category,
      language: input.language,
      body: input.body,
      status: input.status ?? 'DRAFT',
    },
    select: TEMPLATE_SELECT,
  })
  return serializeWhatsAppTemplate(row)
}

export async function updateTemplate(
  templateId: string,
  patch: z.infer<typeof templateUpdateSchema>
): Promise<WhatsAppTemplateDTO> {
  const row = await db.whatsAppTemplate.findUnique({
    where: { id: templateId },
    select: TEMPLATE_SELECT,
  })
  if (!row) throw new WhatsAppAdminError(404, 'Template not found')
  if (patch.name && patch.name !== row.name) {
    const clash = await db.whatsAppTemplate.findUnique({
      where: { name: patch.name },
      select: { id: true },
    })
    if (clash) throw new WhatsAppAdminError(409, 'A template with this name already exists')
  }
  const updated = await db.whatsAppTemplate.update({
    where: { id: templateId },
    data: { ...patch },
    select: TEMPLATE_SELECT,
  })
  return serializeWhatsAppTemplate(updated)
}

export async function deleteTemplate(templateId: string): Promise<void> {
  const row = await db.whatsAppTemplate.findUnique({
    where: { id: templateId },
    select: { id: true },
  })
  if (!row) throw new WhatsAppAdminError(404, 'Template not found')
  // Campaign rows keep their rendered body — the templateId FK is SetNull, so
  // past sends stay fully auditable.
  await db.whatsAppTemplate.delete({ where: { id: templateId } })
}
