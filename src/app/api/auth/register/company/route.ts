import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { db } from '@/lib/db'
import { getSessionUser, toSessionUser } from '@/lib/auth'
import { assertSameOrigin, enforceRateLimit } from '@/lib/http'
import { RATE_LIMITS } from '@/lib/rate-limit'
import { recordAudit } from '@/server/modules/audit/service'
import { buildSessionRbac } from '@/server/modules/rbac/service'
import { emitNotification } from '@/server/modules/notifications/service'

/**
 * PHASE 3 — Merchant/Dealer COMPANY registration (final step of the wizard).
 *
 * The wizard's step 1 already created the owner's user account (customer
 * fast path, role BUYER) and steps 2-4 collected the business profile, KYB
 * documents (uploaded to the caller's vault) and the store intent. This
 * endpoint assembles the company:
 *
 *   Organization (COMPANY · PENDING_VERIFICATION · merchantType) + OWNER
 *   membership + User.merchantType + vault docs re-scoped to the org +
 *   (intent SELL/BOTH) user role → SELLER + storeName, idempotently.
 *
 * Admin verification afterwards (admin console → Organizations) flips the
 * org ACTIVE. kycLevel is intentionally NOT set here (task 3-d's engine).
 */

const schema = z.object({
  legalName: z.string().trim().min(2, 'Legal name must be at least 2 characters').max(200),
  tradeName: z.string().trim().min(2, 'Trade name must be at least 2 characters').max(120),
  merchantType: z.enum(['EXCLUSIVE_AGENT', 'AUTHORIZED_AGENT', 'DISTRIBUTOR', 'WHOLESALER', 'RETAILER']),
  registrationNumber: z.string().trim().max(60).optional(),
  taxId: z.string().trim().max(60).optional(),
  industry: z.string().trim().max(80).optional(),
  governorate: z.string().trim().max(60).optional(),
  address: z.string().trim().max(400).optional(),
  intent: z.enum(['SELL', 'BUY', 'BOTH']),
  storeName: z.string().trim().min(2).max(60).optional(),
  storeCategorySlug: z.string().trim().max(80).optional(),
  docIds: z.array(z.string().trim().min(1).max(64)).max(10).optional(),
  acceptsTerms: z.literal(true, { message: 'You must confirm the business information is accurate' }),
})

function slugify(name: string): string {
  return (
    name
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 60) || 'org'
  )
}

async function uniqueSlug(base: string): Promise<string> {
  let slug = slugify(base)
  let suffix = 1
  while (await db.organization.findUnique({ where: { slug } })) {
    suffix += 1
    slug = `${slugify(base)}-${suffix}`
  }
  return slug
}

function serializeOrg(org: {
  id: string
  name: string
  slug: string
  orgType: string
  legalName: string | null
  merchantType: string | null
  status: string
}) {
  return {
    id: org.id,
    name: org.name,
    slug: org.slug,
    orgType: org.orgType,
    legalName: org.legalName,
    merchantType: org.merchantType,
    status: org.status,
  }
}

export async function POST(req: NextRequest) {
  try {
    const csrf = assertSameOrigin(req)
    if (csrf) return csrf

    const user = await getSessionUser()
    if (!user) {
      return NextResponse.json(
        { error: 'Create your owner account first (wizard step 1), then submit the company.' },
        { status: 401 }
      )
    }

    const rl = enforceRateLimit(req, 'register-company', RATE_LIMITS.companyRegister, user.id)
    if (rl) return rl

    const parsed = schema.safeParse(await req.json())
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message ?? 'Invalid input' },
        { status: 400 }
      )
    }
    const input = parsed.data

    // One user owns one organization. A resubmitted wizard is idempotent:
    // owning a COMPANY org returns it instead of erroring (role flip applies).
    const existingMembership = await db.organizationMember.findFirst({
      where: { userId: user.id, role: 'OWNER' },
      include: { organization: true },
    })
    if (existingMembership) {
      if (existingMembership.organization.orgType !== 'COMPANY') {
        return NextResponse.json(
          { error: 'This account already owns a financial institution. Use a separate owner account for the company.' },
          { status: 409 }
        )
      }
      const org = existingMembership.organization
      const updated = await db.user.update({
        where: { id: user.id },
        data: {
          merchantType: input.merchantType,
          ...(input.intent !== 'BUY' && user.role === 'BUYER'
            ? { role: 'SELLER', storeName: input.storeName ?? user.storeName ?? input.tradeName }
            : {}),
        },
      })
      const rbac = await buildSessionRbac(updated)
      return NextResponse.json({
        organization: serializeOrg(org),
        user: toSessionUser(updated, rbac),
        alreadyRegistered: true,
      })
    }

    const slug = await uniqueSlug(input.tradeName)
    const billingAddress = [input.address?.trim(), input.governorate?.trim()].filter(Boolean).join(', ') || null

    const org = await db.$transaction(async (tx) => {
      const created = await tx.organization.create({
        data: {
          name: input.tradeName,
          slug,
          legalName: input.legalName,
          merchantType: input.merchantType,
          orgType: 'COMPANY',
          status: 'PENDING_VERIFICATION',
          registrationNumber: input.registrationNumber || null,
          taxId: input.taxId || null,
          industry: input.industry || null,
          billingAddress,
          members: { create: { userId: user.id, role: 'OWNER' } },
        },
      })

      // Re-scope the wizard's KYB uploads (the caller's vault docs) to the new
      // org. Ownership-scoped: only docs uploaded by this user can be linked.
      let linkedDocs = 0
      if (input.docIds?.length) {
        const res = await tx.accountDocument.updateMany({
          where: { id: { in: input.docIds }, userId: user.id },
          data: { organizationId: created.id },
        })
        linkedDocs = res.count
      }

      // Seller flip for sell intents (admins never lose their platform role —
      // same guard as become-seller).
      await tx.user.update({
        where: { id: user.id },
        data: {
          merchantType: input.merchantType,
          ...(input.intent !== 'BUY' && user.role === 'BUYER'
            ? { role: 'SELLER', storeName: input.storeName ?? input.tradeName }
            : {}),
        },
      })

      return { created, linkedDocs }
    })

    await recordAudit({
      actorId: user.id,
      actorType: 'USER',
      action: 'ORG_REGISTERED_MERCHANT',
      entityType: 'Organization',
      entityId: org.created.id,
      summary: `Merchant/Dealer company registered: "${org.created.name}" (${input.merchantType}) — pending verification`,
      metadata: {
        orgId: org.created.id,
        merchantType: input.merchantType,
        intent: input.intent,
        storeName: input.storeName ?? null,
        storeCategorySlug: input.storeCategorySlug ?? null,
        linkedDocs: org.linkedDocs,
        governorate: input.governorate ?? null,
      },
    })

    await emitNotification({
      userId: user.id,
      type: 'APPLICATION_RECEIVED',
      title: 'Application received',
      body: 'Your merchant application is under review — we’ll notify you here and on WhatsApp once your company is verified.',
      linkView: 'business',
      linkId: org.created.id,
    })

    // Fresh session user for the client (role may have flipped to SELLER).
    const updatedUser = await db.user.findUniqueOrThrow({ where: { id: user.id } })
    const rbac = await buildSessionRbac(updatedUser)
    return NextResponse.json(
      { organization: serializeOrg(org.created), user: toSessionUser(updatedUser, rbac) },
      { status: 201 }
    )
  } catch (err) {
    console.error('register company error', err)
    return NextResponse.json({ error: 'Company registration failed' }, { status: 500 })
  }
}
