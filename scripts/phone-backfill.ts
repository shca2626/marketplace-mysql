/**
 * PHASE 3 pre-migration — normalize + dedupe User.phone BEFORE the column
 * becomes @unique (prisma db push would fail on duplicates).
 *
 * Rules:
 *  - Yemeni numbers: accept +967/00967/967/0 prefixes or bare 9-digit local
 *    (70|71|73|77|78 + 7 digits) → store as +967XXXXXXXXX
 *  - Generic international E.164 (+NNNNNNN..., 8–15 digits) → keep as-is
 *  - Anything unparseable → null (phone is optional per-row)
 *  - Duplicates after normalization → earliest-created user keeps it, the
 *    rest are nulled (report printed so nothing is lost silently)
 *
 * Run: bun scripts/phone-backfill.ts
 */
import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

const YEMEN_LOCAL = /^(70|71|73|77|78)\d{7}$/

export function normalizePhone(raw: string): string | null {
  if (!raw) return null
  let s = raw.trim().replace(/[\s\-()·.]/g, '')
  if (!s) return null
  // strip a leading trunk zero before country code forms
  if (s.startsWith('00')) s = `+${s.slice(2)}`
  if (s.startsWith('+967')) {
    const local = s.slice(4)
    return YEMEN_LOCAL.test(local) ? `+967${local}` : null
  }
  if (s.startsWith('967') && s.length === 12) {
    const local = s.slice(3)
    return YEMEN_LOCAL.test(local) ? `+967${local}` : null
  }
  if (s.startsWith('0') && s.length === 10) {
    const local = s.slice(1)
    return YEMEN_LOCAL.test(local) ? `+967${local}` : null
  }
  if (YEMEN_LOCAL.test(s)) return `+967${s}`
  // generic E.164 international (non-Yemeni) — keep as-is
  if (/^\+\d{8,15}$/.test(s)) return s
  return null
}

async function main() {
  const users = await prisma.user.findMany({
    where: { phone: { not: null } },
    select: { id: true, phone: true, email: true, name: true, createdAt: true },
    orderBy: { createdAt: 'asc' },
  })
  console.log(`[phone-backfill] users with a phone value: ${users.length}`)

  const seen = new Set<string>()
  let normalized = 0
  let nulled = 0
  let dupes = 0
  let untouched = 0

  for (const u of users) {
    const original = u.phone as string
    const norm = normalizePhone(original)
    if (!norm) {
      await prisma.user.update({ where: { id: u.id }, data: { phone: null } })
      nulled++
      console.log(`  ✗ invalid → null: ${u.email ?? u.id} ("${original}")`)
      continue
    }
    if (norm === original) {
      untouched++
    } else {
      normalized++
      console.log(`  ↺ normalized: ${u.email ?? u.id} "${original}" → "${norm}"`)
    }
    if (seen.has(norm)) {
      await prisma.user.update({ where: { id: u.id }, data: { phone: null } })
      dupes++
      console.log(`  ⚠ duplicate → null: ${u.email ?? u.id} ("${norm}")`)
      continue
    }
    seen.add(norm)
    if (norm !== original) {
      await prisma.user.update({ where: { id: u.id }, data: { phone: norm } })
    }
  }

  console.log(
    `[phone-backfill] done — already-clean: ${untouched}, normalized: ${normalized}, invalid→null: ${nulled}, duplicates→null: ${dupes}`
  )
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(() => prisma.$disconnect())
