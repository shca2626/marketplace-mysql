'use client'

import { useState } from 'react'
import {
  ChevronLeft,
  ChevronRight,
  FileClock,
  Loader2,
  RefreshCw,
  ScrollText,
  ShieldAlert,
} from 'lucide-react'
import { useApi } from '@/hooks/use-api'
import type { AuditLogDTO } from '@/lib/types'
import { formatDate, timeAgo } from '@/lib/format'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Skeleton } from '@/components/ui/skeleton'
import {
  AdminEmptyState,
  ACTOR_TYPE_MAP,
  StatusBadge,
  useDebounced,
} from './shared'

const ENTITY_TYPES = [
  { value: '__all__', label: 'All entities' },
  { value: 'Organization', label: 'Organizations' },
  { value: 'Rfq', label: 'RFQs' },
  { value: 'Quote', label: 'Quotes' },
  { value: 'PriceList', label: 'Price lists' },
  { value: 'CustomerGroup', label: 'Customer groups' },
  { value: 'Coupon', label: 'Coupons' },
]

const ACTOR_TYPES = [
  { value: '__all__', label: 'All actors' },
  { value: 'ADMIN', label: 'Admin' },
  { value: 'SELLER', label: 'Seller' },
  { value: 'USER', label: 'User' },
  { value: 'SYSTEM', label: 'System' },
]

const ACTION_SUGGESTIONS = [
  'ORG_VERIFIED',
  'ORG_SUSPENDED',
  'ORG_REJECTED',
  'ORG_UPDATED',
  'ORG_CREATED',
  'RFQ_SUBMIT',
  'RFQ_REVIEW',
  'RFQ_REJECT',
  'QUOTE_SENT',
  'QUOTE_ACCEPTED',
  'PRICELIST_CREATED',
  'PRICELIST_UPDATED',
  'PRICELIST_ENTRIES_REPLACED',
  'GROUP_CREATED',
  'GROUP_UPDATED',
  'COUPON_CREATED',
  'COUPON_DELETED',
]

const PAGE_SIZE = 50

export function AuditTab() {
  const [entityType, setEntityType] = useState('__all__')
  const [actorType, setActorType] = useState('__all__')
  const [action, setAction] = useState('')
  const debouncedAction = useDebounced(action)
  const [page, setPage] = useState(1)
  // Render-time keyed sync: jump back to page 1 whenever filters change
  const filterKey = `${entityType}|${actorType}|${debouncedAction}`
  const [appliedKey, setAppliedKey] = useState<string | null>(null)
  if (appliedKey !== filterKey) {
    setAppliedKey(filterKey)
    setPage(1)
  }

  const query = new URLSearchParams({ page: String(page), pageSize: String(PAGE_SIZE) })
  if (entityType !== '__all__') query.set('entityType', entityType)
  if (actorType !== '__all__') query.set('actorType', actorType)
  if (debouncedAction.trim()) query.set('action', debouncedAction.trim().toUpperCase())

  const { data, loading, error, refetch } = useApi<{
    logs: AuditLogDTO[]
    total: number
    page: number
    pageSize: number
  }>(`/api/admin/audit-logs?${query.toString()}`)
  const logs = data?.logs ?? []
  const total = data?.total ?? 0
  const totalPages = Math.max(1, Math.ceil(total / (data?.pageSize ?? PAGE_SIZE)))
  const activeFilters = entityType !== '__all__' || actorType !== '__all__' || !!debouncedAction.trim()

  return (
    <div className="space-y-5">
      {/* Filters */}
      <div className="flex flex-col gap-3 lg:flex-row lg:items-end">
        <div className="grid flex-1 grid-cols-2 gap-3 sm:grid-cols-3">
          <div className="space-y-1.5">
            <label htmlFor="audit-entity" className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Entity
            </label>
            <Select value={entityType} onValueChange={setEntityType}>
              <SelectTrigger id="audit-entity" aria-label="Filter by entity type">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {ENTITY_TYPES.map((e) => (
                  <SelectItem key={e.value} value={e.value}>
                    {e.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <label htmlFor="audit-actor" className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Actor
            </label>
            <Select value={actorType} onValueChange={setActorType}>
              <SelectTrigger id="audit-actor" aria-label="Filter by actor type">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {ACTOR_TYPES.map((a) => (
                  <SelectItem key={a.value} value={a.value}>
                    {a.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="col-span-2 space-y-1.5 sm:col-span-1">
            <label htmlFor="audit-action" className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Action
            </label>
            <Input
              id="audit-action"
              list="audit-action-suggestions"
              value={action}
              onChange={(e) => setAction(e.target.value)}
              placeholder="e.g. ORG_VERIFIED"
              className="h-9 rounded-lg font-mono text-xs uppercase"
            />
            <datalist id="audit-action-suggestions">
              {ACTION_SUGGESTIONS.map((a) => (
                <option key={a} value={a} />
              ))}
            </datalist>
          </div>
        </div>
        <Button
          variant="outline"
          className="shrink-0 rounded-xl"
          onClick={() => void refetch()}
          disabled={loading}
        >
          {loading ? <Loader2 size={15} className="mr-2 animate-spin" /> : <RefreshCw size={15} className="mr-2" />}
          Refresh
        </Button>
      </div>

      {/* Loading */}
      {loading && (
        <div className="space-y-2.5">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-16 w-full rounded-xl" />
          ))}
        </div>
      )}

      {/* Error */}
      {!loading && error && (
        <AdminEmptyState icon={ShieldAlert} title="Couldn't load the audit log" description={error}>
          <Button variant="outline" className="rounded-xl" onClick={() => void refetch()}>
            Try again
          </Button>
        </AdminEmptyState>
      )}

      {/* Empty */}
      {!loading && !error && logs.length === 0 && (
        <AdminEmptyState
          icon={FileClock}
          title={activeFilters ? 'No matching entries' : 'No audit entries yet'}
          description={
            activeFilters
              ? 'Try clearing a filter — actions must match exactly (e.g. ORG_VERIFIED).'
              : 'Platform activity will appear here as soon as anything happens.'
          }
        />
      )}

      {/* Entries — desktop table */}
      {!loading && !error && logs.length > 0 && (
        <>
          <div className="hidden overflow-hidden rounded-2xl border md:block">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-muted/50 text-left text-xs uppercase tracking-wide text-muted-foreground">
                  <th scope="col" className="px-4 py-3 font-medium">When</th>
                  <th scope="col" className="px-4 py-3 font-medium">Actor</th>
                  <th scope="col" className="px-4 py-3 font-medium">Action</th>
                  <th scope="col" className="px-4 py-3 font-medium">Entity</th>
                  <th scope="col" className="px-4 py-3 font-medium">Summary</th>
                </tr>
              </thead>
              <tbody>
                {logs.map((log) => (
                  <tr key={log.id} className="border-b align-top transition-colors last:border-0 hover:bg-accent/50">
                    <td className="whitespace-nowrap px-4 py-3.5">
                      <p className="text-xs font-medium tabular-nums">{timeAgo(log.createdAt)}</p>
                      <p className="text-[11px] text-muted-foreground" title={new Date(log.createdAt).toLocaleString()}>
                        {formatDate(log.createdAt)}
                      </p>
                    </td>
                    <td className="px-4 py-3.5">
                      <StatusBadge status={log.actorType} map={ACTOR_TYPE_MAP} />
                    </td>
                    <td className="px-4 py-3.5">
                      <span className="rounded-lg bg-muted px-2 py-1 font-mono text-[11px] font-semibold">
                        {log.action}
                      </span>
                    </td>
                    <td className="px-4 py-3.5">
                      <span className="text-xs text-muted-foreground">
                        {log.entityType}
                        {log.entityId ? ` · ${log.entityId.slice(-6)}` : ''}
                      </span>
                    </td>
                    <td className="max-w-md px-4 py-3.5 text-sm">
                      {log.summary ?? <span className="text-muted-foreground">—</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Mobile stacked cards */}
          <div className="space-y-2.5 md:hidden">
            {logs.map((log) => (
              <Card key={log.id}>
                <CardContent className="p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <StatusBadge status={log.actorType} map={ACTOR_TYPE_MAP} />
                      <span className="rounded-lg bg-muted px-2 py-0.5 font-mono text-[11px] font-semibold">
                        {log.action}
                      </span>
                    </div>
                    <span className="shrink-0 text-[11px] text-muted-foreground" title={new Date(log.createdAt).toLocaleString()}>
                      {timeAgo(log.createdAt)}
                    </span>
                  </div>
                  <p className="mt-2 text-sm">{log.summary ?? log.entityType}</p>
                  <p className="mt-1 text-[11px] text-muted-foreground">
                    {log.entityType}
                    {log.entityId ? ` · ${log.entityId.slice(-6)}` : ''} · {formatDate(log.createdAt)}
                  </p>
                </CardContent>
              </Card>
            ))}
          </div>

          {/* Pagination */}
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-xs text-muted-foreground" aria-live="polite">
              {total.toLocaleString('en-US')} {total === 1 ? 'entry' : 'entries'} · showing{' '}
              {(data?.page ?? page) * (data?.pageSize ?? PAGE_SIZE) - (data?.pageSize ?? PAGE_SIZE) + 1}–
              {Math.min((data?.page ?? page) * (data?.pageSize ?? PAGE_SIZE), total)}
            </p>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                className="h-8 rounded-lg"
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page <= 1 || loading}
                aria-label="Previous page"
              >
                <ChevronLeft size={14} /> Prev
              </Button>
              <span className="text-xs font-semibold tabular-nums" aria-label={`Page ${page} of ${totalPages}`}>
                {page} / {totalPages}
              </span>
              <Button
                variant="outline"
                size="sm"
                className="h-8 rounded-lg"
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={page >= totalPages || loading}
                aria-label="Next page"
              >
                Next <ChevronRight size={14} />
              </Button>
            </div>
          </div>
        </>
      )}

      {!loading && !error && logs.length === 0 && (
        <p className="flex items-center justify-center gap-1.5 pt-1 text-xs text-muted-foreground">
          <ScrollText size={13} /> Every admin action in this session is recorded here in near-real-time.
        </p>
      )}
    </div>
  )
}
