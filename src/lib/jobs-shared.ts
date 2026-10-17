// ─────────────────────────────────────────────────────────────────────────────
// NETW-1: jobs board — client-safe shared constants + DTO shapes.
//
// The service (src/server/modules/jobs/service.ts) imports Prisma; client
// components must NEVER import the service directly or the db client lands in
// the browser bundle. Everything UI-facing lives HERE instead: enums, labels
// and the wire DTOs. The service imports these too — one source of truth.
// ─────────────────────────────────────────────────────────────────────────────

export const JOB_TYPES = ['FULL_TIME', 'PART_TIME', 'CONTRACT', 'INTERNSHIP', 'TEMPORARY'] as const
export type JobType = (typeof JOB_TYPES)[number]

export const JOB_TYPE_LABELS: Record<string, string> = {
  FULL_TIME: 'Full-time',
  PART_TIME: 'Part-time',
  CONTRACT: 'Contract',
  INTERNSHIP: 'Internship',
  TEMPORARY: 'Temporary',
}

export const JOB_STATUS_LABELS: Record<string, string> = {
  OPEN: 'Open',
  PAUSED: 'Paused',
  CLOSED: 'Closed',
}

export const APPLICATION_STATUSES = ['PENDING', 'VIEWED', 'SHORTLISTED', 'REJECTED', 'WITHDRAWN'] as const
export type ApplicationStatus = (typeof APPLICATION_STATUSES)[number]

export const APPLICATION_STATUS_LABELS: Record<string, string> = {
  PENDING: 'Submitted',
  VIEWED: 'Viewed',
  SHORTLISTED: 'Shortlisted',
  REJECTED: 'Not selected',
  WITHDRAWN: 'Withdrawn',
}

// ── wire DTOs (mirror of the service serializers) ────────────────────────────

export interface JobDTO {
  id: string
  number: string
  orgId: string
  orgName: string
  orgSlug: string
  orgVerified: boolean
  postedByName: string
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
  applicationCount: number
  expiresAt: string | null
  createdAt: string
  updatedAt: string
}

export interface ApplicationDTO {
  id: string
  jobId: string
  jobTitle: string
  jobNumber: string
  jobStatus: string
  employmentType: string
  orgId: string
  orgName: string
  applicantId: string
  applicantName: string
  applicantEmail: string
  coverNote: string
  contactEmail: string | null
  status: string
  createdAt: string
  updatedAt: string
}
