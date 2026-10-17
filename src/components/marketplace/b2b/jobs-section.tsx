'use client'

// ── NETW-1: Selling → Jobs (company-side jobs board management) ─────────────
// Post, edit, pause/resume/close the company's openings and triage the
// applicant pipeline (VIEWED → SHORTLISTED / REJECTED) per posting.
// Gated server-side by membership + OWNER/ADMIN or org.jobs.manage.

import { useMemo, useState } from 'react'
import {
  BadgeCheck,
  Ban,
  Briefcase,
  Building2,
  Eye,
  Inbox,
  Loader2,
  MapPin,
  Pause,
  Pencil,
  Play,
  Plus,
  Send,
  Users,
  Wallet,
  X,
} from 'lucide-react'
import { toast } from '@/hooks/use-toast'
import { useApi } from '@/hooks/use-api'
import { timeAgo } from '@/lib/format'
import { apiRequest, EmptyState } from './b2b-shared'
import { JOB_TYPE_LABELS, type ApplicationDTO, type JobDTO } from '@/lib/jobs-shared'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Skeleton } from '@/components/ui/skeleton'
import { Textarea } from '@/components/ui/textarea'
import { cn } from '@/lib/utils'

// ── API contract ─────────────────────────────────────────────────────────────

interface JobsResponse {
  jobs: JobDTO[]
}

interface ApplicationsResponse {
  applications: ApplicationDTO[]
}

const JOB_TYPE_OPTIONS = ['FULL_TIME', 'PART_TIME', 'CONTRACT', 'INTERNSHIP', 'TEMPORARY']

const JOB_STATUS_MAP: Record<string, { label: string; badge: string }> = {
  OPEN: { label: 'Open', badge: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300' },
  PAUSED: { label: 'Paused', badge: 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300' },
  CLOSED: { label: 'Closed', badge: 'bg-neutral-200 text-neutral-600 dark:bg-neutral-800 dark:text-neutral-400' },
}

const APP_STATUS_MAP: Record<string, { label: string; badge: string }> = {
  PENDING: { label: 'New', badge: 'bg-sky-100 text-sky-800 dark:bg-sky-950 dark:text-sky-300' },
  VIEWED: { label: 'Viewed', badge: 'bg-violet-100 text-violet-800 dark:bg-violet-950 dark:text-violet-300' },
  SHORTLISTED: { label: 'Shortlisted', badge: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300' },
  REJECTED: { label: 'Passed', badge: 'bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-300' },
  WITHDRAWN: { label: 'Withdrawn', badge: 'bg-muted text-muted-foreground' },
}

function salaryLabel(job: JobDTO): string | null {
  if (job.salaryMin == null && job.salaryMax == null) return null
  const fmt = (n: number) => (n >= 1000 ? `${(n / 1000).toFixed(n % 1000 === 0 ? 0 : 1)}k` : String(n))
  if (job.salaryMin != null && job.salaryMax != null) return `${job.salaryCurrency} ${fmt(job.salaryMin)}–${fmt(job.salaryMax)}/mo`
  return `${job.salaryCurrency} ${fmt(job.salaryMin ?? job.salaryMax!)}/mo`
}

// ── section ─────────────────────────────────────────────────────────────────

export function JobsSub({ organizationId, orgName }: { organizationId: string; orgName: string }) {
  const { data, loading, error, refetch } = useApi<JobsResponse>(
    `/api/jobs?organizationId=${organizationId}`
  )
  const jobs = data?.jobs ?? []

  const [creating, setCreating] = useState(false)
  const [editing, setEditing] = useState<JobDTO | null>(null)
  const [applicantsFor, setApplicantsFor] = useState<JobDTO | null>(null)
  const [closing, setClosing] = useState<JobDTO | null>(null)

  const stats = useMemo(
    () => ({
      open: jobs.filter((j) => j.status === 'OPEN').length,
      paused: jobs.filter((j) => j.status === 'PAUSED').length,
      closed: jobs.filter((j) => j.status === 'CLOSED').length,
      totalApplicants: jobs.reduce((sum, j) => sum + j.applicationCount, 0),
      views: jobs.reduce((sum, j) => sum + j.views, 0),
    }),
    [jobs]
  )

  const setStatus = async (job: JobDTO, status: string) => {
    const res = await apiRequest(`/api/jobs/${job.id}`, {
      method: 'PATCH',
      body: JSON.stringify({ organizationId, status }),
    })
    if (!res.ok) {
      toast({ title: 'Could not update the posting', description: res.error, variant: 'destructive' })
      return
    }
    toast({
      title: status === 'PAUSED' ? 'Posting paused' : status === 'OPEN' ? 'Posting live' : 'Posting closed',
      description: `${job.number} · ${job.title}`,
    })
    void refetch()
  }

  return (
    <div className="space-y-4">
      {/* Stats */}
      <div className="flex flex-wrap items-stretch gap-2.5">
        <MiniStat icon={Briefcase} label="Open roles" value={stats.open} tone="emerald" />
        <MiniStat icon={Pause} label="Paused" value={stats.paused} tone="amber" />
        <MiniStat icon={Users} label="Applicants" value={stats.totalApplicants} tone="violet" />
        <MiniStat icon={Eye} label="Total views" value={stats.views} tone="sky" />
      </div>

      {/* List */}
      {loading ? (
        <div className="space-y-3">
          {Array.from({ length: 2 }).map((_, i) => (
            <Skeleton key={i} className="h-28 w-full rounded-2xl" />
          ))}
        </div>
      ) : error ? (
        <EmptyState icon={X} title="Couldn't load your job postings" description={error}>
          <Button variant="outline" className="rounded-xl" onClick={() => void refetch()}>
            Try again
          </Button>
        </EmptyState>
      ) : jobs.length === 0 ? (
        <EmptyState
          icon={Briefcase}
          title="No job postings yet"
          description={`Publish ${orgName}'s first opening — every registered actor on Vendora can discover and apply.`}
        >
          <Button className="rounded-xl" onClick={() => setCreating(true)}>
            <Plus size={15} className="mr-1.5" /> Post a job
          </Button>
        </EmptyState>
      ) : (
        <>
          <div className="flex justify-end">
            <Button size="sm" className="rounded-xl" onClick={() => setCreating(true)}>
              <Plus size={15} className="mr-1.5" /> Post a job
            </Button>
          </div>
          <div className="space-y-3">
            {jobs.map((job) => (
              <Card key={job.id} className="rounded-2xl py-0 transition-shadow hover:shadow-sm">
                <CardContent className="space-y-3 px-4 py-4 sm:px-5">
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
                    <span className="font-mono text-[11px] font-semibold text-muted-foreground">{job.number}</span>
                    <span
                      className={cn(
                        'rounded-full px-2.5 py-0.5 text-[11px] font-semibold',
                        JOB_STATUS_MAP[job.status]?.badge
                      )}
                    >
                      {JOB_STATUS_MAP[job.status]?.label ?? job.status}
                    </span>
                    <span className="ml-auto text-[11px] text-muted-foreground">{timeAgo(job.createdAt)}</span>
                  </div>

                  <div>
                    <p className="text-sm font-semibold">{job.title}</p>
                    <div className="mt-1 flex flex-wrap items-center gap-1.5 text-[11px] text-muted-foreground">
                      <span className="rounded-full bg-muted px-2 py-0.5 font-medium">
                        {JOB_TYPE_LABELS[job.employmentType] ?? job.employmentType}
                      </span>
                      {job.location && (
                        <span className="rounded-full bg-muted px-2 py-0.5 font-medium">
                          <MapPin size={10} className="mr-1 inline" />
                          {job.location}
                        </span>
                      )}
                      {salaryLabel(job) && (
                        <span className="rounded-full bg-muted px-2 py-0.5 font-medium">
                          <Wallet size={10} className="mr-1 inline" />
                          {salaryLabel(job)}
                        </span>
                      )}
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center gap-3 text-[11px] text-muted-foreground">
                      <span className="flex items-center gap-1">
                        <Eye size={11} /> {job.views} views
                      </span>
                      <span className="flex items-center gap-1">
                        <Send size={11} /> {job.applicationCount} applicants
                      </span>
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      <Button size="sm" variant="outline" className="h-8 rounded-lg text-xs" onClick={() => setApplicantsFor(job)}>
                        <Users size={13} className="mr-1" /> Applicants
                      </Button>
                      {job.status !== 'CLOSED' && (
                        <>
                          <Button size="sm" variant="outline" className="h-8 rounded-lg text-xs" onClick={() => setEditing(job)}>
                            <Pencil size={13} className="mr-1" /> Edit
                          </Button>
                          {job.status === 'OPEN' ? (
                            <Button
                              size="sm"
                              variant="outline"
                              className="h-8 rounded-lg text-xs"
                              onClick={() => void setStatus(job, 'PAUSED')}
                            >
                              <Pause size={13} className="mr-1" /> Pause
                            </Button>
                          ) : (
                            <Button
                              size="sm"
                              variant="outline"
                              className="h-8 rounded-lg text-xs"
                              onClick={() => void setStatus(job, 'OPEN')}
                            >
                              <Play size={13} className="mr-1" /> Resume
                            </Button>
                          )}
                          <Button size="sm" variant="outline" className="h-8 rounded-lg text-xs text-destructive hover:text-destructive" onClick={() => setClosing(job)}>
                            <Ban size={13} className="mr-1" /> Close
                          </Button>
                        </>
                      )}
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </>
      )}

      {/* Dialogs */}
      {creating && (
        <JobFormDialog
          organizationId={organizationId}
          onOpenChange={(v) => !v && setCreating(false)}
          onDone={() => {
            setCreating(false)
            void refetch()
          }}
        />
      )}
      {editing && (
        <JobFormDialog
          organizationId={organizationId}
          job={editing}
          onOpenChange={(v) => !v && setEditing(null)}
          onDone={() => {
            setEditing(null)
            void refetch()
          }}
        />
      )}
      {applicantsFor && (
        <ApplicantsDialog
          job={applicantsFor}
          organizationId={organizationId}
          onOpenChange={(v) => !v && setApplicantsFor(null)}
        />
      )}
      {closing && (
        <CloseJobDialog
          job={closing}
          organizationId={organizationId}
          onOpenChange={(v) => !v && setClosing(null)}
          onDone={() => {
            setClosing(null)
            void refetch()
          }}
        />
      )}
    </div>
  )
}

// ── create / edit form ──────────────────────────────────────────────────────

function JobFormDialog({
  organizationId,
  job,
  onOpenChange,
  onDone,
}: {
  organizationId: string
  job?: JobDTO
  onOpenChange: (v: boolean) => void
  onDone: () => void
}) {
  const [title, setTitle] = useState(job?.title ?? '')
  const [department, setDepartment] = useState(job?.department ?? '')
  const [location, setLocation] = useState(job?.location ?? '')
  const [employmentType, setEmploymentType] = useState(job?.employmentType ?? 'FULL_TIME')
  const [salaryMin, setSalaryMin] = useState(job?.salaryMin != null ? String(job.salaryMin) : '')
  const [salaryMax, setSalaryMax] = useState(job?.salaryMax != null ? String(job.salaryMax) : '')
  const [description, setDescription] = useState(job?.description ?? '')
  const [requirements, setRequirements] = useState(job?.requirements ?? '')
  const [sending, setSending] = useState(false)

  const submit = async () => {
    setSending(true)
    const payload = {
      organizationId,
      title: title.trim(),
      department: department.trim() || null,
      location: location.trim() || null,
      employmentType,
      salaryMin: salaryMin ? Number(salaryMin) : null,
      salaryMax: salaryMax ? Number(salaryMax) : null,
      description: description.trim(),
      requirements: requirements.trim() || null,
    }
    const res = job
      ? await apiRequest(`/api/jobs/${job.id}`, { method: 'PATCH', body: JSON.stringify(payload) })
      : await apiRequest('/api/jobs', { method: 'POST', body: JSON.stringify(payload) })
    setSending(false)
    if (!res.ok) {
      toast({ title: 'Could not save the posting', description: res.error, variant: 'destructive' })
      return
    }
    toast({ title: job ? 'Posting updated' : 'Posting published', description: `${title.trim()} is live on the Vendora jobs board.` })
    onDone()
  }

  const valid = title.trim().length >= 5 && description.trim().length >= 60

  return (
    <Dialog open onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Briefcase size={18} className="text-primary" /> {job ? `Edit ${job.number}` : 'Post a job opening'}
          </DialogTitle>
          <DialogDescription>
            Openings appear on the public jobs board for every registered actor — buyers, partners and
            financiers included.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5 sm:col-span-2">
              <Label htmlFor="job-title">Job title *</Label>
              <Input id="job-title" value={title} onChange={(e) => setTitle(e.target.value)} maxLength={120} placeholder="Senior Solar Installer" className="rounded-xl" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="job-type">Employment type</Label>
              <Select value={employmentType} onValueChange={setEmploymentType}>
                <SelectTrigger id="job-type" className="rounded-xl">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {JOB_TYPE_OPTIONS.map((t) => (
                    <SelectItem key={t} value={t}>{JOB_TYPE_LABELS[t]}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="job-department">Department</Label>
              <Input id="job-department" value={department} onChange={(e) => setDepartment(e.target.value)} maxLength={80} placeholder="Field Operations" className="rounded-xl" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="job-location">Location</Label>
              <Input id="job-location" value={location} onChange={(e) => setLocation(e.target.value)} maxLength={120} placeholder="Sana'a, Yemen" className="rounded-xl" />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1.5">
                <Label htmlFor="job-smin">Salary min</Label>
                <Input id="job-smin" type="number" min="0" value={salaryMin} onChange={(e) => setSalaryMin(e.target.value)} placeholder="800" className="rounded-xl" />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="job-smax">Salary max</Label>
                <Input id="job-smax" type="number" min="0" value={salaryMax} onChange={(e) => setSalaryMax(e.target.value)} placeholder="1200" className="rounded-xl" />
              </div>
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="job-desc">About the role *</Label>
            <Textarea id="job-desc" value={description} onChange={(e) => setDescription(e.target.value)} maxLength={8000} placeholder="What the role owns, day-to-day, growth path… (min 60 characters)" className="min-h-28 rounded-xl" />
            <p className="text-right text-[10px] text-muted-foreground">{description.length}/8000</p>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="job-req">Requirements</Label>
            <Textarea id="job-req" value={requirements} onChange={(e) => setRequirements(e.target.value)} maxLength={4000} placeholder="Experience, certifications, languages…" className="min-h-20 rounded-xl" />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" className="rounded-xl" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button className="rounded-xl" disabled={!valid || sending} onClick={() => void submit()}>
            {sending ? <Loader2 size={15} className="mr-1.5 animate-spin" /> : <Send size={15} className="mr-1.5" />}
            {job ? 'Save changes' : 'Publish posting'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// ── applicants pipeline ──────────────────────────────────────────────────────

function ApplicantsDialog({
  job,
  organizationId,
  onOpenChange,
}: {
  job: JobDTO
  organizationId: string
  onOpenChange: (v: boolean) => void
}) {
  const [statusFilter, setStatusFilter] = useState<string>('ALL')
  const url = `/api/jobs/${job.id}/applications?organizationId=${organizationId}`
  const { data, loading, error, refetch } = useApi<ApplicationsResponse>(url)
  const [busy, setBusy] = useState<string | null>(null)

  const all = data?.applications ?? []
  const applications = statusFilter === 'ALL' ? all : all.filter((a) => a.status === statusFilter)

  const decide = async (app: ApplicationDTO, status: string) => {
    setBusy(app.id)
    const res = await apiRequest(`/api/applications/${app.id}`, {
      method: 'PATCH',
      body: JSON.stringify({ status, organizationId }),
    })
    setBusy(null)
    if (!res.ok) {
      toast({ title: 'Could not update the application', description: res.error, variant: 'destructive' })
      return
    }
    void refetch()
  }

  const stats = useMemo(
    () => ({
      total: all.length,
      pending: all.filter((a) => a.status === 'PENDING').length,
      shortlisted: all.filter((a) => a.status === 'SHORTLISTED').length,
    }),
    [all]
  )

  return (
    <Dialog open onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Users size={18} className="text-primary" /> Applicants — {job.title}
          </DialogTitle>
          <DialogDescription>
            {stats.total} application{stats.total === 1 ? '' : 's'} · {stats.pending} new · {stats.shortlisted} shortlisted
          </DialogDescription>
        </DialogHeader>

        <div className="flex gap-1.5 overflow-x-auto pb-1">
          {['ALL', 'PENDING', 'VIEWED', 'SHORTLISTED', 'REJECTED', 'WITHDRAWN'].map((s) => (
            <button
              key={s}
              onClick={() => setStatusFilter(s)}
              className={cn(
                'shrink-0 rounded-full border px-3 py-1 text-[11px] font-medium transition-all',
                statusFilter === s
                  ? 'border-primary bg-primary text-primary-foreground shadow-sm'
                  : 'bg-card text-muted-foreground hover:border-primary/50 hover:text-foreground'
              )}
            >
              {s === 'ALL' ? 'All' : APP_STATUS_MAP[s]?.label}
            </button>
          ))}
        </div>

        {loading ? (
          <div className="space-y-2">
            {Array.from({ length: 2 }).map((_, i) => (
              <Skeleton key={i} className="h-24 w-full rounded-xl" />
            ))}
          </div>
        ) : error ? (
          <p className="py-6 text-center text-sm text-muted-foreground">{error}</p>
        ) : applications.length === 0 ? (
          <div className="py-8 text-center">
            <Inbox size={32} className="mx-auto text-muted-foreground/40" />
            <p className="mt-2 text-sm font-medium">No applications in this view</p>
            <p className="text-xs text-muted-foreground">Applicants from across the marketplace appear here.</p>
          </div>
        ) : (
          <div className="space-y-2.5">
            {applications.map((a) => (
              <Card key={a.id} className="rounded-xl py-0">
                <CardContent className="space-y-2.5 px-4 py-3.5">
                  <div className="flex items-start gap-3">
                    <Avatar className="h-9 w-9 shrink-0 border">
                      <AvatarFallback className="bg-primary/10 text-xs font-bold text-primary">
                        {a.applicantName.split(' ').map((w) => w[0]).join('').slice(0, 2).toUpperCase()}
                      </AvatarFallback>
                    </Avatar>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="text-sm font-semibold">{a.applicantName}</p>
                        <span className={cn('rounded-full px-2 py-0.5 text-[10px] font-semibold', APP_STATUS_MAP[a.status]?.badge)}>
                          {APP_STATUS_MAP[a.status]?.label ?? a.status}
                        </span>
                      </div>
                      <p className="mt-0.5 text-[11px] text-muted-foreground">
                        {a.contactEmail ?? a.applicantEmail} · applied {timeAgo(a.createdAt)}
                      </p>
                    </div>
                  </div>
                  <p className="whitespace-pre-wrap rounded-lg bg-muted/40 p-2.5 text-xs leading-relaxed text-muted-foreground">
                    {a.coverNote}
                  </p>
                  {['PENDING', 'VIEWED', 'SHORTLISTED'].includes(a.status) && (
                    <div className="flex justify-end gap-1.5">
                      {a.status === 'PENDING' && (
                        <Button size="sm" variant="outline" className="h-7 rounded-lg text-[11px]" disabled={busy === a.id} onClick={() => void decide(a, 'VIEWED')}>
                          <Eye size={12} className="mr-1" /> Mark viewed
                        </Button>
                      )}
                      {a.status !== 'SHORTLISTED' && (
                        <Button size="sm" variant="outline" className="h-7 rounded-lg text-[11px] text-emerald-700 dark:text-emerald-400" disabled={busy === a.id} onClick={() => void decide(a, 'SHORTLISTED')}>
                          <BadgeCheck size={12} className="mr-1" /> Shortlist
                        </Button>
                      )}
                      <Button size="sm" variant="outline" className="h-7 rounded-lg text-[11px] text-destructive hover:text-destructive" disabled={busy === a.id} onClick={() => void decide(a, 'REJECTED')}>
                        <X size={12} className="mr-1" /> Pass
                      </Button>
                    </div>
                  )}
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}

// ── close confirm ────────────────────────────────────────────────────────────

function CloseJobDialog({
  job,
  organizationId,
  onOpenChange,
  onDone,
}: {
  job: JobDTO
  organizationId: string
  onOpenChange: (v: boolean) => void
  onDone: () => void
}) {
  const [sending, setSending] = useState(false)

  const submit = async () => {
    setSending(true)
    const res = await apiRequest(`/api/jobs/${job.id}`, {
      method: 'PATCH',
      body: JSON.stringify({ organizationId, status: 'CLOSED' }),
    })
    setSending(false)
    if (!res.ok) {
      toast({ title: 'Could not close the posting', description: res.error, variant: 'destructive' })
      return
    }
    toast({ title: 'Posting closed', description: `${job.number} no longer accepts applications.` })
    onDone()
  }

  return (
    <Dialog open onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Ban size={18} className="text-destructive" /> Close {job.number}?
          </DialogTitle>
          <DialogDescription>
            &ldquo;{job.title}&rdquo; stops accepting applications immediately. Existing applicants keep
            their history; the posting becomes read-only.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="outline" className="rounded-xl" onClick={() => onOpenChange(false)}>Keep it open</Button>
          <Button variant="destructive" className="rounded-xl" disabled={sending} onClick={() => void submit()}>
            {sending ? <Loader2 size={15} className="mr-1.5 animate-spin" /> : <Ban size={15} className="mr-1.5" />}
            Close posting
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// ── small pieces ────────────────────────────────────────────────────────────

function MiniStat({
  icon: Icon,
  label,
  value,
  tone,
}: {
  icon: React.ComponentType<{ size?: number; className?: string }>
  label: string
  value: number
  tone: 'emerald' | 'amber' | 'violet' | 'sky'
}) {
  const tones = {
    emerald: 'text-emerald-600 dark:text-emerald-400',
    amber: 'text-amber-600 dark:text-amber-400',
    violet: 'text-violet-600 dark:text-violet-400',
    sky: 'text-sky-600 dark:text-sky-400',
  } as const
  return (
    <div className="flex min-w-32 items-center gap-2.5 rounded-xl border bg-muted/30 px-3 py-2">
      <Icon size={15} className={cn('shrink-0', tones[tone])} />
      <div>
        <p className="text-[11px] uppercase tracking-wide text-muted-foreground">{label}</p>
        <p className="text-sm font-bold leading-tight">{value}</p>
      </div>
    </div>
  )
}
