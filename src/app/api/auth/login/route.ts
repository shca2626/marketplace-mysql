import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { db } from '@/lib/db'
import { setSessionCookie, toSessionUser, verifyPassword } from '@/lib/auth'

const loginSchema = z.object({
  email: z.string().email('Invalid email address'),
  password: z.string().min(1, 'Password is required'),
})

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const parsed = loginSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message ?? 'Invalid input' },
        { status: 400 }
      )
    }
    const { email, password } = parsed.data

    const user = await db.user.findUnique({ where: { email: email.toLowerCase() } })
    if (!user || !verifyPassword(password, user.password)) {
      return NextResponse.json({ error: 'Invalid email or password' }, { status: 401 })
    }

    await setSessionCookie(user.id)
    return NextResponse.json({ user: toSessionUser(user) })
  } catch (err) {
    console.error('login error', err)
    return NextResponse.json({ error: 'Login failed' }, { status: 500 })
  }
}
