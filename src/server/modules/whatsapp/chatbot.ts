// ─────────────────────────────────────────────────────────────────────────────
// WHATSAPP SUITE · Chatbot rule engine (agent 8-a)
//
// Loads active ChatbotRule rows ordered by priority DESC and returns the first
// rule matching the incoming text. Shared by the internal WhatsApp webhook
// (auto-reply) and the admin simulator (via /api/whatsapp/rules/test).
// ─────────────────────────────────────────────────────────────────────────────

import { db } from '@/lib/db'
import { renderTemplateBody } from './variables'

export interface ChatbotMatch {
  ruleId: string
  reply: string
}

/** Does `text` satisfy this rule's pattern under its match type? */
function ruleMatches(rule: { matchType: string; pattern: string }, text: string): boolean {
  const haystack = text.trim()
  const needle = rule.pattern.trim()
  if (!needle) return false
  switch (rule.matchType) {
    case 'EXACT':
      return haystack.toLowerCase() === needle.toLowerCase()
    case 'STARTS_WITH':
      return haystack.toLowerCase().startsWith(needle.toLowerCase())
    case 'REGEX': {
      try {
        return new RegExp(rule.pattern, 'i').test(haystack)
      } catch {
        return false // invalid regex — skip the rule instead of crashing
      }
    }
    case 'CONTAINS':
    default:
      return haystack.toLowerCase().includes(needle.toLowerCase())
  }
}

/**
 * Find the highest-priority active rule matching `text`. Increments the
 * winning rule's hit counter (fire-and-forget) so the admin list stays honest.
 */
export async function matchChatbotRule(text: string): Promise<ChatbotMatch | null> {
  if (!text || !text.trim()) return null
  const rules = await db.chatbotRule.findMany({
    where: { active: true },
    orderBy: [{ priority: 'desc' }, { createdAt: 'asc' }],
    select: { id: true, name: true, matchType: true, pattern: true, reply: true },
  })
  const winner = rules.find((rule) => ruleMatches(rule, text))
  if (!winner) return null

  // fire-and-forget hit counter
  void db.chatbotRule
    .update({ where: { id: winner.id }, data: { hits: { increment: 1 } } })
    .catch((err) => console.error('[whatsapp/chatbot] hit increment failed', err))

  return { ruleId: winner.id, reply: winner.reply }
}

/**
 * Full auto-reply pipeline for an incoming message: match a rule, then render
 * its reply with the runtime variables (date, time and a generic name).
 * Returns null when no rule matches — staff handles it from the Inbox.
 */
export async function runAutoReply(text: string): Promise<string | null> {
  const match = await matchChatbotRule(text)
  if (!match) return null
  const now = new Date()
  const reply = renderTemplateBody(match.reply, {
    name: 'customer',
    date: now.toLocaleDateString('en-GB'),
    time: now.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }),
  })
  return reply || null
}
