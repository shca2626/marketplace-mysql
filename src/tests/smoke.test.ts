// Smoke test for the vitest route-handler infrastructure.
//
// Verifies the three pillars everything else builds on:
//   1. DATABASE_URL points at the vendora_test MySQL database (Prisma works)
//   2. Route handlers can be imported and invoked directly with NextRequests,
//      with session state flowing through the next/headers stub cookie jar
//   3. The public catalog route executes its SQL path and answers 200
import { afterAll, beforeEach, describe, expect, it } from 'vitest'
import { POST as registerPOST } from '@/app/api/auth/register/route'
import { GET as meGET } from '@/app/api/auth/me/route'
import { GET as productsGET } from '@/app/api/products/route'
import { db } from '@/lib/db'
import { cookieJar } from '@/tests/stubs/next-headers'
import {
  cleanupFixtures,
  clearSession,
  getReq,
  postReq,
  trackUser,
  uniq,
} from '@/tests/fixtures'

describe('test infrastructure smoke', () => {
  beforeEach(() => {
    cookieJar.clear()
  })

  it('connects to the test database', async () => {
    await expect(db.user.count()).resolves.toBeGreaterThanOrEqual(0)
  })

  it('registers a buyer and establishes a session through the route handler', async () => {
    const email = `${uniq('smoke')}@t.dev`
    const name = uniq('Smoke Buyer')

    const res = await registerPOST(
      postReq('/api/auth/register', {
        name,
        email,
        password: 'Passw0rd!123',
        role: 'BUYER',
      }),
    )
    expect([200, 201]).toContain(res.status)

    const body = await res.json()
    expect(body.user).toMatchObject({ email, name, role: 'BUYER' })
    trackUser(body.user.id) // registered through the API — register for cleanup

    // The route called cookies().set(...) on the stub → our jar holds the session.
    expect(cookieJar.has('vendora_session')).toBe(true)

    // With that cookie, GET /api/auth/me resolves the session user.
    const meRes = await meGET()
    expect(meRes.status).toBe(200)
    const me = await meRes.json()
    expect(me.user).toMatchObject({ id: body.user.id, email, role: 'BUYER' })

    clearSession()
    const anonRes = await meGET()
    expect(anonRes.status).toBe(200)
    expect((await anonRes.json()).user).toBeNull()
  })

  it('lists the public catalog through the products route handler', async () => {
    const res = await productsGET(getReq('/api/products'))
    expect(res.status).toBe(200)
    const data = await res.json()
    expect(Array.isArray(data.items)).toBe(true)
    expect(data.total).toBeGreaterThanOrEqual(0)
    expect(data.page).toBe(1)
    expect(data.pages).toBeGreaterThanOrEqual(1)
  })

  afterAll(async () => {
    await cleanupFixtures()
  })
})
