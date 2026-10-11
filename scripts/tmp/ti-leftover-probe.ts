// one-off diagnostic: find rows blocking TI fixture user deletion
import { db } from '../../src/lib/db'

async function main() {
  const users = await db.user.findMany({
    where: { email: { contains: 'ti-' } },
    select: { id: true, email: true },
  })
  console.log('leftover TI users:', users.length)
  const ids = users.map((u) => u.id)
  if (ids.length === 0) return
  const probes: Array<[string, string]> = [
    ['MediaAsset', 'uploadedById'],
    ['Quote', 'createdById'],
    ['Rfq', 'userId'],
    ['FinancingRequest', 'userId'],
    ['Payment', 'capturedById'],
    ['ProductOffer', 'sellerId'],
    ['CommissionObligation', 'sellerId'],
    ['ExternalSettlementReference', 'declaredById'],
    ['Notification', 'userId'],
    ['OrganizationMember', 'userId'],
    ['UserRole', 'userId'],
    ['VaultAccessGrant', 'userId'],
    ['ApprovalRequest', 'requesterId'],
    ['Order', 'buyerId'],
    ['FinancierProfile', 'ownerId'],
  ]
  const marks = ids.map(() => '?').join(',')
  for (const [t, col] of probes) {
    try {
      const rows = (await db.$queryRawUnsafe(
        `SELECT COUNT(*) AS c FROM \`${t}\` WHERE \`${col}\` IN (${marks})`,
        ...ids
      )) as { c: number }[]
      const c = Number(rows[0].c)
      if (c > 0) console.log('BLOCKER:', `${t}.${col}`, c)
    } catch (e) {
      console.log('probe-skip:', t, (e as Error).message.slice(0, 60))
    }
  }
  console.log('probe done')
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(() => db.$disconnect())
