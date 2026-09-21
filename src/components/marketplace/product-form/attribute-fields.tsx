'use client'

import { Check, X } from 'lucide-react'
import type { AttributeDef, AttributeValue } from '@/lib/catalog/definitions'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Switch } from '@/components/ui/switch'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { cn } from '@/lib/utils'

/**
 * Dynamic per-category attribute controls. Renders one control per
 * AttributeDef — add a def in lib/catalog and it appears here automatically.
 */
export function AttributeFields({
  defs,
  values,
  onChange,
  idPrefix = 'attr',
}: {
  defs: AttributeDef[]
  values: Record<string, AttributeValue | undefined>
  onChange: (key: string, value: AttributeValue | undefined) => void
  idPrefix?: string
}) {
  if (defs.length === 0) return null

  return (
    <div className="grid gap-4 sm:grid-cols-2">
      {defs.map((def) => {
        const id = `${idPrefix}-${def.key}`
        const value = values[def.key]

        return (
          <div
            key={def.key}
            className={cn(
              'space-y-1.5',
              (def.type === 'textarea' || def.type === 'multiselect') && 'sm:col-span-2'
            )}
          >
            <Label htmlFor={id} className="text-xs font-medium">
              {def.label}
              {def.unit && <span className="ml-1 font-normal text-muted-foreground">({def.unit})</span>}
            </Label>

            {def.type === 'text' && (
              <Input
                id={id}
                value={typeof value === 'string' ? value : ''}
                placeholder={def.placeholder}
                onChange={(e) => onChange(def.key, e.target.value || undefined)}
              />
            )}

            {def.type === 'textarea' && (
              <Textarea
                id={id}
                value={typeof value === 'string' ? value : ''}
                placeholder={def.placeholder}
                className="min-h-16"
                onChange={(e) => onChange(def.key, e.target.value || undefined)}
              />
            )}

            {def.type === 'number' && (
              <div className="relative">
                <Input
                  id={id}
                  type="number"
                  min={def.min}
                  max={def.max}
                  step={def.step ?? 1}
                  value={value === undefined || value === null ? '' : String(value)}
                  placeholder={def.placeholder ?? '—'}
                  onChange={(e) => {
                    const raw = e.target.value
                    if (raw === '') return onChange(def.key, undefined)
                    const n = Number(raw)
                    if (Number.isFinite(n)) onChange(def.key, n)
                  }}
                />
                {def.unit && (
                  <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">
                    {def.unit}
                  </span>
                )}
              </div>
            )}

            {def.type === 'boolean' && (
              <div className="flex h-9 items-center gap-2">
                <Switch
                  id={id}
                  checked={value === true}
                  onCheckedChange={(v) => onChange(def.key, v || undefined)}
                />
                <span className="text-xs text-muted-foreground">{value === true ? 'Yes' : 'No'}</span>
              </div>
            )}

            {def.type === 'select' && (
              <Select
                value={typeof value === 'string' ? value : ''}
                onValueChange={(v) => onChange(def.key, v || undefined)}
              >
                <SelectTrigger id={id} aria-label={def.label}>
                  <SelectValue placeholder="Not set" />
                </SelectTrigger>
                <SelectContent>
                  {(def.options ?? []).map((o) => (
                    <SelectItem key={o.value} value={o.value}>
                      {o.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}

            {def.type === 'multiselect' && (
              <div className="flex flex-wrap gap-1.5 rounded-lg border bg-background p-2">
                {(def.options ?? []).map((o) => {
                  const list = Array.isArray(value) ? value : []
                  const selected = list.includes(o.value)
                  return (
                    <button
                      key={o.value}
                      type="button"
                      aria-pressed={selected}
                      onClick={() => {
                        const next = selected
                          ? list.filter((x) => x !== o.value)
                          : [...list, o.value]
                        onChange(def.key, next.length > 0 ? next : undefined)
                      }}
                      className={cn(
                        'inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs transition-colors',
                        selected
                          ? 'border-primary bg-primary text-primary-foreground'
                          : 'bg-background text-muted-foreground hover:border-primary/50 hover:text-foreground'
                      )}
                    >
                      {selected && <Check size={11} />}
                      {o.label}
                    </button>
                  )
                })}
                {Array.isArray(value) && value.length > 0 && (
                  <button
                    type="button"
                    onClick={() => onChange(def.key, undefined)}
                    className="ml-auto inline-flex items-center gap-0.5 rounded-full px-2 py-1 text-[10px] text-muted-foreground transition-colors hover:text-destructive"
                  >
                    <X size={10} /> clear
                  </button>
                )}
              </div>
            )}

            {def.help && <p className="text-[11px] leading-4 text-muted-foreground">{def.help}</p>}
          </div>
        )
      })}
    </div>
  )
}
