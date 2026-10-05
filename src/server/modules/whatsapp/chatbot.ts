import { z } from 'zod'
import { db } from '@/lib/db'
import { WhatsAppAdminError } from './admin'

// ─────────────────────────────────────────────────────────────────────────────
// WA-BIZ — chatbot auto-reply rules (admin console "Chatbot" tab).
//
// The Baileys mini-service evaluates every incoming WhatsApp text against the
// ACTIVE rules (priority asc, first match wins) and replies on the same paired
// line. /api/admin/whatsapp/chatbot/test runs the SAME matcher here for the
// live test console — pure evaluation, no message is ever sent. Keep
// chatbotRuleMatches below in sync with the service's copy in
// mini-services/whatsapp-service/index.ts (handleChatbotIncoming).
// ─────────────────────────────────────────────────────────────────────────────

export const CHATBOT_MATCH_TYPES = ['CONTAINS', 'EXACT', 'STARTS_WITH', 'REGEX'] as const

export const chatbotRuleCreateSchema = z.object({
  name: z.string().trim().min(1).max(80),
  matchType: z.enum(CHATBOT_MATCH_TYPES),
  pattern: z.string().trim().min(1).max(2000),
  reply: z.string().trim().min(1).max(4096),
  active: z.boolean().optional(),
  priority: z.number().int().min(0).max(9999).optional(),
})

export const chatbotRuleUpdateSchema = z.object({
  name: z.string().trim().min(1).max(80).optional(),
  matchType: z.enum(CHATBOT_MATCH_TYPES).optional(),
  pattern: z.string().trim().min(1).max(2000).optional(),
  reply: z.string().trim().min(1).max(4096).optional(),
  active: z.boolean().optional(),
  priority: z.number().int().min(0).max(9999).optional(),
})

// ── Matching (pure — mirrors the mini-service evaluation) ──────────────────

export interface MatchableRule {
  matchType: string
  pattern: string
}

/**
 * Case-insensitive rule matching, same semantics on both sides of the wire:
 *   CONTAINS | EXACT | STARTS_WITH compare the lowercased text against the
 *   lowercased pattern; REGEX compiles the RAW pattern source with the i flag
 *   inside a try/catch so an invalid regex NEVER throws — it simply never
 *   matches.
 */
export function chatbotRuleMatches(rule: MatchableRule, text: string): boolean {
  const haystack = text.trim().toLowerCase()
  if (!haystack) return false
  const needle = rule.pattern.trim().toLowerCase()
  if (!needle) return false
  switch (rule.matchType) {
    case 'CONTAINS':
      return haystack.includes(needle)
    case 'EXACT':
      return haystack === needle
    case 'STARTS_WITH':
      return haystack.startsWith(needle)
    case 'REGEX':
      try {
        return new RegExp(rule.pattern, 'i').test(text.trim())
      } catch {
        return false // invalid regex never throws — it just never matches
      }
    default:
      return false
  }
}

/** First match wins — pass the rows ORDERED BY priority asc. */
export function matchChatbotRule<T extends MatchableRule>(rules: T[], text: string): T | null {
  for (const rule of rules) {
    if (chatbotRuleMatches(rule, text)) return rule
  }
  return null
}

/** Rejects a REGEX rule whose source does not compile (fail at save, not mid-chat). */
function assertCompilableRegex(matchType: string, pattern: string): void {
  if (matchType !== 'REGEX') return
  try {
    new RegExp(pattern)
  } catch {
    throw new WhatsAppAdminError(400, 'Invalid regular expression pattern')
  }
}

// ── DTO ─────────────────────────────────────────────────────────────────────

export interface ChatbotRuleDTO {
  id: string
  name: string
  matchType: string
  pattern: string
  reply: string
  active: boolean
  priority: number
  hits: number
  createdAt: string
  updatedAt: string
}

type RuleRow = {
  id: string
  name: string
  matchType: string
  pattern: string
  reply: string
  active: boolean
  priority: number
  hits: number
  createdAt: Date
  updatedAt: Date
}

const RULE_SELECT = {
  id: true,
  name: true,
  matchType: true,
  pattern: true,
  reply: true,
  active: true,
  priority: true,
  hits: true,
  createdAt: true,
  updatedAt: true,
} as const

export function serializeChatbotRule(row: RuleRow): ChatbotRuleDTO {
  return {
    id: row.id,
    name: row.name,
    matchType: row.matchType,
    pattern: row.pattern,
    reply: row.reply,
    active: row.active,
    priority: row.priority,
    hits: row.hits,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  }
}

// ── CRUD ────────────────────────────────────────────────────────────────────

export async function listChatbotRules(): Promise<ChatbotRuleDTO[]> {
  const rows = await db.chatbotRule.findMany({
    orderBy: [{ priority: 'asc' }, { createdAt: 'asc' }],
    select: RULE_SELECT,
  })
  return rows.map(serializeChatbotRule)
}

export async function createChatbotRule(
  input: z.infer<typeof chatbotRuleCreateSchema>
): Promise<ChatbotRuleDTO> {
  assertCompilableRegex(input.matchType, input.pattern)
  const row = await db.chatbotRule.create({
    data: {
      name: input.name,
      matchType: input.matchType,
      pattern: input.pattern,
      reply: input.reply,
      active: input.active ?? true,
      priority: input.priority ?? 100,
    },
    select: RULE_SELECT,
  })
  return serializeChatbotRule(row)
}

export async function updateChatbotRule(
  ruleId: string,
  patch: z.infer<typeof chatbotRuleUpdateSchema>
): Promise<ChatbotRuleDTO> {
  const row = await db.chatbotRule.findUnique({
    where: { id: ruleId },
    select: RULE_SELECT,
  })
  if (!row) throw new WhatsAppAdminError(404, 'Rule not found')
  assertCompilableRegex(patch.matchType ?? row.matchType, patch.pattern ?? row.pattern)
  const updated = await db.chatbotRule.update({
    where: { id: ruleId },
    data: { ...patch },
    select: RULE_SELECT,
  })
  return serializeChatbotRule(updated)
}

export async function deleteChatbotRule(ruleId: string): Promise<void> {
  const row = await db.chatbotRule.findUnique({
    where: { id: ruleId },
    select: { id: true },
  })
  if (!row) throw new WhatsAppAdminError(404, 'Rule not found')
  await db.chatbotRule.delete({ where: { id: ruleId } })
}

// ── Live test console (pure evaluation) ──────────────────────────────────────

/**
 * Loads the ACTIVE rules (same ordering the mini-service uses) and returns the
 * first match together with its id — callers that actually reply increment
 * hits themselves. Returns null when nothing matches.
 */
export async function matchActiveChatbotRule(
  text: string
): Promise<{ id: string; name: string; reply: string } | null> {
  const rows = await db.chatbotRule.findMany({
    where: { active: true },
    orderBy: [{ priority: 'asc' }, { createdAt: 'asc' }],
    select: { id: true, name: true, matchType: true, pattern: true, reply: true },
  })
  const matched = matchChatbotRule(rows, text)
  return matched ? { id: matched.id, name: matched.name, reply: matched.reply } : null
}

/**
 * Runs a sample text through the ACTIVE rules exactly as the mini-service
 * would — same ordering, same matcher, but WITHOUT sending anything.
 */
export async function testChatbotSample(
  sample: string
): Promise<{ name: string; reply: string } | null> {
  const matched = await matchActiveChatbotRule(sample)
  return matched ? { name: matched.name, reply: matched.reply } : null
}
