// Task 10-b final cleanup: my probe offers + limit rows (audits kept as evidence).
import { PrismaClient } from '@prisma/client'
const db = new PrismaClient()
async function main() {
  // my probe offers on FIN-2026-000001 (amount 500, created 2026-10-05 22:42–22:43 by alamal admin)
  const ids = ['cmuvu57iv001sneholmidfl1r', 'cmuvu62bp002dnehowu7zwpvz']
  for (const id of ids) {
    const o = await db.financingOffer.findUnique({ where: { id }, select: { id: true, status: true, amount: true } })
    if (!o) { console.log('skip (absent)', id); continue }
    if (o.amount !== 500 || !['DRAFT', 'DECLINED'].includes(o.status)) {
      console.log('SKIP non-probe offer', id, o.status, o.amount); continue
    }
    await db.financingOffer.delete({ where: { id } })
    console.log('deleted probe offer', id, o.status)
  }
  // limit rows I created during the E2E (org + org:user for alamal admin)
  const profile = await db.financierProfile.findUniqueOrThrow({ where: { organizationId: 'cmuipydpj0002oktan3aec1vw' }, select: { id: true } })
  const del = await db.underwritingLimit.deleteMany({ where: { financierProfileId: profile.id } })
  console.log('deleted limit rows:', del.count, '(pre-probe state had 0 — restore-don\u2019t-rebuild)')
  const remaining = await db.underwritingLimit.count()
  console.log('total UnderwritingLimit rows left:', remaining)
}
main().finally(() => db.$disconnect())
