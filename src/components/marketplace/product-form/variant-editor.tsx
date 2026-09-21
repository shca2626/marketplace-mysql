'use client'

import { useMemo, useState } from 'react'
import { Layers, Plus, Trash2, X } from 'lucide-react'
import { isColorLike, resolveColorHex } from '@/lib/colors'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

/** A single generated variant row (one cell of the option-grid). */
export interface VariantDraft {
  options: Record<string, string>
  stock: number
  priceDelta: number
  sku: string
  id?: string // existing DB id (edit mode)
}

interface OptionGroup {
  name: string
  values: string[]
}

function cartesian(groups: OptionGroup[]): Record<string, string>[] {
  return groups
    .filter((g) => g.name && g.values.length > 0)
    .reduce<Record<string, string>[]>(
      (acc, g) => acc.flatMap((combo) => g.values.map((v) => ({ ...combo, [g.name]: v }))),
      [{}]
    )
    .filter((c) => Object.keys(c).length > 0)
}

function variantKey(options: Record<string, string>): string {
  return JSON.stringify(options)
}

export interface VariantGroups {
  name: string
  values: string[]
}

/**
 * Variant editor: CONTROLLED component — groups + variants live in the parent
 * form state (Radix tab panels unmount on switch, so local state would be
 * lost). Rows are the cartesian product of groups, merged with existing row
 * data (stock / price delta / sku) so editing never loses input.
 */
export function VariantEditor({
  groups,
  onGroupsChange,
  variants,
  onChange,
  disabled = false,
}: {
  groups: { name: string; values: string[] }[]
  onGroupsChange: (groups: { name: string; values: string[] }[]) => void
  variants: VariantDraft[]
  onChange: (variants: VariantDraft[]) => void
  disabled?: boolean
}) {
  const [newGroup, setNewGroup] = useState('')
  const [valueDrafts, setValueDrafts] = useState<Record<string, string>>({})

  const combos = useMemo(() => cartesian(groups), [groups])

  /** regenerate rows from groups, keeping existing row data by options key */
  const regenerate = (nextGroups: { name: string; values: string[] }[]) => {
    const byKey = new Map(variants.map((v) => [variantKey(v.options), v]))
    onChange(
      cartesian(nextGroups).map((options) => {
        const prev = byKey.get(variantKey(options))
        return {
          options,
          stock: prev?.stock ?? 5,
          priceDelta: prev?.priceDelta ?? 0,
          sku: prev?.sku ?? '',
          id: prev?.id,
        }
      })
    )
  }

  const setGroupsAndRegen = (next: { name: string; values: string[] }[]) => {
    onGroupsChange(next)
    regenerate(next)
  }

  const addGroup = () => {
    const name = newGroup.trim()
    if (!name || groups.some((g) => g.name.toLowerCase() === name.toLowerCase())) return
    setGroupsAndRegen([...groups, { name, values: [] }])
    setNewGroup('')
  }

  const addValue = (groupName: string) => {
    const raw = (valueDrafts[groupName] ?? '').trim()
    if (!raw) return
    const values = raw.split(',').map((v) => v.trim()).filter(Boolean)
    setGroupsAndRegen(
      groups.map((g) =>
        g.name === groupName
          ? { ...g, values: [...new Set([...g.values, ...values])] }
          : g
      )
    )
    setValueDrafts((d) => ({ ...d, [groupName]: '' }))
  }

  const removeGroup = (groupName: string) =>
    setGroupsAndRegen(groups.filter((g) => g.name !== groupName))
  const removeValue = (groupName: string, value: string) =>
    setGroupsAndRegen(
      groups.map((g) =>
        g.name === groupName ? { ...g, values: g.values.filter((v) => v !== value) } : g
      )
    )

  const updateRow = (key: string, patch: Partial<VariantDraft>) =>
    onChange(variants.map((v) => (variantKey(v.options) === key ? { ...v, ...patch } : v)))

  /** Remove one row: drop its value from the LAST option group (the most
   *  specific dimension — matches the value the buyer sees disappear). */
  const removeRow = (options: Record<string, string>) => {
    const groupNames = Object.keys(options)
    const last = groupNames[groupNames.length - 1]
    if (!last) {
      onChange(variants.filter((v) => variantKey(v.options) !== variantKey(options)))
      return
    }
    removeValue(last, options[last])
  }

  /** Single manual variant = an "Option" group with one value (visible + editable). */
  const addSingleVariant = () => {
    const name = 'Option'
    const existing = groups.find((g) => g.name === name)
    const next = `Variant ${combos.length + 1}`
    if (existing) {
      setGroupsAndRegen(
        groups.map((g) =>
          g.name === name ? { ...g, values: [...new Set([...g.values, next])] } : g
        )
      )
    } else {
      setGroupsAndRegen([...groups, { name, values: [next] }])
    }
  }

  return (
    <div className="space-y-4">
      {/* option groups */}
      <div className="space-y-2.5">
        <Label className="text-xs font-medium">Option groups</Label>
        <p className="text-[11px] leading-4 text-muted-foreground">
          e.g. group <b>Size</b> with values <b>S, M, L</b> — every combination becomes a purchasable variant.
        </p>

        {groups.map((g) => (
          <div key={g.name} className="rounded-xl border bg-muted/30 p-2.5">
            <div className="flex items-center gap-2">
              <span className="rounded-md bg-background px-2 py-1 text-xs font-semibold shadow-sm">
                {g.name}
              </span>
              <div className="ml-auto flex items-center gap-1">
                <Input
                  value={valueDrafts[g.name] ?? ''}
                  disabled={disabled}
                  onChange={(e) => setValueDrafts((d) => ({ ...d, [g.name]: e.target.value }))}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault()
                      addValue(g.name)
                    }
                  }}
                  placeholder="value, value…"
                  className="h-8 w-44 text-xs"
                  aria-label={`Add values to ${g.name} group`}
                />
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  className="h-8 w-8"
                  disabled={disabled}
                  onClick={() => addValue(g.name)}
                  aria-label={`Add value to ${g.name}`}
                >
                  <Plus size={13} />
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 text-muted-foreground hover:text-destructive"
                  disabled={disabled}
                  onClick={() => removeGroup(g.name)}
                  aria-label={`Remove ${g.name} group`}
                >
                  <Trash2 size={13} />
                </Button>
              </div>
            </div>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {g.values.map((v) => (
                <span
                  key={v}
                  className="inline-flex items-center gap-1 rounded-full bg-background px-2 py-0.5 text-xs shadow-sm"
                >
                  {isColorLike(g.name) && (
                    <span
                      aria-hidden
                      className="h-2.5 w-2.5 shrink-0 rounded-full border border-black/10 dark:border-white/20"
                      style={{ backgroundColor: resolveColorHex(v) }}
                    />
                  )}
                  {v}
                  <button
                    type="button"
                    disabled={disabled}
                    onClick={() => removeValue(g.name, v)}
                    className="text-muted-foreground transition-colors hover:text-destructive"
                    aria-label={`Remove ${v}`}
                  >
                    <X size={10} />
                  </button>
                </span>
              ))}
              {g.values.length === 0 && (
                <span className="text-[11px] text-muted-foreground">No values yet…</span>
              )}
            </div>
          </div>
        ))}

        <div className="flex gap-2">
          <Input
            value={newGroup}
            disabled={disabled}
            onChange={(e) => setNewGroup(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault()
                addGroup()
              }
            }}
            placeholder="New group name (e.g. Size, Color, Storage)"
            className="h-9"
            aria-label="New option group name"
          />
          <Button type="button" variant="outline" disabled={disabled || !newGroup.trim()} onClick={addGroup}>
            <Plus size={14} className="mr-1" /> Group
          </Button>
        </div>
      </div>

      {/* generated rows */}
      {combos.length > 0 && (
        <div className="overflow-hidden rounded-xl border">
          <div className="grid grid-cols-[1fr_72px_80px_100px_32px] items-center gap-2 bg-muted/60 px-3 py-2 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
            <span>Variant</span>
            <span>Stock</span>
            <span>± Price</span>
            <span>SKU</span>
            <span />
          </div>
          <div className="max-h-64 divide-y overflow-y-auto scrollbar-thin">
            {combos.map((options) => {
              const key = variantKey(options)
              const row = variants.find((v) => variantKey(v.options) === key)
              return (
                <div
                  key={key}
                  className="grid grid-cols-[1fr_72px_80px_100px_32px] items-center gap-2 px-3 py-2"
                >
                  <span className="flex min-w-0 items-center gap-1.5 text-xs font-medium">
                    <Layers size={12} className="shrink-0 text-primary/70" />
                    <span className="truncate">{Object.values(options).join(' / ')}</span>
                  </span>
                  <Input
                    type="number"
                    min={0}
                    value={row?.stock ?? 5}
                    disabled={disabled}
                    onChange={(e) =>
                      updateRow(key, { stock: Math.max(0, parseInt(e.target.value || '0', 10)) })
                    }
                    className="h-8 px-2 text-xs"
                    aria-label="Stock"
                  />
                  <Input
                    type="number"
                    step={0.01}
                    value={row?.priceDelta ?? 0}
                    disabled={disabled}
                    onChange={(e) =>
                      updateRow(key, { priceDelta: parseFloat(e.target.value || '0') || 0 })
                    }
                    className="h-8 px-2 text-xs"
                    aria-label="Price delta"
                  />
                  <Input
                    value={row?.sku ?? ''}
                    disabled={disabled}
                    onChange={(e) => updateRow(key, { sku: e.target.value })}
                    placeholder="—"
                    className="h-8 px-2 text-xs"
                    aria-label="Variant SKU"
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 text-muted-foreground hover:text-destructive"
                    disabled={disabled}
                    onClick={() => removeRow(options)}
                    aria-label="Remove variant"
                  >
                    <X size={13} />
                  </Button>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {combos.length === 0 && (
        <div className="rounded-xl border border-dashed p-4 text-center">
          <p className="text-xs text-muted-foreground">
            No variants — buyers order the product as a single option. Add option groups above or
            a single variant below.
          </p>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="mt-2"
            disabled={disabled}
            onClick={addSingleVariant}
          >
            <Plus size={13} className="mr-1" /> Add single variant
          </Button>
        </div>
      )}

      {combos.length > 0 && (
        <div className="flex items-center justify-between text-[11px] text-muted-foreground">
          <span>
            {combos.length} variant{combos.length === 1 ? '' : 's'} · total stock{' '}
            {combos.reduce((s, o) => s + (variants.find((v) => variantKey(v.options) === variantKey(o))?.stock ?? 0), 0)}
          </span>
          <button
            type="button"
            className="text-destructive transition-colors hover:underline"
            onClick={() => {
              onGroupsChange([])
              onChange([])
            }}
            disabled={disabled}
          >
            Remove all
          </button>
        </div>
      )}
    </div>
  )
}
