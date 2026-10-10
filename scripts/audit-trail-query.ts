// ─────────────────────────────────────────────────────────────────────────────
// AUDIT-TRAIL QUERY — what did the Phase 7 cleanup actually record?
// READ-ONLY. Looks for cleanup/demotion/deletion audit actions and email
// repairs, plus the OFFER_CREATED reseed records.
// ─────────────────────────────────────────────────────────────────────────────
import { db } from '../src/lib/db'

async function main() {
  const since = new Date('2026-10-09T21:00:00Z')
  const actions = await db.auditLog.findMany({
    where: { createdAt: { gte: since } },
    orderBy: { createdAt: 'asc' },
    select: { action: true, summary: true, createdAt: true, actorType: true },
    take: 400,
  })
  const byAction: Record<string, number> = {}
  for (const a of actions) byAction[a.action] = (byAction[a.action] ?? 0) + 1
  console.log('── Actions recorded since 2026-10-09T21:00Z ──')
  console.log(JSON.stringify(byAction, null, 2))
  console.log('── Non-login/offer records ──')
  for (const a of actions) {
    if (!['USER_LOGIN', 'OFFER_CREATED', 'CONTEXT_SWITCHED'].includes(a.action)) {
      console.log(`${a.createdAt.toISOString()}  ${a.action.padEnd(28)} ${a.summary}`)
    }
  }
  // Email repairs: users whose email is a placeholder now
  const placeholders = await db.user.findMany({
    where: { email: { contains: 'placeholder.vendora' } },
    select: { id: true, name: true, email: true, createdAt: true },
  })
  console.log('── Placeholder-email users (repairs) ──')
  console.log(JSON.stringify(placeholders, null, 2))
  // Any audit for email repair at all
  const emailAudit = await db.auditLog.findMany({
    where: { OR: [{ action: { contains: 'EMAIL' } }, { summary: { contains: 'email' } }, { summary: { contains: 'repaired' } }] },
    orderBy: { createdAt: 'desc' },
    take: 30,
    select: { action: true, summary: true, createdAt: true },
  })
  console.log('── Email-related audit records ──')
  for (const a of emailAudit) console.log(`${a.createdAt.toISOString()}  ${a.action.padEnd(28)} ${a.summary}`)
}

main()
  .catch((e) => {
    console.error('FAILED:', e)
    process.exit(1)
  })
  .finally(async () => {
    await db.$disconnect()
  })
