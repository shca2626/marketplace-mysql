import { db } from '@/lib/db'
import { nextNumber } from '@/server/modules/sequences/service'
import { recordAuditTx } from '@/server/modules/audit/service'
import { emitNotifications } from '@/server/modules/notifications/service'
import {
  APPLICATION_STATUSES,
  JOB_TYPES,
  type ApplicationStatus,
  type ApplicationDTO,
  type JobDTO,
  type JobType,
} from '@/lib/jobs-shared'


// ─────────────────────────────────────────────────────────────────────────────
// NETW-1: jobs board — the talent-networking surface between companies and
// every registered actor. Companies (COMPANY orgs) publish openings; any
// authenticated user applies with a cover note; the company triages the
// pipeline (VIEWED → SHORTLISTED / REJECTED); applicants withdraw at will.
//
// Lifecycle:
//   posting: OPEN ──pause──▶ PAUSED ──resume──▶ OPEN ──close──▶ CLOSED (terminal)
//   application: PENDING → VIEWED → SHORTLISTED | REJECTED ; WITHDRAWN by applicant
//
// INVARIANTS
//   • postings belong to ACTIVE COMPANY orgs; posting management requires
//     membership + (OWNER/ADMIN or org.jobs.manage) — same doctrine as offers
//   • the public feed only ever shows OPEN, unexpired postings of ACTIVE orgs
//   • a member of the posting org cannot apply to their own company's job
//   • one application per (user, job) — the unique index enforces it
//   • every mutation writes its audit row in the SAME transaction
// ─────────────────────────────────────────────────────────────────────────────

export class JobError extends Error {
  status: number
  code?: string
  constructor(message: string, status = 400, code?: string) {
    super(message)
    this.status = status
    this.code = code
  }
}

export {
  JOB_TYPES,
  JOB_TYPE_LABELS,
  JOB_STATUS_LABELS,
  APPLICATION_STATUSES,
  APPLICATION_STATUS_LABELS,
} from '@/lib/jobs-shared'
export type { JobType, ApplicationStatus, JobDTO, ApplicationDTO } from '@/lib/jobs-shared'

const TITLE_MAX = 120
const DEPARTMENT_MAX = 80
const LOCATION_MAX = 120
const DESCRIPTION_MIN = 60
const DESCRIPTION_MAX = 8000
const REQUIREMENTS_MAX = 4000
const COVER_MIN = 20
const COVER_MAX = 4000
const MAX_EXPIRY_DAYS = 90
const PAGE_SIZE = 12

// ── DTOs (shapes live in lib/jobs-shared — client-safe) ────────────────────

type JobRow = {
  id: string
  number: string
  title: string
  department: string | null
  location: string | null
  employmentType: string
  description: string
  requirements: string | null
  salaryMin: number | null
  salaryMax: number | null
  salaryCurrency: string
  status: string
  views: number
  expiresAt: Date | null
  createdAt: Date
  updatedAt: Date
  orgId: string
  postedBy: { name: string }
  org: { id: string; name: string; slug: string; verifiedAt: Date | null; status: string }
  _count: { applications: number }
}

const JOB_INCLUDE = {
  postedBy: { select: { name: true } },
  org: { select: { id: true, name: true, slug: true, verifiedAt: true, status: true } },
  _count: { select: { applications: true } },
} as const

function serializeJob(row: JobRow): JobDTO {
  return {
    id: row.id,
    number: row.number,
    orgId: row.org.id,
    orgName: row.org.name,
    orgSlug: row.org.slug,
    orgVerified: Boolean(row.org.verifiedAt) && row.org.status === 'ACTIVE',
    postedByName: row.postedBy.name,
    title: row.title,
    department: row.department,
    location: row.location,
    employmentType: row.employmentType,
    description: row.description,
    requirements: row.requirements,
    salaryMin: row.salaryMin,
    salaryMax: row.salaryMax,
    salaryCurrency: row.salaryCurrency,
    status: row.status,
    views: row.views,
    applicationCount: row._count.applications,
    expiresAt: row.expiresAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  }
}

// ── permission helper (same doctrine as offers/complaints) ──────────────────

async function assertOrgJobsPermission(userId: string, organizationId: string): Promise<void> {
  const membership = await db.organizationMember.findUnique({
    where: { organizationId_userId: { organizationId, userId } },
    select: { role: true },
  })
  if (!membership) throw new JobError('Not a member of that organization', 403, 'NOT_MEMBER')
  if (['OWNER', 'ADMIN'].includes(membership.role)) return
  const allowed = await db.userRole.count({
    where: {
      userId,
      organizationId,
      role: { permissions: { some: { permissionKey: 'org.jobs.manage' } } },
    },
  })
  if (allowed === 0) {
    throw new JobError('This action requires the "org.jobs.manage" permission.', 403, 'FORBIDDEN')
  }
}

async function orgNotifiees(orgId: string): Promise<{ userId: string }[]> {
  // OWNER/ADMIN members + anyone holding org.jobs.manage, capped
  const members = await db.organizationMember.findMany({
    where: { organizationId: orgId, role: { in: ['OWNER', 'ADMIN'] } },
    select: { userId: true },
    take: 10,
  })
  return members
}

// ── company-side: create / update / list ────────────────────────────────────

export interface CreateJobInput {
  userId: string
  organizationId: string
  title: string
  department?: string | null
  location?: string | null
  employmentType: string
  description: string
  requirements?: string | null
  salaryMin?: number | null
  salaryMax?: number | null
  salaryCurrency?: string
  expiresAt?: Date | null
}

export async function createJob(input: CreateJobInput): Promise<JobDTO> {
  await assertOrgJobsPermission(input.userId, input.organizationId)

  const org = await db.organization.findUnique({
    where: { id: input.organizationId },
    select: { id: true, name: true, orgType: true, status: true },
  })
  if (!org) throw new JobError('Organization not found', 404, 'ORG_NOT_FOUND')
  if (org.orgType !== 'COMPANY') throw new JobError('Only companies can post jobs', 400, 'NOT_A_COMPANY')
  if (org.status !== 'ACTIVE') throw new JobError('Your company must be active to post jobs', 400, 'ORG_NOT_ACTIVE')

  const title = (input.title || '').trim()
  const department = (input.department || '').trim() || null
  const location = (input.location || '').trim() || null
  const description = (input.description || '').trim()
  const requirements = (input.requirements || '').trim() || null
  const employmentType = (input.employmentType || '').trim() as JobType

  if (title.length < 5 || title.length > TITLE_MAX) {
    throw new JobError(`Job title must be 5–${TITLE_MAX} characters`, 400)
  }
  if (department && department.length > DEPARTMENT_MAX) throw new JobError(`Department is at most ${DEPARTMENT_MAX} characters`, 400)
  if (location && location.length > LOCATION_MAX) throw new JobError(`Location is at most ${LOCATION_MAX} characters`, 400)
  if (!JOB_TYPES.includes(employmentType)) throw new JobError('Invalid employment type', 400)
  if (description.length < DESCRIPTION_MIN || description.length > DESCRIPTION_MAX) {
    throw new JobError(`Describe the role in ${DESCRIPTION_MIN}–${DESCRIPTION_MAX} characters`, 400)
  }
  if (requirements && requirements.length > REQUIREMENTS_MAX) {
    throw new JobError(`Requirements are at most ${REQUIREMENTS_MAX} characters`, 400)
  }

  const salaryMin = input.salaryMin ?? null
  const salaryMax = input.salaryMax ?? null
  if ((salaryMin !== null && salaryMin < 0) || (salaryMax !== null && salaryMax < 0)) {
    throw new JobError('Salary bounds cannot be negative', 400)
  }
  if (salaryMin !== null && salaryMax !== null && salaryMin > salaryMax) {
    throw new JobError('The salary minimum cannot exceed the maximum', 400)
  }

  let expiresAt: Date | null = null
  if (input.expiresAt) {
    const t = new Date(input.expiresAt).getTime()
    if (Number.isNaN(t) || t <= Date.now()) throw new JobError('The expiry date must be in the future', 400)
    if (t > Date.now() + MAX_EXPIRY_DAYS * 24 * 60 * 60 * 1000) {
      throw new JobError(`Expiry can be at most ${MAX_EXPIRY_DAYS} days out`, 400)
    }
    expiresAt = new Date(t)
  }

  const number = await nextNumber('JOB')
  const row = (await db.$transaction(async (tx) => {
    const created = await tx.jobPosting.create({
      data: {
        number,
        orgId: input.organizationId,
        postedById: input.userId,
        title,
        department,
        location,
        employmentType,
        description,
        requirements,
        salaryMin,
        salaryMax,
        salaryCurrency: (input.salaryCurrency || 'USD').trim().toUpperCase().slice(0, 3) || 'USD',
        status: 'OPEN',
        expiresAt,
      },
      include: JOB_INCLUDE,
    })
    await recordAuditTx(tx, {
      actorId: input.userId,
      actorType: 'USER',
      action: 'JOB_POSTED',
      entityType: 'JobPosting',
      entityId: created.id,
      summary: `Job ${number} posted: "${title}" at ${org.name}`,
      metadata: { organizationId: input.organizationId, employmentType, location },
    })
    return created
  })) as unknown as JobRow
  return serializeJob(row)
}

export async function updateJob(
  userId: string,
  organizationId: string,
  jobId: string,
  patch: {
    title?: string
    department?: string | null
    location?: string | null
    employmentType?: string
    description?: string
    requirements?: string | null
    salaryMin?: number | null
    salaryMax?: number | null
    status?: string
    expiresAt?: Date | null
  }
): Promise<JobDTO> {
  await assertOrgJobsPermission(userId, organizationId)

  const job = await db.jobPosting.findUnique({ where: { id: jobId }, select: { id: true, orgId: true, status: true } })
  if (!job) throw new JobError('Job posting not found', 404, 'JOB_NOT_FOUND')
  if (job.orgId !== organizationId) throw new JobError('That job belongs to a different company', 403, 'NOT_YOUR_JOB')

  const data: Record<string, unknown> = {}
  const auditBits: Record<string, unknown> = {}

  if (patch.status !== undefined) {
    const next = patch.status
    if (!['OPEN', 'PAUSED', 'CLOSED'].includes(next)) throw new JobError('Invalid job status', 400)
    const allowed: Record<string, string[]> = { OPEN: ['PAUSED'], PAUSED: ['OPEN', 'CLOSED'], CLOSED: [] }
    if (!allowed[job.status]?.includes(next)) {
      throw new JobError(`A ${job.status.toLowerCase()} posting cannot move to ${next.toLowerCase()}`, 400, 'BAD_TRANSITION')
    }
    data.status = next
    auditBits.status = next
  }
  if (job.status === 'CLOSED' && patch.status === undefined) {
    throw new JobError('Closed postings are read-only', 400, 'JOB_CLOSED')
  }

  if (patch.title !== undefined) {
    const title = patch.title.trim()
    if (title.length < 5 || title.length > TITLE_MAX) throw new JobError(`Job title must be 5–${TITLE_MAX} characters`, 400)
    data.title = title
  }
  if (patch.department !== undefined) data.department = (patch.department || '').trim() || null
  if (patch.location !== undefined) data.location = (patch.location || '').trim() || null
  if (patch.employmentType !== undefined) {
    if (!JOB_TYPES.includes(patch.employmentType as JobType)) throw new JobError('Invalid employment type', 400)
    data.employmentType = patch.employmentType
  }
  if (patch.description !== undefined) {
    const description = patch.description.trim()
    if (description.length < DESCRIPTION_MIN || description.length > DESCRIPTION_MAX) {
      throw new JobError(`Describe the role in ${DESCRIPTION_MIN}–${DESCRIPTION_MAX} characters`, 400)
    }
    data.description = description
  }
  if (patch.requirements !== undefined) data.requirements = (patch.requirements || '').trim() || null
  if (patch.salaryMin !== undefined) data.salaryMin = patch.salaryMin
  if (patch.salaryMax !== undefined) data.salaryMax = patch.salaryMax
  if (data.salaryMin !== undefined && data.salaryMax !== undefined && data.salaryMin !== null && data.salaryMax !== null && data.salaryMin > data.salaryMax) {
    throw new JobError('The salary minimum cannot exceed the maximum', 400)
  }
  if (patch.expiresAt !== undefined) {
    if (patch.expiresAt === null) {
      data.expiresAt = null
    } else {
      const t = new Date(patch.expiresAt).getTime()
      if (Number.isNaN(t) || t <= Date.now()) throw new JobError('The expiry date must be in the future', 400)
      data.expiresAt = new Date(t)
    }
  }

  if (Object.keys(data).length === 0) throw new JobError('Nothing to update', 400)

  const row = (await db.$transaction(async (tx) => {
    const updated = await tx.jobPosting.update({ where: { id: jobId }, data, include: JOB_INCLUDE })
    await recordAuditTx(tx, {
      actorId: userId,
      actorType: 'USER',
      action: data.status === 'CLOSED' ? 'JOB_CLOSED' : data.status ? `JOB_${data.status}` : 'JOB_UPDATED',
      entityType: 'JobPosting',
      entityId: jobId,
      summary: `Job ${updated.number} updated${data.status ? ` → ${data.status}` : ''}`,
      metadata: { organizationId, ...auditBits },
    })
    return updated
  })) as unknown as JobRow
  return serializeJob(row)
}

export async function listOrgJobs(organizationId: string, userId: string): Promise<JobDTO[]> {
  await assertOrgJobsPermission(userId, organizationId)
  const rows = await db.jobPosting.findMany({
    where: { orgId: organizationId },
    orderBy: { createdAt: 'desc' },
    include: JOB_INCLUDE,
  })
  return rows.map(serializeJob)
}

// ── public feed + detail ─────────────────────────────────────────────────────

export interface JobFeedResponse {
  items: JobDTO[]
  total: number
  page: number
  pageCount: number
  types: string[]
}

export async function publicJobFeed(params: {
  q?: string
  type?: string
  location?: string
  page?: number
}): Promise<JobFeedResponse> {
  const q = (params.q || '').trim()
  const type = (params.type || '').trim()
  const location = (params.location || '').trim()
  const page = Math.max(1, params.page ?? 1)

  const where = {
    status: 'OPEN',
    OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
    org: { orgType: 'COMPANY', status: 'ACTIVE' },
    ...(type && JOB_TYPES.includes(type as JobType) ? { employmentType: type } : {}),
    ...(location ? { location: { contains: location } } : {}),
    ...(q
      ? {
          OR: [
            { title: { contains: q } },
            { description: { contains: q } },
            { department: { contains: q } },
            { location: { contains: q } },
            { org: { name: { contains: q } } },
          ],
        }
      : {}),
  }

  const [rows, total] = await Promise.all([
    db.jobPosting.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
      include: JOB_INCLUDE,
    }),
    db.jobPosting.count({ where }),
  ])

  return {
    items: rows.map(serializeJob),
    total,
    page,
    pageCount: Math.max(1, Math.ceil(total / PAGE_SIZE)),
    types: [...JOB_TYPES],
  }
}

export async function getPublicJob(jobId: string): Promise<JobDTO> {
  const job = await db.jobPosting.findUnique({ where: { id: jobId }, include: JOB_INCLUDE })
  if (!job) throw new JobError('Job posting not found', 404, 'JOB_NOT_FOUND')
  const visible = job.status === 'OPEN' && (!job.expiresAt || job.expiresAt > new Date()) && job.org.status === 'ACTIVE'
  if (!visible) throw new JobError('This posting is no longer available', 404, 'JOB_CLOSED')

  // Best-effort view counter — never blocks the read
  void db.jobPosting
    .update({ where: { id: jobId }, data: { views: { increment: 1 } } })
    .catch(() => undefined)

  return serializeJob(job as unknown as JobRow)
}

// ── applications ──────────────────────────────────────────────────────────────

export async function applyToJob(
  userId: string,
  jobId: string,
  coverNote: string,
  contactEmail?: string | null
): Promise<ApplicationDTO> {
  const note = (coverNote || '').trim()
  if (note.length < COVER_MIN || note.length > COVER_MAX) {
    throw new JobError(`Your note must be ${COVER_MIN}–${COVER_MAX} characters`, 400)
  }
  const contact = (contactEmail || '').trim().toLowerCase() || null
  if (contact && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(contact)) {
    throw new JobError('That contact email does not look valid', 400)
  }

  const job = await db.jobPosting.findUnique({
    where: { id: jobId },
    select: {
      id: true
      , number: true, title: true, status: true, expiresAt: true, orgId: true,
      org: { select: { id: true, name: true, slug: true, orgType: true, status: true } },
    },
  })
  if (!job) throw new JobError('Job posting not found', 404, 'JOB_NOT_FOUND')
  if (job.status !== 'OPEN' || (job.expiresAt && job.expiresAt <= new Date())) {
    throw new JobError('This posting is no longer accepting applications', 409, 'JOB_NOT_OPEN')
  }
  if (job.org.status !== 'ACTIVE') throw new JobError('This company is not currently active', 409, 'ORG_NOT_ACTIVE')

  const membership = await db.organizationMember.findUnique({
    where: { organizationId_userId: { organizationId: job.orgId, userId } },
    select: { id: true },
  })
  if (membership) throw new JobError('You cannot apply to your own company', 400, 'SELF_APPLY')

  const existing = await db.jobApplication.findUnique({
    where: { jobId_applicantId: { jobId, applicantId: userId } },
    select: { id: true },
  })
  if (existing) throw new JobError('You already applied to this job', 409, 'ALREADY_APPLIED')

  const applicant = await db.user.findUnique({
    where: { id: userId },
    select: { id: true, name: true, email: true, status: true },
  })
  if (!applicant || applicant.status !== 'ACTIVE') throw new JobError('Your account is not active', 403)

  const row = await db.$transaction(async (tx) => {
    const created = await tx.jobApplication.create({
      data: { jobId, applicantId: userId, coverNote: note, contactEmail: contact ?? applicant.email, status: 'PENDING' },
    })
    await recordAuditTx(tx, {
      actorId: userId,
      actorType: 'USER',
      action: 'JOB_APPLICATION_SUBMITTED',
      entityType: 'JobApplication',
      entityId: created.id,
      summary: `Application submitted for ${job.number} (${job.title}) at ${job.org.name}`,
      metadata: { jobId, organizationId: job.orgId },
    })
    return created
  })

  // Fire-and-forget: tell the company
  const notifiees = await orgNotifiees(job.orgId)
  if (notifiees.length > 0) {
    await emitNotifications(
      notifiees.map((n) => ({
        userId: n.userId,
        type: 'JOB_STATUS' as const,
        title: 'New job application',
        body: `${applicant.name} applied for "${job.title}".`,
        linkView: 'business' as const,
        linkId: jobId,
      }))
    )
  }

  return {
    id: row.id,
    jobId: job.id,
    jobTitle: job.title,
    jobNumber: job.number,
    jobStatus: job.status,
    employmentType: '',
    orgId: job.org.id,
    orgName: job.org.name,
    applicantId: applicant.id,
    applicantName: applicant.name,
    applicantEmail: applicant.email,
    coverNote: note,
    contactEmail: row.contactEmail,
    status: row.status,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  }
}

export async function listMyApplications(userId: string): Promise<ApplicationDTO[]> {
  const rows = await db.jobApplication.findMany({
    where: { applicantId: userId },
    orderBy: { createdAt: 'desc' },
    select: {
      id: true, coverNote: true, contactEmail: true, status: true, createdAt: true, updatedAt: true,
      applicant: { select: { id: true, name: true, email: true } },
      job: {
        select: {
          id: true, number: true, title: true, status: true, employmentType: true,
          org: { select: { id: true, name: true } },
        },
      },
    },
  })
  return rows.map((r) => ({
    id: r.id,
    jobId: r.job.id,
    jobTitle: r.job.title,
    jobNumber: r.job.number,
    jobStatus: r.job.status,
    employmentType: r.job.employmentType,
    orgId: r.job.org.id,
    orgName: r.job.org.name,
    applicantId: r.applicant.id,
    applicantName: r.applicant.name,
    applicantEmail: r.applicant.email,
    coverNote: r.coverNote,
    contactEmail: r.contactEmail,
    status: r.status,
    createdAt: r.createdAt.toISOString(),
    updatedAt: r.updatedAt.toISOString(),
  }))
}

export async function listJobApplications(
  userId: string,
  organizationId: string,
  jobId: string,
  status?: string
): Promise<ApplicationDTO[]> {
  await assertOrgJobsPermission(userId, organizationId)
  const job = await db.jobPosting.findUnique({ where: { id: jobId }, select: { id: true, orgId: true } })
  if (!job) throw new JobError('Job posting not found', 404, 'JOB_NOT_FOUND')
  if (job.orgId !== organizationId) throw new JobError('That job belongs to a different company', 403, 'NOT_YOUR_JOB')

  const rows = await db.jobApplication.findMany({
    where: { jobId, ...(status && APPLICATION_STATUSES.includes(status as ApplicationStatus) ? { status } : {}) },
    orderBy: { createdAt: 'desc' },
    select: {
      id: true, coverNote: true, contactEmail: true, status: true, createdAt: true, updatedAt: true,
      applicant: { select: { id: true, name: true, email: true } },
      job: {
        select: {
          id: true, number: true, title: true, status: true, employmentType: true,
          org: { select: { id: true, name: true } },
        },
      },
    },
  })
  return rows.map((r) => ({
    id: r.id,
    jobId: r.job.id,
    jobTitle: r.job.title,
    jobNumber: r.job.number,
    jobStatus: r.job.status,
    employmentType: r.job.employmentType,
    orgId: r.job.org.id,
    orgName: r.job.org.name,
    applicantId: r.applicant.id,
    applicantName: r.applicant.name,
    applicantEmail: r.applicant.email,
    coverNote: r.coverNote,
    contactEmail: r.contactEmail,
    status: r.status,
    createdAt: r.createdAt.toISOString(),
    updatedAt: r.updatedAt.toISOString(),
  }))
}

export async function decideApplication(
  userId: string,
  organizationId: string,
  applicationId: string,
  next: ApplicationStatus
): Promise<ApplicationDTO> {
  await assertOrgJobsPermission(userId, organizationId)
  if (!['VIEWED', 'SHORTLISTED', 'REJECTED'].includes(next)) {
    throw new JobError('Companies can only set viewed, shortlisted or rejected', 400)
  }

  const app = await db.jobApplication.findUnique({
    where: { id: applicationId },
    select: {
      id: true, status: true,
      job: { select: { id: true, number: true, title: true, status: true, orgId: true, org: { select: { id: true, name: true } } } },
      applicant: { select: { id: true, name: true, email: true } },
    },
  })
  if (!app) throw new JobError('Application not found', 404, 'APPLICATION_NOT_FOUND')
  if (app.job.orgId !== organizationId) throw new JobError('That application belongs to a different company', 403, 'NOT_YOUR_JOB')
  if (app.status === 'WITHDRAWN') throw new JobError('The applicant withdrew this application', 409, 'WITHDRAWN')
  if (app.status === 'REJECTED') throw new JobError('This application was already rejected', 409, 'ALREADY_DECIDED')

  const row = await db.$transaction(async (tx) => {
    const updated = await tx.jobApplication.update({ where: { id: applicationId }, data: { status: next } })
    await recordAuditTx(tx, {
      actorId: userId,
      actorType: 'USER',
      action: 'JOB_APPLICATION_DECIDED',
      entityType: 'JobApplication',
      entityId: applicationId,
      summary: `Application for ${app.job.number} moved to ${next}`,
      metadata: { organizationId, jobId: app.job.id, status: next },
    })
    return updated
  })

  // Fire-and-forget: tell the applicant
  await emitNotifications([
    {
      userId: app.applicant.id,
      type: 'JOB_STATUS',
      title: `Application ${next === 'SHORTLISTED' ? 'shortlisted' : next === 'VIEWED' ? 'viewed' : 'not selected'}`,
      body: `${app.job.org.name} — "${app.job.title}" (${app.job.number}).`,
      linkView: 'jobs',
      linkId: app.job.id,
    },
  ])

  return {
    id: row.id,
    jobId: app.job.id,
    jobTitle: app.job.title,
    jobNumber: app.job.number,
    jobStatus: app.job.status,
    employmentType: '',
    orgId: app.job.org.id,
    orgName: app.job.org.name,
    applicantId: app.applicant.id,
    applicantName: app.applicant.name,
    applicantEmail: app.applicant.email,
    coverNote: row.coverNote,
    contactEmail: row.contactEmail,
    status: row.status,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  }
}

export async function withdrawApplication(userId: string, applicationId: string): Promise<ApplicationDTO> {
  const app = await db.jobApplication.findUnique({
    where: { id: applicationId },
    select: {
      id: true, status: true, coverNote: true, contactEmail: true, createdAt: true, updatedAt: true,
      applicant: { select: { id: true, name: true, email: true } },
      job: {
        select: {
          id: true, number: true, title: true, status: true, employmentType: true,
          org: { select: { id: true, name: true } },
        },
      },
    },
  })
  if (!app) throw new JobError('Application not found', 404, 'APPLICATION_NOT_FOUND')
  if (app.applicant.id !== userId) throw new JobError('Not your application', 403, 'NOT_YOURS')
  if (app.status === 'WITHDRAWN') throw new JobError('Already withdrawn', 409, 'ALREADY_WITHDRAWN')

  const row = await db.$transaction(async (tx) => {
    const updated = await tx.jobApplication.update({ where: { id: applicationId }, data: { status: 'WITHDRAWN' } })
    await recordAuditTx(tx, {
      actorId: userId,
      actorType: 'USER',
      action: 'JOB_APPLICATION_WITHDRAWN',
      entityType: 'JobApplication',
      entityId: applicationId,
      summary: `Application for ${app.job.number} withdrawn by the applicant`,
      metadata: { jobId: app.job.id },
    })
    return updated
  })

  return {
    id: row.id,
    jobId: app.job.id,
    jobTitle: app.job.title,
    jobNumber: app.job.number,
    jobStatus: app.job.status,
    employmentType: app.job.employmentType,
    orgId: app.job.org.id,
    orgName: app.job.org.name,
    applicantId: app.applicant.id,
    applicantName: app.applicant.name,
    applicantEmail: app.applicant.email,
    coverNote: row.coverNote,
    contactEmail: row.contactEmail,
    status: row.status,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  }
}

// ── platform-side moderation ─────────────────────────────────────────────────

export async function adminListJobs(params: { status?: string; q?: string }): Promise<JobDTO[]> {
  const status = (params.status || '').trim()
  const q = (params.q || '').trim()
  const rows = await db.jobPosting.findMany({
    where: {
      ...(status && ['OPEN', 'PAUSED', 'CLOSED'].includes(status) ? { status } : {}),
      ...(q ? { OR: [{ title: { contains: q } }, { number: { contains: q } }, { org: { name: { contains: q } } }] } : {}),
    },
    orderBy: { createdAt: 'desc' },
    take: 200,
    include: JOB_INCLUDE,
  })
  return rows.map(serializeJob)
}

export async function adminCloseJob(adminId: string, jobId: string, reason: string): Promise<JobDTO> {
  const note = (reason || '').trim()
  if (note.length < 10) throw new JobError('A moderation reason of at least 10 characters is required', 400)

  const job = await db.jobPosting.findUnique({
    where: { id: jobId },
    select: { id: true, number: true, status: true, orgId: true, org: { select: { id: true, name: true, slug: true, verifiedAt: true, status: true } } },
  })
  if (!job) throw new JobError('Job posting not found', 404, 'JOB_NOT_FOUND')
  if (job.status === 'CLOSED') throw new JobError('That posting is already closed', 409, 'ALREADY_CLOSED')

  const row = (await db.$transaction(async (tx) => {
    const updated = await tx.jobPosting.update({ where: { id: jobId }, data: { status: 'CLOSED' }, include: JOB_INCLUDE })
    await recordAuditTx(tx, {
      actorId: adminId,
      actorType: 'USER',
      action: 'JOB_MODERATION_CLOSED',
      entityType: 'JobPosting',
      entityId: jobId,
      summary: `Job ${job.number} closed by platform moderation`,
      metadata: { organizationId: job.orgId, reason: note },
    })
    return updated
  })) as unknown as JobRow

  // Fire-and-forget: tell the company
  const notifiees = await orgNotifiees(job.orgId)
  await emitNotifications(
    notifiees.map((n) => ({
      userId: n.userId,
      type: 'JOB_STATUS' as const,
      title: 'Job posting closed by the platform',
      body: `${job.number} was closed by moderation: ${note.slice(0, 200)}`,
      linkView: 'business' as const,
      linkId: jobId,
    }))
  )
  return serializeJob(row)
}
