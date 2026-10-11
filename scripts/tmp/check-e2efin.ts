import { db } from '../../src/lib/db'

async function main() {
  const orgs = await db.organization.findMany({ where: { name: { startsWith: 'E2EFIN' } }, select: { id: true, name: true } })
  const applicantOrgId = orgs.find(o => o.name.includes('Applicant'))!.id
  const supplierOrgId = orgs.find(o => o.name.includes('Supplier'))!.id
  const bankOrgId = orgs.find(o => o.name.includes('Bank'))!.id
  const products = await db.product.findMany({ where: { title: { startsWith: 'E2EFIN' } }, select: { id: true, title: true } })
  const productId = products[0].id
  const offers = await db.productOffer.findMany({ where: { productId }, select: { id: true, price: true, stock: true, status: true, sellerOrgId: true, storeId: true } })
  console.log('offers:', JSON.stringify(offers))
  // Financing request
  const reqs = await db.financingRequest.findMany({ where: { organizationId: applicantOrgId }, select: { id: true, number: true, status: true, serviceId: true } })
  for (const r of reqs) console.log('REQ', r.id, r.number, r.status)
  const reqId = reqs[0].id
  // Supplier RFQ created from this request?
  const rfqs = await db.rfq.findMany({ where: { financingRequestId: reqId } })
  for (const r of rfqs) {
    console.log('RFQ', r.id, r.number, 'status=' + r.status, 'org=' + r.organizationId, 'store=' + r.storeId)
  }
  // Quotes on those RFQs
  if (rfqs.length) {
    const quotes = await db.quote.findMany({ where: { rfqId: { in: rfqs.map(r => r.id) } } })
    for (const q of quotes) {
      console.log('QUOTE', q.id, 'status=' + q.status, 'org=' + q.organizationId, 'total=' + q.totalAmount, 'created=' + q.createdAt.toISOString())
    }
  }
  await db.$disconnect()
}
main().catch(e => { console.error(e); process.exit(1) })
