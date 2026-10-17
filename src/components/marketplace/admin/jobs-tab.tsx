'use client'

// ── NETW-1: Admin → Operations → Jobs — the platform-side jobs board queue ──
// Every posting across companies with status filter, search and the
// moderation close action (jobs.moderate) for trust & safety.

import { useMemo, useState } from 'react'
import {
  Ban,
  Briefcase,
  Building2,
  Loader2,
  MapPin,
  Search,
  Users,
  X,
} from 'lucide-react'
import { toast } from '@/hooks/use-toast'
import { useApi } from '@/hooks/use-api'
import { timeAgo } from '@/lib/format'
import { apiRequest } from '@/components/marketplace/b2b/b2b-shared'
import { JOB_TYPE_LABELS, type JobDTO } from '@/lib/jobs-shared'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
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
import { Skeleton } from '@/components/ui/skeleton'
import { Textarea } from '@/components/ui/textarea'
import { cn } from '@/lib/utils'

interface JobsResponse {
  jobs: JobDTO[]
}

const STATUS_FILTERS = ['ALL', 'OPEN', 'PAUSED', 'CLOSED'] as const

const JOB_STATUS_MAP: Record<string, { label: string; badge: string }> = {
  OPEN: { label: 'Open', badge: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300' },
  PAUSED: { label: 'Paused', badge: 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300' },
  CLOSED: { label: 'Closed', badge: 'bg-neutral-200 text-neutral-600 dark:bg-neutral-800 dark:text-neutral-400' },
}

export function JobsTab() {
  const [status, setStatus] = useState<(typeof STATUS_FILTERS)[number]>('ALL')
  const [q, setQ] = useState('')
  const [search, setSearch] = useState('')
  const [closing, setClosing] = useState<JobDTO | null>(null)

  const url = `/api/admin/jobs?${new URLSearchParams({
    ...(status !== 'ALL' ? { status } : {}),
    ...(search ? { q: search } : {}),
  }).toString()}`
  const { data, loading, error, refetch } = useApi<JobsResponse>(url)
  const jobs = data?.jobs ?? []

  const stats = useMemo(
    () => ({
      open: jobs.filter((j) => j.status === 'OPEN').length,
      paused: jobs.filter((j) => j.status === 'PAUSED').length,
      closed: jobs.filter((j) => j.status === 'CLOSED').length,
      applicants: jobs.reduce((sum, j) => sum + j.applicationCount, 0),
    }),
    [jobs]
  )

  return (
    <div className="space-y-4">
      {/* KPI row */}
      <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
        <Kpi icon={Briefcase} label="Open postings" value={stats.open} tone="emerald" />
        <Kpi icon={X} label="Paused" value={stats.paused} tone="amber" />
        <Kpi icon={Ban} label="Closed" value={stats.closed} tone="neutral" />
        <Kpi icon={Users} label="Total applicants" value={stats.applicants} tone="violet" />
      </div>

      {/* Filters */}
      <div className="flex flex-col gap-2.5 sm:flex-row sm:items-center">
        <form
          className="relative flex-1"
          onSubmit={(e) => {
            e.preventDefault()
            setSearch(q.trim())
          }}
        >
          <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search title, number, company…" className="h-10 rounded-xl pl-10 pr-4" />
        </form>
        <div className="flex gap-1.5 overflow-x-auto pb-1">
          {STATUS_FILTERS.map((s) => (
            <button
              key={s}
              onClick={() => setStatus(s)}
              className={cn(
                'shrink-0 rounded-full border px-3 py-1.5 text-xs font-medium transition-all',
                status === s
                  ? 'border-primary bg-primary text-primary-foreground shadow-sm'
                  : 'bg-card text-muted-foreground hover:border-primary/50 hover:text-foreground'
              )}
            >
              {s === 'ALL' ? 'All' : JOB_STATUS_MAP[s]?.label}
            </button>
          ))}
        </div>
      </div>

      {/* Queue */}
      {loading ? (
        <div className="space-y-2">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-20 w-full rounded-xl" />
          ))}
        </div>
      ) : error ? (
        <Card className="flex flex-col items-center p-10 text-center">
          <X size={32} className="text-muted-foreground/40" />
          <p className="mt-2 text-sm font-semibold">Couldn&apos;t load the jobs queue</p>
          <p className="mt-1 text-xs text-muted-foreground">{error}</p>
          <Button variant="outline" className="mt-4 rounded-xl" onClick={() => void refetch()}>
            Try again
          </Button>
        </Card>
      ) : jobs.length === 0 ? (
        <Card className="flex flex-col items-center p-10 text-center">
          <Briefcase size={36} className="text-muted-foreground/40" />
          <p className="mt-3 text-sm font-semibold">No job postings match</p>
          <p className="mt-1 text-xs text-muted-foreground">Companies haven&apos;t posted here yet — or the filters are too narrow.</p>
        </Card>
      ) : (
        <div className="space-y-2">
          {jobs.map((job) => (
            <Card key={job.id} className="rounded-xl py-0 transition-shadow hover:shadow-sm">
              <CardContent className="flex flex-wrap items-center gap-3 px-4 py-3.5 sm:px-5">
                <Avatar className="h-9 w-9 shrink-0 border">
                  <AvatarFallback className="bg-primary/10 text-xs font-bold text-primary">
                    {job.orgName
                      .split(' ')
                      .map((w) => w[0])
                      .join('')
                      .slice(0, 2)
                      .toUpperCase()}
                  </AvatarFallback>
                </Avatar>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="truncate text-sm font-semibold">{job.title}</p>
                    <span className={cn('rounded-full px-2 py-0.5 text-[10px] font-semibold', JOB_STATUS_MAP[job.status]?.badge)}>
                      {JOB_STATUS_MAP[job.status]?.label ?? job.status}
                    </span>
                  </div>
                  <p className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 truncate text-[11px] text-muted-foreground">
                    <span className="flex items-center gap-1"><Building2 size={10} /> {job.orgName}</span>
                    <span className="font-mono">{job.number}</span>
                    {job.location && <span className="flex items-center gap-1"><MapPin size={10} /> {job.location}</span>}
                  </p>
                </div>
                <div className="flex items-center gap-3 text-[11px] text-muted-foreground">
                  <span className="hidden sm:inline">{JOB_TYPE_LABELS[job.employmentType] ?? job.employmentType}</span>
                  <span className="flex items-center gap-1"><Users size={11} /> {job.applicationCount}</span>
                  <span>{timeAgo(job.createdAt)}</span>
                </div>
                {job.status !== 'CLOSED' && (
                  <Button size="sm" variant="outline" className="h-8 shrink-0 rounded-lg text-xs text-destructive hover:text-destructive" onClick={() => setClosing(job)}>
                    <Ban size={13} className="mr-1" /> Close
                  </Button>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {closing && (
        <CloseModerationDialog
          job={closing}
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

function CloseModerationDialog({
  job,
  onOpenChange,
  onDone,
}: {
  job: JobDTO
  onOpenChange: (v: boolean) => void
  onDone: () => void
}) {
  const [reason, setReason] = useState('')
  const [sending, setSending] = useState(false)

  const submit = async () => {
    setSending(true)
    const res = await apiRequest(`/api/admin/jobs/${job.id}`, {
      method: 'PATCH',
      body: JSON.stringify({ reason: reason.trim() }),
    })
    setSending(false)
    if (!res.ok) {
      toast({ title: 'Could not close the posting', description: res.error, variant: 'destructive' })
      return
    }
    toast({
      title: 'Posting closed',
      description: `${job.number} — the company has been notified with your reason.`,
    })
    onDone()
  }

  return (
    <Dialog open onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Ban size={18} className="text-destructive" /> Close {job.number} for moderation
          </DialogTitle>
          <DialogDescription>
            &ldquo;{job.title}&rdquo; — {job.orgName}. The company sees your reason and the action lands in
            the audit trail.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-1.5">
          <Label htmlFor="moderation-reason">Reason (visible to the company)</Label>
          <Textarea
            id="moderation-reason"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            maxLength={400}
            placeholder="Which rule the posting breaks…"
            className="min-h-24 rounded-xl"
          />
        </div>
        <DialogFooter>
          <Button variant="outline" className="rounded-xl" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button variant="destructive" className="rounded-xl" disabled={reason.trim().length < 10 || sending} onClick={() => void submit()}>
            {sending ? <Loader2 size={15} className="mr-1.5 animate-spin" /> : <Ban size={15} className="mr-1.5" />}
            Close posting
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function Kpi({
  icon: Icon,
  label,
  value,
  tone,
}: {
  icon: React.ComponentType<{ size?: number; className?: string }>
  label: string
  value: number
  tone: 'emerald' | 'amber' | 'neutral' | 'violet'
}) {
  const tones = {
    emerald: 'text-emerald-600 dark:text-emerald-400',
    amber: 'text-amber-600 dark:text-amber-400',
    neutral: 'text-muted-foreground',
    violet: 'text-violet-600 dark:text-violet-400',
  } as const
  return (
    <div className="flex items-center gap-2.5 rounded-xl border bg-muted/30 px-3.5 py-2.5">
      <Icon size={15} className={cn('shrink-0', tones[tone])} />
      <div>
        <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">{label}</p>
        <p className="text-sm font-bold tabular-nums">{value}</p>
      </div>
    </div>
  )
}
