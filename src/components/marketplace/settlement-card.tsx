'use client'

import { useEffect, useRef, useState } from 'react'
import {
  ArrowLeftRight,
  BadgeCheck,
  CircleAlert,
  FileUp,
  Loader2,
  Paperclip,
  ShieldCheck,
} from 'lucide-react'
import { toast } from '@/hooks/use-toast'
import { useApi } from '@/hooks/use-api'
import { formatUSD } from '@/lib/format'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Textarea } from '@/components/ui/textarea'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { cn } from '@/lib/utils'

// ─────────────────────────────────────────────────────────────────────────────
// EXTERNAL SETTLEMENT CARD — the intermediary-model companion for an order.
// Buyer↔supplier money settles OUTSIDE the platform; this card records that
// settlement: one party declares (method + reference + proof), the counterpart
// (or an admin) confirms, either can flag it disputed. No money moves here.
// Used by the buyer orders view, the seller orders queue and the admin console.
// ─────────────────────────────────────────────────────────────────────────────

interface SettlementEvidence {
  id: string
  name: string
  mime: string
  size: number
  url: string
  uploadedById: string
  createdAt: string
}

export interface Settlement {
  id: string
  orderId: string
  orderRef: string
  orderTotal: number
  orderStatus: string
  method: string
  reference: string | null
  status: 'DECLARED' | 'CONFIRMED' | 'DISPUTED'
  declaredBy: { id: string; name: string } | null
  declaredAt: string
  settledAt: string | null
  confirmedBy: { id: string; name: string } | null
  confirmedAt: string | null
  note: string | null
  evidence: SettlementEvidence[]
  createdAt: string
}

const METHOD_LABELS: Record<string, string> = {
  WIRE: 'Bank wire',
  TRANSFER: 'Account transfer',
  CHEQUE: 'Cheque',
  CASH: 'Cash',
  OTHER: 'Other channel',
}

const STATUS_STYLES: Record<string, string> = {
  DECLARED: 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300',
  CONFIRMED: 'bg-teal-100 text-teal-800 dark:bg-teal-950 dark:text-teal-300',
  DISPUTED: 'bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-300',
}

function fmtSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

export function SettlementCard({
  orderId,
  viewerRole,
  currentUserId,
}: {
  orderId: string
  viewerRole: 'buyer' | 'seller' | 'admin'
  currentUserId: string
}) {
  const { data, loading, error, refetch } = useApi<{ settlement: Settlement }>(
    `/api/orders/${orderId}/settlement`
  )
  const settlement = data?.settlement ?? null
  // 404 → nothing declared yet (useApi surfaces the message); that's a state, not a failure
  const noneYet = !settlement && !loading

  const [declaring, setDeclaring] = useState(false)
  const [method, setMethod] = useState('WIRE')
  const [reference, setReference] = useState('')
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)
  const [disputeNote, setDisputeNote] = useState('')
  const [showDispute, setShowDispute] = useState(false)
  const [uploading, setUploading] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  // Reset the dispute box whenever the settlement row changes
  useEffect(() => {
    setShowDispute(false)
    setDisputeNote('')
  }, [settlement?.id, settlement?.status])

  const api = async (path: string, body?: unknown, method = 'POST') => {
    setBusy(true)
    try {
      const res = await fetch(`/api/orders/${orderId}/settlement${path}`, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: body ? JSON.stringify(body) : undefined,
      })
      const json = await res.json()
      if (!res.ok) {
        toast({ title: 'Settlement action failed', description: json.error, variant: 'destructive' })
        return null
      }
      await refetch()
      return json
    } catch {
      toast({ title: 'Network error', description: 'Please try again', variant: 'destructive' })
      return null
    } finally {
      setBusy(false)
    }
  }

  const uploadEvidence = async (files: FileList | null) => {
    if (!files?.length) return
    setUploading(true)
    try {
      const form = new FormData()
      for (const f of Array.from(files).slice(0, 6)) form.append('file', f)
      const res = await fetch('/api/uploads/document', { method: 'POST', body: form })
      const json = await res.json()
      if (!res.ok) {
        toast({ title: 'Upload failed', description: json.error, variant: 'destructive' })
        return
      }
      const keys: string[] = (json.assets ?? []).map((a: { key: string }) => a.key)
      if (keys.length === 0) {
        toast({ title: 'Nothing uploaded', description: json.errors?.[0]?.error ?? 'Try a different file', variant: 'destructive' })
        return
      }
      const done = await api('/evidence', { mediaKeys: keys })
      if (done) toast({ title: 'Evidence attached', description: `${keys.length} document(s) added to the settlement record.` })
    } catch {
      toast({ title: 'Upload failed', description: 'Network error', variant: 'destructive' })
    } finally {
      setUploading(false)
      if (fileRef.current) fileRef.current.value = ''
    }
  }

  const declare = async () => {
    const done = await api('', {
      method,
      reference: reference.trim() || null,
      note: note.trim() || null,
    })
    if (done) {
      toast({ title: 'Settlement declared', description: 'The counterpart can now confirm it from their dashboard.' })
      setDeclaring(false)
    }
  }

  const confirm = async () => {
    const done = await api('/confirm', note.trim() ? { note: note.trim() } : undefined)
    if (done) toast({ title: 'Settlement confirmed', description: 'The order is now fully evidenced.' })
  }

  const dispute = async () => {
    const done = await api('/dispute', { note: disputeNote.trim() })
    if (done) toast({ title: 'Settlement disputed', description: 'A platform administrator will review it.' })
  }

  const iDeclared = settlement?.declaredBy?.id === currentUserId
  const isAdmin = viewerRole === 'admin'
  const canConfirm =
    !!settlement &&
    settlement.status !== 'CONFIRMED' &&
    (isAdmin || (!iDeclared && settlement.status !== 'DISPUTED'))
  const canDispute =
    !!settlement && settlement.status !== 'CONFIRMED' && (viewerRole === 'buyer' || viewerRole === 'seller' || isAdmin)

  return (
    <div className="rounded-xl border border-dashed bg-muted/20 p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <ArrowLeftRight size={15} className="text-primary" />
          <p className="text-sm font-semibold">External settlement</p>
          {settlement && (
            <Badge className={cn('rounded-full text-[10px] font-semibold uppercase', STATUS_STYLES[settlement.status])}>
              {settlement.status.toLowerCase()}
            </Badge>
          )}
        </div>
        {settlement && (
          <p className="text-xs text-muted-foreground">
            {formatUSD(settlement.orderTotal)} settles outside the platform
          </p>
        )}
      </div>

      {/* ── No settlement yet ── */}
      {noneYet && !declaring && (
        <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
          <p className="max-w-md text-xs text-muted-foreground">
            {error ?? 'No external settlement recorded yet.'} Declare it once you have paid your supplier
            directly — the counterpart confirms and both sides keep the evidence trail.
          </p>
          <Button size="sm" variant="outline" className="h-8 rounded-full" onClick={() => setDeclaring(true)}>
            <ShieldCheck size={13} className="mr-1.5" /> Declare settlement
          </Button>
        </div>
      )}

      {/* ── Declare form ── */}
      {noneYet && declaring && (
        <div className="mt-3 space-y-3">
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor={`settle-method-${orderId}`} className="text-xs">Channel used</Label>
              <Select value={method} onValueChange={setMethod}>
                <SelectTrigger id={`settle-method-${orderId}`} className="h-9">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(METHOD_LABELS).map(([id, label]) => (
                    <SelectItem key={id} value={id}>{label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor={`settle-ref-${orderId}`} className="text-xs">Reference (invoice / transfer id)</Label>
              <Input
                id={`settle-ref-${orderId}`}
                value={reference}
                onChange={(e) => setReference(e.target.value)}
                placeholder="e.g. INV-2041 · TRX-889912"
                className="h-9"
                maxLength={160}
              />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor={`settle-note-${orderId}`} className="text-xs">Note (optional)</Label>
            <Input
              id={`settle-note-${orderId}`}
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Paid on NET-30 per the supplier invoice"
              className="h-9"
              maxLength={200}
            />
          </div>
          <div className="flex gap-2">
            <Button size="sm" className="h-8 rounded-full" onClick={declare} disabled={busy}>
              {busy ? <Loader2 size={13} className="mr-1.5 animate-spin" /> : <ShieldCheck size={13} className="mr-1.5" />}
              Declare
            </Button>
            <Button size="sm" variant="ghost" className="h-8 rounded-full" onClick={() => setDeclaring(false)} disabled={busy}>
              Cancel
            </Button>
          </div>
        </div>
      )}

      {/* ── Existing settlement ── */}
      {settlement && (
        <div className="mt-3 space-y-3">
          <div className="grid gap-x-6 gap-y-1.5 text-xs sm:grid-cols-2">
            <p>
              <span className="text-muted-foreground">Channel:</span>{' '}
              <span className="font-medium">{METHOD_LABELS[settlement.method] ?? settlement.method}</span>
            </p>
            <p>
              <span className="text-muted-foreground">Reference:</span>{' '}
              <span className="font-medium">{settlement.reference ?? '—'}</span>
            </p>
            <p>
              <span className="text-muted-foreground">Declared by:</span>{' '}
              <span className="font-medium">{settlement.declaredBy?.name ?? '—'}</span>
              <span className="text-muted-foreground"> · {new Date(settlement.declaredAt).toLocaleDateString()}</span>
            </p>
            {settlement.confirmedAt && (
              <p>
                <span className="text-muted-foreground">Confirmed by:</span>{' '}
                <span className="font-medium">{settlement.confirmedBy?.name ?? '—'}</span>
                <span className="text-muted-foreground"> · {new Date(settlement.confirmedAt).toLocaleDateString()}</span>
              </p>
            )}
            {settlement.settledAt && (
              <p>
                <span className="text-muted-foreground">Settled on:</span>{' '}
                <span className="font-medium">{new Date(settlement.settledAt).toLocaleDateString()}</span>
              </p>
            )}
          </div>
          {settlement.note && (
            <p className="rounded-lg bg-background px-3 py-2 text-xs text-muted-foreground">{settlement.note}</p>
          )}

          {/* Evidence */}
          <div className="space-y-1.5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-xs font-semibold">
                Evidence documents{' '}
                <span className="font-normal text-muted-foreground">({settlement.evidence.length})</span>
              </p>
              <button
                type="button"
                onClick={() => fileRef.current?.click()}
                disabled={uploading}
                className="inline-flex h-7 items-center gap-1.5 rounded-full border px-2.5 text-[11px] font-medium transition-colors hover:bg-muted disabled:opacity-50"
              >
                {uploading ? <Loader2 size={11} className="animate-spin" /> : <FileUp size={11} />}
                {uploading ? 'Uploading…' : 'Upload proof'}
              </button>
              <input
                ref={fileRef}
                type="file"
                multiple
                accept=".pdf,.docx,.xlsx,.csv,.txt,.zip"
                className="hidden"
                onChange={(e) => uploadEvidence(e.target.files)}
              />
            </div>
            {settlement.evidence.length > 0 ? (
              <ul className="space-y-1">
                {settlement.evidence.map((ev) => (
                  <li key={ev.id}>
                    <a
                      href={`${ev.url}?download=${encodeURIComponent(ev.name)}`}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex max-w-full items-center gap-1.5 rounded-md bg-background px-2 py-1 text-xs hover:bg-muted"
                    >
                      <Paperclip size={11} className="shrink-0 text-muted-foreground" />
                      <span className="truncate">{ev.name}</span>
                      <span className="shrink-0 text-[10px] text-muted-foreground">{fmtSize(ev.size)}</span>
                    </a>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-[11px] text-muted-foreground">
                Transfer slips, bank statements or the supplier invoice — attach them as proof.
              </p>
            )}
          </div>

          {/* Actions */}
          {settlement.status !== 'CONFIRMED' && (
            <div className="flex flex-wrap items-center gap-2 border-t pt-3">
              {canConfirm && (
                <Button size="sm" className="h-8 rounded-full" onClick={confirm} disabled={busy}>
                  {busy ? <Loader2 size={13} className="mr-1.5 animate-spin" /> : <BadgeCheck size={13} className="mr-1.5" />}
                  {settlement.status === 'DISPUTED' ? 'Resolve & confirm' : 'Confirm settlement'}
                </Button>
              )}
              {canDispute && !showDispute && (
                <Button
                  size="sm"
                  variant="outline"
                  className="h-8 rounded-full text-destructive hover:text-destructive"
                  onClick={() => setShowDispute(true)}
                  disabled={busy}
                >
                  <CircleAlert size={13} className="mr-1.5" /> Dispute
                </Button>
              )}
              {canDispute && showDispute && (
                <div className="flex w-full flex-col gap-2 rounded-lg border border-destructive/40 bg-destructive/5 p-2.5 sm:flex-row sm:items-center">
                  <Textarea
                    value={disputeNote}
                    onChange={(e) => setDisputeNote(e.target.value)}
                    placeholder="What is wrong with this settlement? (at least 10 characters)"
                    className="min-h-[38px] flex-1 text-xs"
                    rows={2}
                    maxLength={500}
                  />
                  <div className="flex shrink-0 gap-2">
                    <Button
                      size="sm"
                      variant="destructive"
                      className="h-8 rounded-full"
                      onClick={dispute}
                      disabled={busy || disputeNote.trim().length < 10}
                    >
                      Submit dispute
                    </Button>
                    <Button size="sm" variant="ghost" className="h-8 rounded-full" onClick={() => setShowDispute(false)}>
                      Cancel
                    </Button>
                  </div>
                </div>
              )}
              {iDeclared && settlement.status === 'DECLARED' && !isAdmin && (
                <p className="text-[11px] text-muted-foreground">
                  Waiting for the counterpart (or a platform admin) to confirm.
                </p>
              )}
              {settlement.status === 'DISPUTED' && !isAdmin && (
                <p className="text-[11px] text-muted-foreground">Disputed — a platform admin will review and resolve.</p>
              )}
            </div>
          )}
          {settlement.status === 'CONFIRMED' && (
            <p className="flex items-center gap-1.5 border-t pt-3 text-[11px] text-teal-700 dark:text-teal-400">
              <BadgeCheck size={13} /> Settlement confirmed — this transaction is fully evidenced.
            </p>
          )}
        </div>
      )}
    </div>
  )
}
