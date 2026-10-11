import { db } from '@/lib/db'
const SELLER = 'cmuimbo870002okn0pxi0ttdo' // LumaRay Lighting
async function main() {
  const before = await db.user.findUniqueOrThrow({ where: { id: SELLER }, select: { commissionRate: true } })
  console.log('before: commissionRate =', before.commissionRate)
  await db.user.update({ where: { id: SELLER }, data: { commissionRate: 7 } })
  const { previewPayout } = await import('@/server/modules/payouts/service')
  const p = await previewPayout(SELLER)
  console.log('preview with override=7: commissionRate =', p.commissionRate, '(expect 7 — vendor override wins over engine)')
  await db.user.update({ where: { id: SELLER }, data: { commissionRate: null } })
  const p2 = await previewPayout(SELLER)
  console.log('preview after restore: commissionRate =', p2.commissionRate, '(expect 10 — engine PLATFORM rule)')
  const after = await db.user.findUniqueOrThrow({ where: { id: SELLER }, select: { commissionRate: true } })
  console.log('restored: commissionRate =', after.commissionRate)
}
main().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1) })
