'use client'

import { useEffect, useRef, useState } from 'react'
import { motion } from 'framer-motion'
import {
  CalendarClock,
  CalendarX,
  Pause,
  Play,
  Repeat,
  Repeat2,
  SkipForward,
  Trash2,
} from 'lucide-react'
import { toast } from '@/hooks/use-toast'
import { useMarketplace } from '@/store/marketplace'
import { useApi } from '@/hooks/use-api'
import type { RecurringScheduleDTO } from '@/lib/types'
import { formatDate } from '@/lib/format'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { apiRequest } from './b2b-shared'
import { cn } from '@/lib/utils'

/**
 * RECURRING RFQs UI (settings: Recurring RFQs panel).
 *
 *  • RecurringField — create-form section ("Repeat this request")
 *  • RecurringSchedulesCard — the buyer's standing schedules (pause/resume/
 *    skip/delete) shown above the RFQ list
 */

const FREQUENCY_LABELS: Record<string, string> = {
  WEEKLY: 'Weekly',
  BIWEEKLY: 'Every 2 weeks',
  MONTHLY: 'Monthly',
  QUARTERLY: 'Quarterly',
  CUSTOM: 'Custom',
}

export interface RecurringPublicConfig {
  enabled: boolean
  patterns: string[]
  buyerSkipCycle: boolean
}

// ── Create-form section ─────────────────────────────────────────────────────

export function RecurringField({
  config,
  value,
  onChange,
  customDays,
  onCustomDaysChange,
}: {
  config: RecurringPublicConfig | null
  value: string // 'none' | WEEKLY | BIWEEKLY | MONTHLY | QUARTERLY | CUSTOM
  onChange: (v: string) => void
  customDays: string
  onCustomDaysChange: (v: string) => void
}) {
  if (!config?.enabled) return null
  const patterns = config.patterns?.length ? config.patterns : Object.keys(FREQUENCY_LABELS)

  return (
    <div className="space-y-2.5 rounded-xl border border-primary/25 bg-primary/5 p-4">
      <div className="flex items-center justify-between gap-2">
        <Label htmlFor="rfq-repeat" className="flex items-center gap-1.5 text-sm">
          <Repeat size={14} className="text-primary" /> Repeat this request
        </Label>
        {value !== 'none' && (
          <Badge className="rounded-full border-0 bg-primary/15 text-primary">Standing schedule</Badge>
        )}
      </div>
      <Select value={value} onValueChange={onChange}>
        <SelectTrigger id="rfq-repeat" className="h-10 rounded-xl bg-background" aria-label="Repeat this request">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="none">One-time — no repeat</SelectItem>
          {patterns.map((p) => (
            <SelectItem key={p} value={p}>
              {FREQUENCY_LABELS[p] ?? p}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      {value === 'CUSTOM' && (
        <div className="space-y-1.5">
          <Label htmlFor="rfq-repeat-days" className="text-xs">
            Repeat every N days
          </Label>
          <Input
            id="rfq-repeat-days"
            type="number"
            min="1"
            max="365"
            value={customDays}
            onChange={(e) => onCustomDaysChange(e.target.value)}
            className="h-9 rounded-xl bg-background"
            placeholder="e.g. 21"
          />
        </div>
      )}
      <p className="text-xs text-muted-foreground">
        The first request goes out now; the schedule re-publishes it automatically each cycle —
        you&apos;ll get a heads-up before every run and can skip or pause anytime.
      </p>
    </div>
  )
}

// ── Schedules manager (above the RFQ list) ─────────────────────────────────

export function RecurringSchedulesCard({ focusId }: { focusId?: string | null }) {
  const user = useMarketplace((s) => s.user)
  const { data, loading, refetch } = useApi<{ schedules: RecurringScheduleDTO[] }>(
    user ? '/api/recurring-rfqs' : null,
    { skip: !user }
  )
  const [busyId, setBusyId] = useState<string | null>(null)

  const schedules = data?.schedules ?? []
  const active = schedules.filter((s) => s.active)
  const paused = schedules.filter((s) => !s.active)

  const act = async (id: string, verb: 'pause' | 'resume' | 'skip' | 'delete') => {
    setBusyId(id)
    let res
    if (verb === 'delete') {
      res = await apiRequest(`/api/recurring-rfqs/${id}`, { method: 'DELETE' })
    } else if (verb === 'skip') {
      res = await apiRequest<{ schedule: RecurringScheduleDTO }>(`/api/recurring-rfqs/${id}/skip`, {
        method: 'POST',
      })
    } else {
      res = await apiRequest<{ schedule: RecurringScheduleDTO }>(`/api/recurring-rfqs/${id}`, {
        method: 'PATCH',
        body: JSON.stringify({ action: verb }),
      })
    }
    setBusyId(null)
    if (!res.ok) {
      toast({ title: 'Could not update schedule', description: res.error, variant: 'destructive' })
      return
    }
    const copy: Record<string, string> = {
      pause: 'Schedule paused',
      resume: 'Schedule resumed',
      skip: 'Cycle skipped — next run moved out one cycle',
      delete: 'Schedule deleted',
    }
    toast({ title: copy[verb] })
    void refetch()
  }

  // Focus handoff (notification → list): scroll the matching row into view
  // now that the card lives below the primary list.
  const focusRef = useRef<HTMLDivElement | null>(null)
  useEffect(() => {
    if (focusId) focusRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' })
  }, [focusId])

  if (loading) return null
  if (schedules.length === 0) return null

  return (
    <motion.section
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      aria-label="Recurring RFQ schedules"
      className="rounded-2xl border border-primary/25 bg-primary/[0.04] p-5"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="flex items-center gap-2 text-sm font-bold uppercase tracking-wide text-muted-foreground">
          <Repeat2 size={14} className="text-primary" /> Standing schedules
          <span className="rounded-full bg-primary/15 px-2 py-0.5 text-[11px] font-bold text-primary">
            {active.length} active
          </span>
        </h2>
        <p className="text-xs text-muted-foreground">
          Standing requests re-publish automatically each cycle.
        </p>
      </div>

      <div className="mt-4 max-h-96 space-y-2.5 overflow-y-auto pr-1">
        {[...active, ...paused].map((s) => (
          <div
            key={s.id}
            id={focusId === s.id ? `schedule-${s.id}` : undefined}
            ref={focusId === s.id ? focusRef : undefined}
            className={cn(
              'flex flex-wrap items-center justify-between gap-3 rounded-xl border bg-background p-3.5',
              focusId === s.id && 'ring-2 ring-primary/40',
              !s.active && 'opacity-75'
            )}
          >
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <p className="truncate text-sm font-semibold">
                  {s.title?.trim() || `Recurring request (${s.lineCount} item${s.lineCount === 1 ? '' : 's'})`}
                </p>
                <Badge
                  className={cn(
                    'rounded-full border-0 text-[11px] font-semibold',
                    s.active
                      ? 'bg-teal-100 text-teal-800 dark:bg-teal-950 dark:text-teal-300'
                      : 'bg-neutral-200 text-neutral-600 dark:bg-neutral-800 dark:text-neutral-400'
                  )}
                >
                  {s.active ? FREQUENCY_LABELS[s.frequency] ?? s.frequency : 'Paused'}
                </Badge>
              </div>
              <p className="mt-0.5 text-xs text-muted-foreground">
                {s.active ? (
                  <>
                    Next run {formatDate(s.nextRunAt)} · {s.runCount} run{s.runCount === 1 ? '' : 's'} ·{' '}
                    {s.totalQuantity} units
                    {s.emptyCycles > 0 && (
                      <span className="text-amber-600 dark:text-amber-400">
                        {' '}
                        · {s.emptyCycles} empty cycle{s.emptyCycles === 1 ? '' : 's'} in a row
                      </span>
                    )}
                  </>
                ) : (
                  <>
                    Paused — resume to restart the cycle (runs to date: {s.runCount})
                  </>
                )}
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-1.5">
              {s.active ? (
                <>
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-7 rounded-full text-xs"
                    disabled={busyId === s.id}
                    onClick={() => void act(s.id, 'pause')}
                  >
                    <Pause size={11} className="mr-1" /> Pause
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-7 rounded-full text-xs"
                    disabled={busyId === s.id}
                    onClick={() => void act(s.id, 'skip')}
                    title="Push the next run out by one cycle"
                  >
                    <SkipForward size={11} className="mr-1" /> Skip cycle
                  </Button>
                </>
              ) : (
                <Button
                  variant="outline"
                  size="sm"
                  className="h-7 rounded-full text-xs"
                  disabled={busyId === s.id}
                  onClick={() => void act(s.id, 'resume')}
                >
                  <Play size={11} className="mr-1" /> Resume
                </Button>
              )}
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-7 rounded-full text-xs text-destructive hover:border-destructive/40 hover:bg-destructive/10 hover:text-destructive"
                    disabled={busyId === s.id}
                  >
                    <Trash2 size={11} />
                    <span className="sr-only">Delete schedule</span>
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Delete this schedule?</AlertDialogTitle>
                    <AlertDialogDescription>
                      “{s.title?.trim() || 'This recurring request'}” will stop re-publishing. Past runs stay in
                      your RFQ history.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Keep it</AlertDialogCancel>
                    <AlertDialogAction
                      className="bg-destructive text-white hover:bg-destructive/90"
                      onClick={() => void act(s.id, 'delete')}
                    >
                      Delete schedule
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            </div>
          </div>
        ))}
      </div>

      {paused.length > 0 && (
        <p className="mt-3 flex items-center gap-1.5 text-[11px] text-muted-foreground">
          <CalendarX size={12} className="shrink-0" />
          Schedules pause themselves after repeated runs with no quotes.
        </p>
      )}
      <p className="mt-2 flex items-center gap-1.5 text-[11px] text-muted-foreground">
        <CalendarClock size={12} className="shrink-0" />
        You&apos;ll get a notification before each run — skip a cycle anytime.
      </p>
    </motion.section>
  )
}
