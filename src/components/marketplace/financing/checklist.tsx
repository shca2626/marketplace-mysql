'use client'

// ─────────────────────────────────────────────────────────────────────────────
// REQUIREMENTS CHECKLIST — the applicant's view of the requirements engine
// (DP-24). One component family serves three surfaces:
//
//   1. Service detail preview (directory)  — read-only rows (labels only)
//   2. Wizard step 2                        — client-held answers keyed by
//                                              ServiceRequirement id
//   3. Request detail                       — live RequirementSubmissions w/
//                                              verdicts + per-item answering
//                                              (PATCH .../submissions/[sid])
//
// Typed answer controls mirror the server's submissionAnswerSchema exactly:
// DOCUMENT → vault picker · PROFILE_FIELD → auto (read-only) · DECLARATION →
// 'CONFIRMED' checkbox · TEXT/NUMBER/DATE/SELECT/MULTI_SELECT inputs.
// ─────────────────────────────────────────────────────────────────────────────

import type { LucideIcon } from 'lucide-react'
import {
  AtSign,
  BadgeCheck,
  CalendarDays,
  ChevronRight,
  FileText,
  Hash,
  ListChecks,
  ScanLine,
  ShieldQuestion,
  SquareCheck,
  Upload,
} from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { cn } from '@/lib/utils'
import {
  FinancingStatusBadge,
  SUBMISSION_STATUS_MAP,
  conditionTypeLabel,
  documentTypeLabel,
} from '@/components/marketplace/financier/financing-status-badge'
import type {
  AccountDocumentDTO,
  ChecklistAnswer,
  PublicRequirementDTO,
  SubmissionDTO,
} from './shared'

// ── Condition-type iconography ──────────────────────────────────────────────

const CONDITION_ICONS: Record<string, LucideIcon> = {
  DOCUMENT: ScanLine,
  PROFILE_FIELD: BadgeCheck,
  DECLARATION: SquareCheck,
  TEXT: AtSign,
  NUMBER: Hash,
  DATE: CalendarDays,
  SELECT: ChevronRight,
  MULTI_SELECT: ListChecks,
}

export function ConditionTypeIcon({ type, className }: { type: string; className?: string }) {
  const Icon = CONDITION_ICONS[type] ?? ShieldQuestion
  return <Icon size={15} className={className} />
}

// ── Vault doc status (documents center + pickers) ──────────────────────────

export const DOC_STATUS_MAP: Record<string, { label: string; badge: string }> = {
  PENDING: { label: 'Pending review', badge: 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300' },
  VERIFIED: { label: 'Verified', badge: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300' },
  REJECTED: { label: 'Rejected', badge: 'bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-300' },
}

export function DocStatusBadge({ status }: { status: string }) {
  const entry = DOC_STATUS_MAP[status]
  return (
    <Badge className={cn('rounded-full border-0 text-[11px] font-semibold', entry?.badge ?? 'bg-muted text-muted-foreground')}>
      {entry?.label ?? status}
    </Badge>
  )
}

// ── Normalized checklist row ───────────────────────────────────────────────

export interface ChecklistRow {
  key: string
  requirementId: string
  conditionType: string
  title: string
  description: string | null
  instructions: string | null
  isRequired: boolean
  documentType: string | null
  validationMin: number | null
  validationMax: number | null
  options: { value: string; position: number }[]
  /** detail mode only — live verdict + note + current values */
  status?: string
  decisionNote?: string | null
  autoPassAccredited?: boolean
}

export function rowsFromRequirements(requirements: PublicRequirementDTO[]): ChecklistRow[] {
  return [...requirements]
    .sort((a, b) => a.displayOrder - b.displayOrder)
    .map((r) => ({
      key: r.id,
      requirementId: r.id,
      conditionType: r.conditionType,
      title: r.title,
      description: r.description,
      instructions: r.instructions,
      isRequired: r.isRequired,
      documentType: r.documentType,
      validationMin: r.validationMin,
      validationMax: r.validationMax,
      options: [...r.options].sort((a, b) => a.position - b.position),
      autoPassAccredited: r.autoPassAccredited,
    }))
}

export function rowsFromSubmissions(submissions: SubmissionDTO[]): ChecklistRow[] {
  return [...submissions]
    .sort((a, b) => a.displayOrder - b.displayOrder)
    .map((s) => ({
      key: s.id,
      requirementId: s.serviceRequirementId,
      conditionType: s.template.conditionType,
      title: s.template.title,
      description: s.template.description,
      instructions: s.instructions,
      isRequired: s.isRequired,
      documentType: s.template.documentType,
      validationMin: s.template.validationMin,
      validationMax: s.template.validationMax,
      options: [...s.template.options].sort((a, b) => a.position - b.position),
      status: s.status,
      decisionNote: s.decisionNote,
      autoPassAccredited: s.autoPassAccredited,
    }))
}

/** The current answer of a live submission (detail mode initial value). */
export function answerOfSubmission(s: SubmissionDTO): ChecklistAnswer {
  return {
    valueText: s.valueText,
    valueNumber: s.valueNumber,
    valueDate: s.valueDate?.slice(0, 10) ?? null,
    accountDocumentId: s.accountDocumentId,
  }
}

/** Is a required row satisfied by the held answer? (wizard completeness) */
export function rowAnswered(row: ChecklistRow, answer?: ChecklistAnswer | null): boolean {
  if (row.conditionType === 'PROFILE_FIELD') return true // auto-evaluated server-side
  if (!answer) return false
  switch (row.conditionType) {
    case 'DOCUMENT':
      return !!answer.accountDocumentId
    case 'DECLARATION':
      return (answer.valueText ?? '').trim().toUpperCase() === 'CONFIRMED'
    case 'NUMBER':
      return answer.valueNumber != null && Number.isFinite(answer.valueNumber)
    case 'DATE':
      return !!answer.valueDate
    case 'SELECT':
      return !!answer.valueText?.trim()
    case 'MULTI_SELECT':
      return (answer.valueText ?? '')
        .split(';')
        .map((t) => t.trim())
        .filter(Boolean).length > 0
    case 'TEXT':
    default:
      return !!answer.valueText?.trim()
  }
}

export function missingRequired(rows: ChecklistRow[], answers: Record<string, ChecklistAnswer>): ChecklistRow[] {
  return rows.filter((r) => r.isRequired && !rowAnswered(r, answers[r.requirementId]))
}

// ── The typed answer control ───────────────────────────────────────────────

function VaultPicker({
  row,
  documents,
  value,
  onChange,
  disabled,
  onManageDocuments,
}: {
  row: ChecklistRow
  documents: AccountDocumentDTO[]
  value: ChecklistAnswer | null | undefined
  onChange: (answer: ChecklistAnswer) => void
  disabled?: boolean
  onManageDocuments?: () => void
}) {
  const active = documents.filter((d) => d.isActive)
  const preferred = row.documentType
    ? active.filter((d) => d.documentType === row.documentType)
    : active
  const others = row.documentType ? active.filter((d) => d.documentType !== row.documentType) : []
  const selected = active.find((d) => d.id === value?.accountDocumentId) ?? null
  const attachable = preferred.length > 0 || others.length > 0

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <Select
          value={value?.accountDocumentId ?? undefined}
          onValueChange={(v) => onChange({ accountDocumentId: v })}
          disabled={disabled}
        >
          <SelectTrigger className="h-9 w-full max-w-md rounded-xl text-sm sm:w-80" aria-label={`Attach a document for ${row.title}`}>
            <SelectValue placeholder={attachable ? 'Pick a document from your vault…' : 'Your vault has no usable documents yet'} />
          </SelectTrigger>
          <SelectContent>
            {preferred.length > 0 && (
              <>
                {row.documentType && (
                  <p className="px-2 pb-1 pt-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                    Matching {documentTypeLabel(row.documentType) ?? 'required'} type
                  </p>
                )}
                {preferred.map((d) => (
                  <SelectItem key={d.id} value={d.id} className="gap-2">
                    <span className="flex min-w-0 flex-1 flex-col">
                      <span className="truncate">{d.title ?? d.media.originalName}</span>
                      <span className="truncate text-[11px] text-muted-foreground">
                        {documentTypeLabel(d.documentType)} · {DOC_STATUS_MAP[d.status]?.label ?? d.status}
                      </span>
                    </span>
                  </SelectItem>
                ))}
              </>
            )}
            {others.length > 0 && (
              <>
                <p className="px-2 pb-1 pt-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                  Other documents
                </p>
                {others.map((d) => (
                  <SelectItem key={d.id} value={d.id} className="gap-2">
                    <span className="flex min-w-0 flex-1 flex-col">
                      <span className="truncate">{d.title ?? d.media.originalName}</span>
                      <span className="truncate text-[11px] text-muted-foreground">
                        {documentTypeLabel(d.documentType)} · {DOC_STATUS_MAP[d.status]?.label ?? d.status}
                      </span>
                    </span>
                  </SelectItem>
                ))}
              </>
            )}
            {!attachable && (
              <p className="px-2 py-3 text-center text-xs text-muted-foreground">
                Nothing attachable — upload first, then pick it here.
              </p>
            )}
          </SelectContent>
        </Select>
        {onManageDocuments && (
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-9 shrink-0 rounded-xl text-xs"
            onClick={onManageDocuments}
            disabled={disabled}
          >
            <Upload size={13} className="mr-1" /> Documents center
          </Button>
        )}
      </div>
      {selected && (
        <p className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
          <DocStatusBadge status={selected.status} />
          <span className="truncate">
            {selected.title ?? selected.media.originalName}
            {selected.expiresAt ? ` · expires ${new Date(selected.expiresAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}` : ''}
          </span>
        </p>
      )}
      {row.documentType && preferred.length === 0 && (
        <p className="text-xs text-amber-700 dark:text-amber-400">
          No {documentTypeLabel(row.documentType)?.toLowerCase()} in your vault yet — the checklist expects one.
        </p>
      )}
    </div>
  )
}

export function RequirementControl({
  row,
  value,
  onChange,
  disabled,
  documents,
  onManageDocuments,
}: {
  row: ChecklistRow
  value: ChecklistAnswer | null | undefined
  onChange: (answer: ChecklistAnswer) => void
  disabled?: boolean
  documents: AccountDocumentDTO[]
  onManageDocuments?: () => void
}) {
  switch (row.conditionType) {
    case 'PROFILE_FIELD':
      return (
        <p className="flex items-start gap-1.5 rounded-xl border border-dashed bg-muted/30 px-3 py-2 text-xs text-muted-foreground">
          <BadgeCheck size={13} className="mt-0.5 shrink-0 text-emerald-600 dark:text-emerald-400" />
          Evaluated automatically from your profile when the application is submitted — complete your
          account profile if this item fails verification.
        </p>
      )
    case 'DOCUMENT':
      return (
        <VaultPicker
          row={row}
          documents={documents}
          value={value}
          onChange={onChange}
          disabled={disabled}
          onManageDocuments={onManageDocuments}
        />
      )
    case 'DECLARATION':
      return (
        <label
          className={cn(
            'flex cursor-pointer items-start gap-2.5 rounded-xl border px-3 py-2.5 text-sm transition-colors',
            disabled ? 'cursor-not-allowed opacity-60' : 'hover:border-primary/40',
            (value?.valueText ?? '').toUpperCase() === 'CONFIRMED' && 'border-emerald-300 bg-emerald-50/60 dark:border-emerald-900 dark:bg-emerald-950/30'
          )}
        >
          <Checkbox
            checked={(value?.valueText ?? '').toUpperCase() === 'CONFIRMED'}
            onCheckedChange={(c) => onChange({ valueText: c ? 'CONFIRMED' : '' })}
            disabled={disabled}
            className="mt-0.5"
            aria-label={`Confirm: ${row.title}`}
          />
          <span className="leading-snug">
            I confirm
            {row.instructions ? <span className="text-muted-foreground"> — {row.instructions}</span> : null}
          </span>
        </label>
      )
    case 'NUMBER':
      return (
        <div className="space-y-1">
          <Input
            type="number"
            inputMode="decimal"
            className="w-full max-w-xs rounded-xl"
            placeholder={row.validationMin != null ? `At least ${row.validationMin}` : 'Enter a number'}
            value={value?.valueNumber ?? ''}
            min={row.validationMin ?? undefined}
            max={row.validationMax ?? undefined}
            disabled={disabled}
            onChange={(e) => {
              const raw = e.target.value
              onChange({ valueNumber: raw === '' ? null : Number(raw) })
            }}
            aria-label={row.title}
          />
          {(row.validationMin != null || row.validationMax != null) && (
            <p className="text-xs text-muted-foreground">
              {row.validationMin != null && row.validationMax != null
                ? `Between ${row.validationMin} and ${row.validationMax}`
                : row.validationMin != null
                  ? `Minimum ${row.validationMin}`
                  : `Maximum ${row.validationMax}`}
            </p>
          )}
        </div>
      )
    case 'DATE':
      return (
        <Input
          type="date"
          className="w-full max-w-xs rounded-xl"
          value={value?.valueDate ?? ''}
          disabled={disabled}
          onChange={(e) => onChange({ valueDate: e.target.value || null })}
          aria-label={row.title}
        />
      )
    case 'SELECT':
      return (
        <Select
          value={value?.valueText ?? undefined}
          onValueChange={(v) => onChange({ valueText: v })}
          disabled={disabled}
        >
          <SelectTrigger className="h-9 w-full max-w-xs rounded-xl text-sm" aria-label={row.title}>
            <SelectValue placeholder="Choose one…" />
          </SelectTrigger>
          <SelectContent>
            {row.options.map((o) => (
              <SelectItem key={o.value} value={o.value}>
                {o.value}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      )
    case 'MULTI_SELECT': {
      const picked = (value?.valueText ?? '')
        .split(';')
        .map((t) => t.trim())
        .filter(Boolean)
      return (
        <div className="flex flex-wrap gap-1.5">
          {row.options.map((o) => {
            const on = picked.includes(o.value)
            return (
              <button
                key={o.value}
                type="button"
                disabled={disabled}
                onClick={() =>
                  onChange({
                    valueText: (on ? picked.filter((v) => v !== o.value) : [...picked, o.value]).join('; '),
                  })
                }
                className={cn(
                  'rounded-full border px-3 py-1 text-xs font-medium transition-colors',
                  on
                    ? 'border-primary bg-primary/10 text-primary'
                    : 'bg-background text-muted-foreground hover:border-primary/40 hover:text-foreground',
                  disabled && 'cursor-not-allowed opacity-60'
                )}
                aria-pressed={on}
              >
                {o.value}
              </button>
            )
          })}
          {row.options.length === 0 && <p className="text-xs text-muted-foreground">No options configured.</p>}
        </div>
      )
    }
    case 'TEXT':
    default:
      return (
        <Input
          className="w-full max-w-md rounded-xl"
          placeholder="Your answer…"
          value={value?.valueText ?? ''}
          disabled={disabled}
          maxLength={500}
          onChange={(e) => onChange({ valueText: e.target.value })}
          aria-label={row.title}
        />
      )
  }
}

// ── One checklist row (header + optional control + verdict) ─────────────────

export function RequirementRow({
  row,
  value,
  onChange,
  disabled,
  documents,
  onManageDocuments,
  showControl,
  showStatus,
  saving,
}: {
  row: ChecklistRow
  value?: ChecklistAnswer | null
  onChange?: (answer: ChecklistAnswer) => void
  disabled?: boolean
  documents?: AccountDocumentDTO[]
  onManageDocuments?: () => void
  showControl?: boolean
  showStatus?: boolean
  saving?: boolean
}) {
  const rejected = row.status === 'REJECTED'
  return (
    <li
      className={cn(
        'rounded-xl border px-4 py-3.5 transition-colors',
        rejected && 'border-rose-300 bg-rose-50/50 dark:border-rose-900 dark:bg-rose-950/20'
      )}
    >
      <div className="flex items-start gap-3">
        <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border bg-card text-primary">
          <ConditionTypeIcon type={row.conditionType} />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <p className="text-sm font-semibold leading-snug">{row.title}</p>
            <span className="rounded-full bg-muted px-1.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
              {conditionTypeLabel(row.conditionType)}
            </span>
            {row.isRequired ? (
              <span className="rounded-full bg-amber-100 px-1.5 text-[10px] font-bold uppercase tracking-wide text-amber-800 dark:bg-amber-950 dark:text-amber-300">
                Required
              </span>
            ) : (
              <span className="rounded-full bg-muted px-1.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                Optional
              </span>
            )}
            {row.autoPassAccredited && (
              <span className="rounded-full bg-emerald-100 px-1.5 text-[10px] font-semibold uppercase tracking-wide text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300">
                Auto-pass w/ accreditation
              </span>
            )}
            {showStatus && row.status && <FinancingStatusBadge status={row.status} map={SUBMISSION_STATUS_MAP} />}
            {saving && <span className="text-[11px] text-muted-foreground">saving…</span>}
          </div>
          {row.description && (
            <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{row.description}</p>
          )}
          {row.instructions && (
            <p className="mt-1 text-xs italic leading-relaxed text-muted-foreground/90">{row.instructions}</p>
          )}
          {rejected && row.decisionNote && (
            <p className="mt-1.5 rounded-lg bg-rose-100/70 px-2.5 py-1.5 text-xs font-medium text-rose-800 dark:bg-rose-950/60 dark:text-rose-300">
              Reviewer note: {row.decisionNote}
            </p>
          )}
          {!rejected && row.decisionNote && row.status === 'WAIVED' && (
            <p className="mt-1.5 rounded-lg bg-stone-100 px-2.5 py-1.5 text-xs text-stone-600 dark:bg-stone-800/60 dark:text-stone-400">
              Waived: {row.decisionNote}
            </p>
          )}
          {showControl && onChange && (
            <div className="mt-2.5">
              <RequirementControl
                row={row}
                value={value}
                onChange={onChange}
                disabled={disabled}
                documents={documents ?? []}
                onManageDocuments={onManageDocuments}
              />
            </div>
          )}
        </div>
      </div>
    </li>
  )
}

// ── The checklist (grouped required / optional) ─────────────────────────────

export function RequirementChecklist({
  rows,
  answers,
  onChange,
  editable,
  documents,
  onManageDocuments,
  onAnswer, // detail mode: per-key async answer (key = submission id)
  showControls,
}: {
  rows: ChecklistRow[]
  answers?: Record<string, ChecklistAnswer> // wizard: by requirementId · detail: by key
  onChange?: (requirementId: string, answer: ChecklistAnswer) => void
  editable?: boolean
  documents?: AccountDocumentDTO[]
  onManageDocuments?: () => void
  onAnswer?: (key: string, answer: ChecklistAnswer) => void
  showControls?: boolean
}) {
  const required = rows.filter((r) => r.isRequired)
  const optional = rows.filter((r) => !r.isRequired)
  const group = (label: string, list: ChecklistRow[]) =>
    list.length > 0 && (
      <div>
        <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">{label}</p>
        <ul className="space-y-2.5">
          {list.map((row) => (
            <RequirementRow
              key={row.key}
              row={row}
              value={answers?.[row.requirementId] ?? answers?.[row.key]}
              onChange={
                editable && onAnswer
                  ? (a) => onAnswer(row.key, a)
                  : editable && onChange
                    ? (a) => onChange(row.requirementId, a)
                    : undefined
              }
              documents={documents}
              onManageDocuments={onManageDocuments}
              showControl={showControls ?? editable}
              showStatus={!!row.status}
            />
          ))}
        </ul>
      </div>
    )

  if (rows.length === 0) {
    return (
      <p className="rounded-xl border border-dashed px-4 py-6 text-center text-sm text-muted-foreground">
        No requirements attached to this service — the platform gate will review your profile and documents only.
      </p>
    )
  }

  return (
    <div className="space-y-5">
      {group('Required', required)}
      {group('Optional', optional)}
    </div>
  )
}
