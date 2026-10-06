import { PrismaClient } from '@prisma/client'
const db = new PrismaClient()
const base = { status: 'ACTIVE', financierProfile: { organization: { status: 'ACTIVE' } } } as const

const cases: [string, Record<string, string | undefined>, unknown][] = [
  ['universe', {}, (await db.financierService.count({ where: { ...base } }))],
  ['kind=FINANCING', { kind: 'FINANCING' }, (await db.financierService.count({ where: { ...base, serviceKind: 'FINANCING' } }))],
  ['kind=ACCREDITATION', { kind: 'ACCREDITATION' }, (await db.financierService.count({ where: { ...base, serviceKind: 'ACCREDITATION' } }))],
  ["city=Sana'a", { city: "Sana'a" }, (await db.financierService.count({ where: { ...base, OR: [{ coverage: { some: { regionName: "Sana'a" } } }, { financierProfile: { branches: { some: { city: "Sana'a" } } } }] } }))],
  ['city=Hodeidah', { city: 'Hodeidah' }, (await db.financierService.count({ where: { ...base, OR: [{ coverage: { some: { regionName: 'Hodeidah' } } }, { financierProfile: { branches: { some: { city: 'Hodeidah' } } } }] } }))],
  ['rateMax=15', { rateMax: '15' }, (await db.financierService.count({ where: { ...base, rateMax: { lte: 15 } } }))],
  ['rateMax=20', { rateMax: '20' }, (await db.financierService.count({ where: { ...base, rateMax: { lte: 20 } } }))],
  ['amountMin=500000&amountMax=2000000', { amountMin: '500000', amountMax: '2000000' }, (await db.financierService.count({ where: { ...base, NOT: { amountMin: null, amountMax: null }, OR: [{ amountMax: { gte: 500000 } }, { amountMax: null }], AND: [{ OR: [{ amountMin: { lte: 2000000 } }, { amountMin: null }] }] } }))],
  ['amountMin=10000000 (10M+)', { amountMin: '10000000' }, (await db.financierService.count({ where: { ...base, NOT: { amountMin: null, amountMax: null }, amountMax: { gte: 10000000 } } }))],
  ['city=Sana%27a+kind=FINANCING+rateMax=25', { city: "Sana'a", kind: 'FINANCING', rateMax: '25' }, (await db.financierService.count({ where: { ...base, serviceKind: 'FINANCING', rateMax: { lte: 25 }, OR: [{ coverage: { some: { regionName: "Sana'a" } } }, { financierProfile: { branches: { some: { city: "Sana'a" } } } }] } }))],
]

for (const [label, params, manual] of cases) {
  const qs = new URLSearchParams()
  for (const [k, v] of Object.entries(params)) if (v != null) qs.set(k, v)
  const api = await fetch(`http://localhost:3000/api/financing/services?${qs.toString()}`).then((r) => r.json())
  const ok = api.total === manual
  console.log(`${ok ? 'MATCH' : '*** MISMATCH ***'} ${label}: manual=${manual} api=${api.total} (institutions=${api.institutionCount})`)
}

// facet cities + institution universe — manual
const cov = await db.financierServiceCoverage.findMany({ where: { service: { ...base } }, distinct: ['regionName'], select: { regionName: true } })
const br = await db.financierBranch.findMany({ where: { city: { not: null }, financierProfile: { organization: { status: 'ACTIVE' }, services: { some: { status: 'ACTIVE' } } } }, distinct: ['city'], select: { city: true } })
const apiAll = await fetch('http://localhost:3000/api/financing/services').then((r) => r.json())
const manualCities = [...new Set([...cov.map((c) => c.regionName), ...br.map((b) => b.city!)])].sort((a, b) => a.localeCompare(b))
console.log(`cities: manual=${manualCities.length} api=${apiAll.facets.cities.length} identical=${JSON.stringify(manualCities) === JSON.stringify(apiAll.facets.cities)}`)
console.log('cities:', apiAll.facets.cities.join(', '))
await db.$disconnect()
