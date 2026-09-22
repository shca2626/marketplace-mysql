'use client'

// ─────────────────────────────────────────────────────────────────────────────
// Generic settings panel form — renders ANY panel from the rfq-settings
// registry: toggles, selects, numbers, texts, chip multiselects, checkbox
// lists, number lists, sliders (with weight-sum guard) and table editors.
// The registry is the single source of truth — this component never hardcodes
// a field.
// ─────────────────────────────────────────────────────────────────────────────

import {
  Lock,
  Plus,
  Trash2,
} from 'lucide-react'
import {
  RFQ_SETTING_PANELS,
  type Field,
  type PanelValue,
  type TableRow,
} from '@/lib/rfq-settings/registry'
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
import { Slider } from '@/components/ui/slider'
import { Switch } from '@/components/ui/switch'
import { cn } from '@/lib/utils'

// ── Field row wrapper ──────────────────────────────────────────────────────

function FieldRow({ field, children }: { field: Field; children: React.ReactNode }) {
  const isWide = field.type === 'checkboxlist' || field.type === 'table' || field.type === 'multiselect'
  return (
    <div className={cn('gap-2', isWide ? 'flex flex-col' : 'flex flex-col sm:flex-row sm:items-center sm:justify-between')}>
      <div className="min-w-0 sm:max-w-[62%]">
        <Label className="flex items-center gap-1.5 text-[13px] font-medium leading-snug text-foreground/90">
          {field.locked && <Lock size={11} className="shrink-0 text-muted-foreground" />}
          <span className={cn(field.locked && 'text-muted-foreground')}>{field.label}</span>
        </Label>
        {field.help && <p className="mt-0.5 text-xs leading-snug text-muted-foreground">{field.help}</p>}
      </div>
      <div className={cn('shrink-0', isWide ? 'w-full' : 'sm:w-[42%]')}>{children}</div>
    </div>
  )
}

// ── Number list editor (e.g. reminders at 48h, 12h) ─────────────────────────

function NumberListEditor({
  field,
  value,
  onChange,
  disabled,
}: {
  field: Extract<Field, { type: 'numberlist' }>
  value: number[]
  onChange: (v: number[]) => void
  disabled?: boolean
}) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      {value.map((n, i) => (
        <div key={i} className="flex items-center gap-1">
          <Input
            type="number"
            inputMode="numeric"
            className="h-8 w-20 rounded-lg"
            min={field.min}
            max={field.max}
            value={n}
            disabled={disabled}
            onChange={(e) => {
              const v = [...value]
              v[i] = Number(e.target.value)
              onChange(v)
            }}
          />
          {value.length > 1 && !disabled && (
            <button
              type="button"
              aria-label="Remove value"
              className="rounded-md p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
              onClick={() => onChange(value.filter((_, j) => j !== i))}
            >
              <Trash2 size={13} />
            </button>
          )}
        </div>
      ))}
      {!disabled && value.length < 6 && (
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="h-8 rounded-lg px-2.5 text-xs"
          onClick={() => onChange([...value, 12])}
        >
          <Plus size={12} className="mr-1" /> Add
        </Button>
      )}
      {field.unit && <span className="text-xs text-muted-foreground">{field.unit}</span>}
    </div>
  )
}

// ── Table editor ────────────────────────────────────────────────────────────

function TableEditor({
  field,
  value,
  onChange,
  disabled,
}: {
  field: Extract<Field, { type: 'table' }>
  value: TableRow[]
  onChange: (v: TableRow[]) => void
  disabled?: boolean
}) {
  const updateCell = (rowIndex: number, colKey: string, raw: string) => {
    const rows = value.map((r) => ({ ...r }))
    const col = field.columns.find((c) => c.key === colKey)
    if (!col) return
    if (col.type === 'number') {
      rows[rowIndex][colKey] = raw === '' ? null : Number(raw)
    } else {
      rows[rowIndex][colKey] = raw
    }
    onChange(rows)
  }
  return (
    <div className="overflow-x-auto rounded-xl border">
      <table className="w-full min-w-[720px] text-left text-xs">
        <thead>
          <tr className="border-b bg-muted/50">
            {field.columns.map((col) => (
              <th key={col.key} className="whitespace-nowrap px-2.5 py-2 font-semibold text-muted-foreground">
                {col.label}
              </th>
            ))}
            <th className="w-10" />
          </tr>
        </thead>
        <tbody>
          {value.length === 0 && (
            <tr>
              <td colSpan={field.columns.length + 1} className="px-3 py-4 text-center text-muted-foreground">
                No rows yet — add one below.
              </td>
            </tr>
          )}
          {value.map((row, rowIndex) => (
            <tr key={rowIndex} className="border-b last:border-0">
              {field.columns.map((col) => (
                <td key={col.key} className="px-1.5 py-1.5">
                  {col.type === 'toggle' ? (
                    <Switch
                      checked={Boolean(row[col.key])}
                      disabled={disabled}
                      onCheckedChange={(v) => {
                        const rows = value.map((r) => ({ ...r }))
                        rows[rowIndex][col.key] = v
                        onChange(rows)
                      }}
                    />
                  ) : (
                    <Input
                      type={col.type === 'number' ? 'number' : 'text'}
                      className={cn('h-8 rounded-lg', col.width)}
                      placeholder={col.placeholder}
                      value={row[col.key] === null || row[col.key] === undefined ? '' : String(row[col.key])}
                      disabled={disabled}
                      onChange={(e) => updateCell(rowIndex, col.key, e.target.value)}
                    />
                  )}
                </td>
              ))}
              <td className="px-1">
                {!disabled && (
                  <button
                    type="button"
                    aria-label="Remove row"
                    className="rounded-md p-1.5 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                    onClick={() => onChange(value.filter((_, j) => j !== rowIndex))}
                  >
                    <Trash2 size={13} />
                  </button>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {!disabled && (
        <div className="border-t bg-muted/30 px-2.5 py-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-7 rounded-lg text-xs"
            disabled={field.maxRows !== undefined && value.length >= field.maxRows}
            onClick={() => onChange([...value, { ...field.newRow }])}
          >
            <Plus size={12} className="mr-1" /> Add row
          </Button>
        </div>
      )}
    </div>
  )
}

// ── Single field renderer ───────────────────────────────────────────────────

export function SettingsField({
  field,
  value,
  draft,
  onChange,
  disabled,
}: {
  field: Field
  value: unknown
  /** full draft document (for showIf lookups) */
  draft: PanelValue
  onChange: (next: unknown) => void
  disabled?: boolean
}) {
  // conditional visibility
  if (field.showIf) {
    const cond = field.showIf
    if (draft[cond.field] !== cond.equals) return null
  }

  switch (field.type) {
    case 'toggle':
      return (
        <FieldRow field={field}>
          <div className="flex justify-end">
            <Switch checked={Boolean(value)} disabled={disabled || field.locked} onCheckedChange={(v) => onChange(v)} />
          </div>
        </FieldRow>
      )
    case 'text':
      return (
        <FieldRow field={field}>
          <Input
            className="h-9 rounded-lg"
            placeholder={field.placeholder}
            value={typeof value === 'string' ? value : ''}
            disabled={disabled || field.locked}
            onChange={(e) => onChange(e.target.value)}
          />
        </FieldRow>
      )
    case 'number':
      return (
        <FieldRow field={field}>
          <div className="flex items-center gap-2">
            <Input
              type="number"
              inputMode="decimal"
              className="h-9 rounded-lg"
              min={field.min}
              max={field.max}
              step={field.step ?? 1}
              value={typeof value === 'number' ? value : 0}
              disabled={disabled || field.locked}
              onChange={(e) => onChange(Number(e.target.value))}
            />
            {field.unit === 'currency' ? (
              <span className="text-xs font-medium text-muted-foreground">USD</span>
            ) : field.unit ? (
              <span className="text-xs font-medium text-muted-foreground">{field.unit}</span>
            ) : null}
          </div>
        </FieldRow>
      )
    case 'select':
      return (
        <FieldRow field={field}>
          <Select value={String(value ?? '')} disabled={disabled || field.locked} onValueChange={(v) => onChange(v)}>
            <SelectTrigger className="h-9 w-full rounded-lg">
              <SelectValue placeholder="Choose…" />
            </SelectTrigger>
            <SelectContent className="max-h-72 rounded-xl">
              {field.options.map((o) => (
                <SelectItem key={o.value} value={o.value}>
                  {o.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </FieldRow>
      )
    case 'multiselect':
      return (
        <FieldRow field={field}>
          {field.options.length === 0 ? (
            <p className="rounded-lg border border-dashed px-3 py-2 text-xs text-muted-foreground">
              {typeof value === 'object' && Array.isArray(value) && value.length > 0
                ? (value as string[]).join(', ')
                : 'Nothing selected'}
            </p>
          ) : (
            <div className="flex flex-wrap gap-1.5">
              {field.options.map((o) => {
                const list = Array.isArray(value) ? (value as string[]) : []
                const on = list.includes(o.value)
                return (
                  <button
                    key={o.value}
                    type="button"
                    disabled={disabled}
                    className={cn(
                      'rounded-full border px-2.5 py-1 text-xs font-medium transition-colors',
                      on
                        ? 'border-primary bg-primary text-primary-foreground'
                        : 'border-border bg-background text-muted-foreground hover:border-primary/40 hover:text-foreground'
                    )}
                    onClick={() => onChange(on ? list.filter((v) => v !== o.value) : [...list, o.value])}
                  >
                    {o.label}
                  </button>
                )
              })}
            </div>
          )}
        </FieldRow>
      )
    case 'checkboxlist': {
      const list = Array.isArray(value) ? (value as string[]) : []
      return (
        <FieldRow field={field}>
          <div className="grid grid-cols-1 gap-x-4 gap-y-1.5 rounded-xl border bg-muted/30 p-3 sm:grid-cols-2">
            {field.options.map((o) => (
              <label key={o.value} className="flex cursor-pointer items-center gap-2 text-xs text-foreground/90">
                <Checkbox
                  checked={list.includes(o.value)}
                  disabled={disabled}
                  onCheckedChange={() =>
                    onChange(list.includes(o.value) ? list.filter((v) => v !== o.value) : [...list, o.value])
                  }
                />
                {o.label}
              </label>
            ))}
          </div>
        </FieldRow>
      )
    }
    case 'numberlist':
      return (
        <FieldRow field={field}>
          <NumberListEditor
            field={field}
            value={Array.isArray(value) ? (value as number[]) : []}
            onChange={(v) => onChange(v)}
            disabled={disabled || field.locked}
          />
        </FieldRow>
      )
    case 'slider':
      return (
        <FieldRow field={field}>
          <div className="flex items-center gap-3">
            <Slider
              className="flex-1"
              min={field.min}
              max={field.max}
              step={field.step ?? 1}
              value={[typeof value === 'number' ? value : field.default]}
              disabled={disabled || field.locked}
              onValueChange={(v) => onChange(v[0])}
            />
            <span className="w-14 text-right text-xs font-semibold tabular-nums text-foreground">
              {typeof value === 'number' ? value : field.default}
              {field.unit ?? ''}
            </span>
          </div>
        </FieldRow>
      )
    case 'table':
      return (
        <FieldRow field={field}>
          <TableEditor
            field={field}
            value={Array.isArray(value) ? (value as TableRow[]) : []}
            onChange={(v) => onChange(v)}
            disabled={disabled || field.locked}
          />
        </FieldRow>
      )
  }
}

// ── Full panel form ─────────────────────────────────────────────────────────

/** Weight-slider keys on the distribution panel — guarded to sum to 100%. */
const WEIGHT_KEYS = [
  'weightVerification', 'weightRating', 'weightCommission',
  'weightResponseSpeed', 'weightProximity', 'weightWinRate',
]

export function SettingsPanelForm({
  panelKey,
  draft,
  onChange,
  disabled,
}: {
  panelKey: string
  draft: PanelValue
  onChange: (field: string, next: unknown) => void
  disabled?: boolean
}) {
  const panel = RFQ_SETTING_PANELS[panelKey]
  if (!panel) return null

  const weightSum = WEIGHT_KEYS.reduce((acc, k) => acc + (Number(draft[k]) || 0), 0)
  const showWeightGuard = panelKey === 'distribution' && WEIGHT_KEYS.every((k) => k in draft)

  return (
    <div className="space-y-6">
      {panel.groups.map((group, gi) => (
        <section key={gi} className="space-y-4">
          {group.title && (
            <div className="border-b pb-1.5">
              <h3 className="text-sm font-semibold tracking-tight">{group.title}</h3>
              {group.description && <p className="mt-0.5 text-xs text-muted-foreground">{group.description}</p>}
            </div>
          )}
          {group.fields.map((field) => (
            <SettingsField
              key={field.key}
              field={field}
              value={draft[field.key]}
              draft={draft}
              disabled={disabled}
              onChange={(next) => onChange(field.key, next)}
            />
          ))}
          {showWeightGuard && gi === panel.groups.length - 1 && (
            <div
              className={cn(
                'flex items-center justify-between rounded-xl border px-3 py-2 text-xs font-medium',
                weightSum === 100
                  ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400'
                  : 'border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-400'
              )}
            >
              <span>Weight total</span>
              <span className="tabular-nums">
                {weightSum}% {weightSum === 100 ? '✓' : '(should be 100%)'}
              </span>
            </div>
          )}
        </section>
      ))}
    </div>
  )
}

/** Badge chip for changed-field counts etc. */
export function CountBadge({ children }: { children: React.ReactNode }) {
  return <Badge variant="secondary" className="rounded-full px-2 text-[11px]">{children}</Badge>
}
