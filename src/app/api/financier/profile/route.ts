import { NextResponse } from 'next/server'
import { requireUser } from '@/server/guards'
import { db } from '@/lib/db'
import { requireFinancierContext, FinancingError, iso } from '@/server/modules/financing/shared'

// GET /api/financier/profile — the console's Profile section: the staff
// member's institution org + FinancierProfile facts (license, regulator,
// contact, ticket range). READ-ONLY — profile facts are maintained through
// the platform onboarding flow (admin institutions console).
export async function GET() {
  const { user, error } = await requireUser()
  if (error) return error
  try {
    const ctx = await requireFinancierContext(user.id)
    const [organization, profile] = await Promise.all([
      db.organization.findUnique({
        where: { id: ctx.organizationId },
        select: {
          id: true,
          name: true,
          legalName: true,
          orgType: true,
          status: true,
          verifiedAt: true,
          taxId: true,
          registrationNumber: true,
          industry: true,
          website: true,
          createdAt: true,
        },
      }),
      db.financierProfile.findUnique({
        where: { organizationId: ctx.organizationId },
        select: {
          about: true,
          licenseNumber: true,
          regulator: true,
          contactEmail: true,
          contactPhone: true,
          minTicket: true,
          maxTicket: true,
          viewCount: true,
        },
      }),
    ])
    return NextResponse.json({
      organization: organization
        ? { ...organization, verifiedAt: iso(organization.verifiedAt), createdAt: organization.createdAt.toISOString() }
        : null,
      profile,
    })
  } catch (err) {
    if (err instanceof FinancingError) {
      return NextResponse.json({ error: err.message }, { status: err.status })
    }
    console.error('financier profile GET error', err)
    return NextResponse.json({ error: 'Failed to load the institution profile' }, { status: 500 })
  }
}
