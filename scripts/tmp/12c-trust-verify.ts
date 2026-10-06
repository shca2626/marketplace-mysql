import { PrismaClient } from '@prisma/client'
const db = new PrismaClient()
const targets: [string, string][] = [
  ['HelioMount', 'cmuimbo860001okn0wu3ei0r7'],
  ['SunCore', 'cmuimbo880003okn0no72os14'],
  ['LumaRay', 'cmuimbo870002okn0pxi0ttdo'],
  ['company1', 'cmuu6dba90003lwipjmy9z6wz'],
]
for (const [label, id] of targets) {
  // independent counts (same semantics, written from scratch)
  const ordersFulfilled = (await db.orderItem.findMany({
    where: { sellerId: id },
    select: { id: true, fulfillmentItems: { select: { fulfillment: { select: { status: true } } } } },
  })).filter((i) => i.fulfillmentItems.some((fi) => fi.fulfillment.status === 'DELIVERED')).length
  const ordersTotal = new Set((await db.orderItem.findMany({ where: { sellerId: id }, select: { orderId: true } })).map((i) => i.orderId)).size
  const ordersWithDispute = new Set((await db.dispute.findMany({ where: { sellerId: id }, select: { orderId: true } })).map((d) => d.orderId)).size
  const profile = await db.sellerProfile.findFirst({ where: { ownerUserId: id }, select: { verificationState: true, organization: { select: { kycLevel: true } } } })
  const user = await db.user.findUnique({ where: { id }, select: { createdAt: true, phoneVerifiedAt: true } })
  const identityDoc = await db.accountDocument.findFirst({ where: { userId: id, isActive: true, status: 'VERIFIED', documentType: { in: ['NATIONAL_ID', 'PASSPORT', 'RESIDENCE_PERMIT'] } }, select: { id: true } })
  const manualKyc = user?.phoneVerifiedAt ? (identityDoc ? 2 : 1) : 0
  const expectedDisputeFree = ordersTotal >= 5 ? ordersWithDispute === 0 : null
  const expectedBadge = profile?.verificationState === 'VERIFIED' ? 'VERIFIED_BUSINESS' : manualKyc >= 2 ? 'IDENTITY_VERIFIED' : 'NEW_SELLER'
  const years = Math.round(((Date.now() - user!.createdAt.getTime()) / (365.25 * 24 * 3600 * 1000)) * 10) / 10
  const api = await fetch(`http://localhost:3000/api/sellers/${id}`).then((r) => r.json())
  const t = api.seller.trust
  const ok =
    t.ordersFulfilled === ordersFulfilled && t.ordersTotal === ordersTotal &&
    t.ordersWithDispute === ordersWithDispute && t.disputeFree === expectedDisputeFree &&
    (t.disputeRate ?? null) === (ordersTotal > 0 ? Math.round((ordersWithDispute / ordersTotal) * 1000) / 10 : null) &&
    t.kycLevel === manualKyc && t.verificationState === (profile?.verificationState ?? null) &&
    t.orgKycLevel === (profile?.organization.kycLevel ?? null) && t.badge === expectedBadge && t.memberYears === years
  console.log(`${ok ? 'MATCH' : '*** MISMATCH ***'} ${label}: manual {fulfilled=${ordersFulfilled}, orders=${ordersTotal}, disputed=${ordersWithDispute}, disputeFree=${expectedDisputeFree}, kyc=${manualKyc}, state=${profile?.verificationState ?? null}, orgKyc=${profile?.organization.kycLevel ?? null}, badge=${expectedBadge}, yrs=${years}} vs API ${JSON.stringify(t)}`)
}
await db.$disconnect()
