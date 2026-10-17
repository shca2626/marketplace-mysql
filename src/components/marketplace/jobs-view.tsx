'use client'

// ─────────────────────────────────────────────────────────────────────────────
// NETW-1: Jobs board — the public storefront view (?view=jobs).
//
// Browse every OPEN posting across active companies: search, employment-type
// and location filters, paginated cards, a detail dialog with the full role
// brief, and the apply flow (any authenticated actor — buyers, merchant staff,
// financier employees — everyone can apply with their Vendora profile).
// Signed-out visitors browse freely; applying opens the auth door first.
// ─────────────────────────────────────────────────────────────────────────────

import { useMemo, useState } from 'react'
import { motion } from 'framer-motion'
import {
  BadgeCheck,
  Briefcase,
  Building2,
  ChevronLeft,
  ChevronRight,
  Clock3,
  Eye,
  Loader2,
  Mail,
  MapPin,
  Search,
  Send,
  SendHorizontal,
  UserPlus,
  Wallet,
  X,
} from 'lucide-react'
import { toast } from '@/hooks/use-toast'
import { useApi } from '@/hooks/use-api'
import { useMarketplace } from '@/store/marketplace'
import { formatDate, initials, timeAgo } from '@/lib/format'
import {
  APPLICATION_STATUS_LABELS,
  JOB_TYPE_LABELS,
  type ApplicationDTO,
  type JobDTO,
} from '@/lib/jobs-shared'
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

interface FeedResponse {
  items: JobDTO[]
  total: number
  page: number
  pageCount: number
}

interface ApplicationsResponse {
  applications: ApplicationDTO[]
}

const TYPE_FILTERS = ['', 'FULL_TIME', 'PART_TIME', 'CONTRACT', 'INTERNSHIP', 'TEMPORARY']

const APP_STATUS_STYLE: Record<string, string> = {
  PENDING: 'bg-sky-100 text-sky-800 dark:bg-sky-950 dark:text-sky-300',
  VIEWED: 'bg-violet-100 text-violet-800 dark:bg-violet-950 dark:text-violet-300',
  SHORTLISTED: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300',
  REJECTED: 'bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-300',
  WITHDRAWN: 'bg-muted text-muted-foreground',
}

function salaryLabel(job: Pick<JobDTO, 'salaryMin' | 'salaryMax' | 'salaryCurrency'>): string | null {
  if (job.salaryMin == null && job.salaryMax == null) return null
  const fmt = (n: number) => (n >= 1000 ? `${(n / 1000).toFixed(n % 1000 === 0 ? 0 : 1)}k` : String(n))
  if (job.salaryMin != null && job.salaryMax != null) return `${job.salaryCurrency} ${fmt(job.salaryMin)}–${fmt(job.salaryMax)}/mo`
  return `${job.salaryCurrency} ${fmt(job.salaryMin ?? job.salaryMax!)}/mo`
}

// ── view ─────────────────────────────────────────────────────────────────────

export function JobsView() {
  const user = useMarketplace((s) => s.user)
  const openAuth = useMarketplace((s) => s.openAuth)
  const navigate = useMarketplace((s) => s.navigate)

  const [q, setQ] = useState('')
  const [search, setSearch] = useState('')
  const [type, setType] = useState('')
  const [location, setLocation] = useState('')
  const [page, setPage] = useState(1)
  const [openJob, setOpenJob] = useState<JobDTO | null>(null)
  const [applyTo, setApplyTo] = useState<JobDTO | null>(null)
  const [showMine, setShowMine] = useState(false)

  const feedUrl = useMemo(() => {
    const sp = new URLSearchParams()
    if (search) sp.set('q', search)
    if (type) sp.set('type', type)
    if (location) sp.set('location', location)
    sp.set('page', String(page))
    return `/api/jobs?${sp.toString()}`
  }, [search, type, location, page])

  const { data: feed, loading, error, refetch } = useApi<FeedResponse>(feedUrl)
  const { data: mine, refetch: refetchMine } = useApi<ApplicationsResponse>(user && showMine ? '/api/applications/mine' : null)

  const jobs = feed?.items ?? []
  const myApps = mine?.applications ?? []
  const appliedJobIds = new Set(myApps.map((a) => a.jobId))

  const runSearch = () => {
    setPage(1)
    setSearch(q.trim())
  }

  return (
    <div className="mx-auto max-w-7xl px-4 py-8">
      {/* ── Hero band ── */}
      <motion.section
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.35 }}
        aria-labelledby="jobs-hero-heading"
        className="relative overflow-hidden rounded-3xl border bg-gradient-to-br from-primary/10 via-card to-amber-500/10 px-5 py-8 sm:px-8 sm:py-10"
      >
        <Briefcase className="pointer-events-none absolute -right-6 -top-6 h-36 w-36 text-primary/10" aria-hidden />
        <p className="inline-flex items-center gap-1.5 rounded-full border bg-card px-3 py-1 text-[11px] font-semibold uppercase tracking-wider text-primary">
          <Building2 size={12} /> {feed ? `${feed.total} open ${feed.total === 1 ? 'role' : 'roles'}` : 'Solar careers'}
        </p>
        <h1 id="jobs-hero-heading" className="mt-3 max-w-2xl text-2xl font-bold tracking-tight sm:text-3xl">
          Work on the energy transition
        </h1>
        <p className="mt-2 max-w-2xl text-sm leading-relaxed text-muted-foreground sm:text-base">
          Every company on Vendora — manufacturers, distributors, installers, financiers — hires here.
          Apply with your Vendora profile; companies respond on-platform.
        </p>
        {user && (
          <div className="mt-5 flex flex-wrap gap-2">
            <Button
              size="sm"
              variant={showMine ? 'default' : 'outline'}
              className="rounded-xl"
              onClick={() => setShowMine((v) => !v)}
            >
              <SendHorizontal size={14} className="mr-1.5" />
              My applications{myApps.length > 0 ? ` (${myApps.length})` : ''}
            </Button>
            <Button size="sm" variant="outline" className="rounded-xl" onClick={() => navigate('following')}>
              <UserPlus size={14} className="mr-1.5" /> Companies I follow
            </Button>
          </div>
        )}
      </motion.section>

      {/* ── My applications drawer ── */}
      {user && showMine && (
        <Card className="mt-6 rounded-2xl py-0">
          <CardContent className="px-4 py-4 sm:px-5">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="flex items-center gap-2 text-sm font-bold">
                <SendHorizontal size={15} className="text-primary" /> Your applications
              </h2>
              <button
                onClick={() => setShowMine(false)}
                className="rounded-full p-1 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                aria-label="Hide applications"
              >
                <X size={15} />
              </button>
            </div>
            {myApps.length === 0 ? (
              <p className="py-4 text-center text-xs text-muted-foreground">
                You haven&apos;t applied to any role yet — open a posting below to start.
              </p>
            ) : (
              <div className="grid gap-2 sm:grid-cols-2">
                {myApps.map((a) => (
                  <button
                    key={a.id}
                    onClick={() => {
                      const job = jobs.find((j) => j.id === a.jobId)
                      if (job) setOpenJob(job)
                    }}
                    className="flex items-center gap-3 rounded-xl border bg-muted/30 p-3 text-left transition-all hover:border-primary/40 hover:bg-primary/5"
                  >
                    <Avatar className="h-9 w-9 border">
                      <AvatarFallback className="bg-primary/10 text-xs font-bold text-primary">
                        {initials(a.orgName)}
                      </AvatarFallback>
                    </Avatar>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold">{a.jobTitle}</p>
                      <p className="truncate text-[11px] text-muted-foreground">
                        {a.orgName} · {JOB_TYPE_LABELS[a.employmentType] ?? 'Role'} · {timeAgo(a.createdAt)}
                      </p>
                    </div>
                    <span className={cn('shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold', APP_STATUS_STYLE[a.status])}>
                      {APPLICATION_STATUS_LABELS[a.status] ?? a.status}
                    </span>
                  </button>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* ── Filter bar ── */}
      <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:items-center">
        <form
          className="relative flex-1"
          onSubmit={(e) => {
            e.preventDefault()
            runSearch()
          }}
        >
          <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search roles, companies, skills…"
            className="h-11 rounded-xl pl-10 pr-24"
            aria-label="Search jobs"
          />
          <Button type="submit" size="sm" className="absolute right-1.5 top-1/2 h-8 -translate-y-1/2 rounded-lg px-3">
            Search
          </Button>
        </form>
        <Select
          value={type || 'all'}
          onValueChange={(v) => {
            setType(v === 'all' ? '' : v)
            setPage(1)
          }}
        >
          <SelectTrigger className="h-11 w-full rounded-xl sm:w-44" aria-label="Filter by employment type">
            <SelectValue placeholder="All types" />
          </SelectTrigger>
          <SelectContent>
            {TYPE_FILTERS.map((t) => (
              <SelectItem key={t || 'all'} value={t || 'all'}>
                {t ? JOB_TYPE_LABELS[t] : 'All types'}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Input
          value={location}
          onChange={(e) => {
            setLocation(e.target.value)
            setPage(1)
          }}
          placeholder="Location"
          className="h-11 w-full rounded-xl sm:w-44"
          aria-label="Filter by location"
        />
      </div>

      {/* ── Results ── */}
      <div className="mt-5">
        {loading ? (
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {Array.from({ length: 6 }).map((_, i) => (
              <Skeleton key={i} className="h-44 w-full rounded-2xl" />
            ))}
          </div>
        ) : error ? (
          <Card className="flex flex-col items-center p-12 text-center">
            <X size={36} className="text-muted-foreground/40" />
            <p className="mt-3 font-semibold">Couldn&apos;t load the jobs board</p>
            <p className="mt-1 text-sm text-muted-foreground">{error}</p>
            <Button variant="outline" className="mt-5 rounded-xl" onClick={() => void refetch()}>
              Try again
            </Button>
          </Card>
        ) : jobs.length === 0 ? (
          <Card className="flex flex-col items-center p-12 text-center">
            <Briefcase size={36} className="text-muted-foreground/40" />
            <p className="mt-3 font-semibold">No open roles match</p>
            <p className="mt-1 max-w-sm text-sm text-muted-foreground">
              Try clearing the filters — or follow the companies you like and get notified as they grow.
            </p>
            {user && (
              <Button variant="outline" className="mt-5 rounded-xl" onClick={() => navigate('following')}>
                <UserPlus size={15} className="mr-1.5" /> Manage following
              </Button>
            )}
          </Card>
        ) : (
          <>
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              {jobs.map((job, i) => (
                <JobCard
                  key={job.id}
                  job={job}
                  index={i}
                  applied={appliedJobIds.has(job.id)}
                  onOpen={() => setOpenJob(job)}
                />
              ))}
            </div>

            {/* Pagination */}
            {feed && feed.pageCount > 1 && (
              <nav className="mt-8 flex items-center justify-center gap-2" aria-label="Jobs pages">
                <Button
                  variant="outline"
                  size="sm"
                  className="rounded-xl"
                  disabled={page <= 1}
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                >
                  <ChevronLeft size={15} /> Prev
                </Button>
                <span className="px-3 text-sm tabular-nums text-muted-foreground">
                  Page {feed.page} of {feed.pageCount}
                </span>
                <Button
                  variant="outline"
                  size="sm"
                  className="rounded-xl"
                  disabled={page >= feed.pageCount}
                  onClick={() => setPage((p) => p + 1)}
                >
                  Next <ChevronRight size={15} />
                </Button>
              </nav>
            )}
          </>
        )}
      </div>

      {/* ── Job detail dialog ── */}
      {openJob && (
        <JobDetailDialog
          job={openJob}
          applied={appliedJobIds.has(openJob.id)}
          onOpenChange={(v) => !v && setOpenJob(null)}
          onApply={() => {
            if (!user) {
              openAuth('login', { view: 'jobs' })
              return
            }
            setOpenJob(null)
            setApplyTo(openJob)
          }}
        />
      )}

      {/* ── Apply dialog ── */}
      {applyTo && (
        <ApplyDialog
          job={applyTo}
          onOpenChange={(v) => !v && setApplyTo(null)}
          onDone={() => {
            setApplyTo(null)
            void refetchMine()
          }}
        />
      )}
    </div>
  )
}

// ── job card ─────────────────────────────────────────────────────────────────

function JobCard({
  job,
  index,
  applied,
  onOpen,
}: {
  job: JobDTO
  index: number
  applied: boolean
  onOpen: () => void
}) {
  const salary = salaryLabel(job)
  return (
    <motion.button
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25, delay: Math.min(index * 0.04, 0.3) }}
      onClick={onOpen}
      className="group flex h-full flex-col rounded-2xl border bg-card p-5 text-left transition-all hover:-translate-y-0.5 hover:border-primary/40 hover:shadow-md"
    >
      <div className="flex items-start gap-3">
        <Avatar className="h-11 w-11 shrink-0 border">
          <AvatarFallback className="bg-primary/10 text-sm font-bold text-primary">
            {initials(job.orgName)}
          </AvatarFallback>
        </Avatar>
        <div className="min-w-0 flex-1">
          <h3 className="truncate font-semibold leading-snug group-hover:text-primary">{job.title}</h3>
          <p className="mt-0.5 flex items-center gap-1 truncate text-xs text-muted-foreground">
            <Building2 size={11} className="shrink-0" />
            {job.orgName}
            {job.orgVerified && <BadgeCheck size={12} className="shrink-0 text-primary" aria-label="Verified company" />}
          </p>
        </div>
        {applied && (
          <Badge variant="secondary" className="shrink-0 rounded-full bg-emerald-100 text-[10px] text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300">
            Applied
          </Badge>
        )}
      </div>

      <div className="mt-3 flex flex-wrap gap-1.5">
        <Badge variant="secondary" className="rounded-full text-[11px]">
          {JOB_TYPE_LABELS[job.employmentType] ?? job.employmentType}
        </Badge>
        {job.location && (
          <Badge variant="secondary" className="gap-1 rounded-full text-[11px]">
            <MapPin size={10} /> {job.location}
          </Badge>
        )}
        {job.department && (
          <Badge variant="secondary" className="rounded-full text-[11px]">{job.department}</Badge>
        )}
      </div>

      <p className="mt-3 line-clamp-2 text-xs leading-relaxed text-muted-foreground">{job.description}</p>

      <div className="mt-auto flex items-center justify-between gap-2 pt-4 text-[11px] text-muted-foreground">
        <span className="flex items-center gap-1">
          <Clock3 size={11} /> {timeAgo(job.createdAt)}
        </span>
        <span className="flex items-center gap-2.5">
          {salary && (
            <span className="flex items-center gap-1 font-semibold text-foreground">
              <Wallet size={11} /> {salary}
            </span>
          )}
          <span className="flex items-center gap-1">
            <Eye size={11} /> {job.views}
          </span>
        </span>
      </div>
    </motion.button>
  )
}

// ── detail dialog ────────────────────────────────────────────────────────────

function JobDetailDialog({
  job,
  applied,
  onOpenChange,
  onApply,
}: {
  job: JobDTO
  applied: boolean
  onOpenChange: (v: boolean) => void
  onApply: () => void
}) {
  const salary = salaryLabel(job)
  return (
    <Dialog open onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-xl">
        <DialogHeader>
          <DialogTitle className="text-xl leading-snug">{job.title}</DialogTitle>
          <DialogDescription className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <span className="flex items-center gap-1 font-medium text-foreground">
              <Building2 size={13} /> {job.orgName}
              {job.orgVerified && <BadgeCheck size={13} className="text-primary" />}
            </span>
            <span aria-hidden>·</span>
            <span className="font-mono text-[11px]">{job.number}</span>
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="flex flex-wrap gap-1.5">
            <Badge variant="secondary" className="rounded-full">{JOB_TYPE_LABELS[job.employmentType] ?? job.employmentType}</Badge>
            {job.location && <Badge variant="secondary" className="gap-1 rounded-full"><MapPin size={11} /> {job.location}</Badge>}
            {job.department && <Badge variant="secondary" className="rounded-full">{job.department}</Badge>}
            {salary && <Badge variant="secondary" className="gap-1 rounded-full"><Wallet size={11} /> {salary}</Badge>}
          </div>

          <div className="rounded-xl border bg-muted/30 p-3 text-xs">
            <p className="flex flex-wrap items-center gap-x-4 gap-y-1 text-muted-foreground">
              <span>Posted {formatDate(job.createdAt)}</span>
              <span className="flex items-center gap-1"><Eye size={11} /> {job.views} views</span>
              <span className="flex items-center gap-1"><Send size={11} /> {job.applicationCount} applicants</span>
            </p>
          </div>

          <div>
            <h4 className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">About the role</h4>
            <p className="mt-1.5 whitespace-pre-wrap text-sm leading-relaxed">{job.description}</p>
          </div>

          {job.requirements && (
            <div>
              <h4 className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">What you&apos;ll bring</h4>
              <p className="mt-1.5 whitespace-pre-wrap text-sm leading-relaxed">{job.requirements}</p>
            </div>
          )}

          {job.expiresAt && (
            <p className="text-xs text-muted-foreground">Applications close {formatDate(job.expiresAt)}.</p>
          )}
        </div>

        <DialogFooter className="flex-col gap-2 sm:flex-col sm:items-stretch">
          {applied ? (
            <Button disabled className="w-full rounded-xl">
              <SendHorizontal size={15} className="mr-1.5" /> Application submitted
            </Button>
          ) : (
            <Button className="w-full rounded-xl" onClick={onApply}>
              <Send size={15} className="mr-1.5" /> Apply with your Vendora profile
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// ── apply dialog ─────────────────────────────────────────────────────────────

function ApplyDialog({
  job,
  onOpenChange,
  onDone,
}: {
  job: JobDTO
  onOpenChange: (v: boolean) => void
  onDone: () => void
}) {
  const user = useMarketplace((s) => s.user)
  const [note, setNote] = useState('')
  const [contact, setContact] = useState('')
  const [sending, setSending] = useState(false)

  const submit = async () => {
    setSending(true)
    const res = await fetch(`/api/jobs/${job.id}/applications`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ coverNote: note.trim(), contactEmail: contact.trim() || null }),
    })
    setSending(false)
    if (!res.ok) {
      const json = await res.json().catch(() => ({}))
      toast({ title: 'Could not submit the application', description: json.error ?? 'Please try again.', variant: 'destructive' })
      return
    }
    toast({
      title: 'Application sent',
      description: `${job.orgName} — ${job.title}. You'll be notified when they review it.`,
    })
    onDone()
  }

  return (
    <Dialog open onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Send size={17} className="text-primary" /> Apply — {job.title}
          </DialogTitle>
          <DialogDescription>
            {job.orgName} · {JOB_TYPE_LABELS[job.employmentType] ?? 'Role'}
            {job.location ? ` · ${job.location}` : ''}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div className="rounded-xl border bg-muted/30 p-3 text-xs text-muted-foreground">
            Applying as <strong className="text-foreground">{user?.name}</strong> — your name, account email and
            this note are shared with the company.
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="apply-note">Why you&apos;re a fit</Label>
            <Textarea
              id="apply-note"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              maxLength={4000}
              placeholder="Relevant experience, availability, why this company…"
              className="min-h-32 rounded-xl"
            />
            <p className="text-right text-[10px] text-muted-foreground">{note.length}/4000</p>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="apply-contact" className="flex items-center gap-1.5">
              <Mail size={12} /> Contact email <span className="text-[10px] font-normal text-muted-foreground">(optional)</span>
            </Label>
            <Input
              id="apply-contact"
              type="email"
              value={contact}
              onChange={(e) => setContact(e.target.value)}
              placeholder={user?.email ?? 'you@example.com'}
              className="rounded-xl"
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" className="rounded-xl" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            className="rounded-xl"
            disabled={note.trim().length < 20 || sending}
            onClick={() => void submit()}
          >
            {sending ? <Loader2 size={15} className="mr-1.5 animate-spin" /> : <Send size={15} className="mr-1.5" />}
            Submit application
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
