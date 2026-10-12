import { db } from '../../src/lib/db'
async function main() {
  // Full chain: order → sourceQuote → rfq → financingRequest → agreement
  const order = await db.order.findFirstOrThrow({ where: { sourceQuoteId: { not: null } }, orderBy: { createdAt: 'desc' }, include: { items: true, payment: true } })
  console.log('ORDER', order.id, 'status=' + order.status, 'sourceType=' + order.sourceType, 'sourceQuoteId=' + order.sourceQuoteId)
  const quote = await db.quote.findUniqueOrThrow({ where: { id: order.sourceQuoteId! } })
  console.log('QUOTE', quote.number, 'status=' + quote.status)
  const rfq = await db.rfq.findUniqueOrThrow({ where: { id: quote.rfqId } })
  console.log('RFQ', rfq.number, 'kind=' + rfq.kind, 'financingRequestId=' + rfq.financingRequestId, 'version=' + rfq.version)
  const req = await db.financingRequest.findUniqueOrThrow({ where: { id: rfq.financingRequestId! } })
  console.log('FIN-REQ', req.number, 'status=' + req.status)
  const agr = await db.financingAgreement.findFirstOrThrow({ where: { offer: { requestId: req.id } }, include: { offer: { include: { installments: true } } } })
  console.log('AGREEMENT', agr.number, 'status=' + agr.status, 'funding=' + agr.fundingStatus)
  console.log('REPAYMENT schedule:', agr.offer.installments.length, 'installments, total', agr.offer.installments.reduce((s,i)=>s+i.amount,0))
  // payments
  for (const p of order.payment ? [order.payment] : []) console.log('PAYMENT', p.method, p.amount, p.status)
  // stock effect
  const offer = await db.productOffer.findFirstOrThrow({ where: { id: order.items[0].offerId! } })
  console.log('OFFER stock after order: ' + offer.stock + ' soldCount: ' + offer.soldCount)
  const org = await db.organization.findUniqueOrThrow({ where: { id: order.organizationId! } })
  console.log('ORDER attributed to org: ' + org.name)
  await db.$disconnect()
}
main().catch(e => { console.error(e); process.exit(1) })
