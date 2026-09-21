'use client'

// Admin platform settings — the customization cockpit.
// ─────────────────────────────────────────────────────────────────────────────
// Tabbed settings (General · Theme · Layout · Slider) + slide management, all
// persisted to PlatformSetting via /api/admin/settings. Saving pushes the new
// document straight into the global store, so the storefront (header, footer,
// hero slider, containers, accent) updates LIVE without a reload.

import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  Check,
  Columns3,
  Loader2,
  Monitor,
  Moon,
  MoveHorizontal,
  MoveVertical,
  Palette,
  PanelLeft,
  RotateCcw,
  Ruler,
  Save,
  Settings2,
  Sparkles,
  Sun,
  Image as ImageIcon,
} from 'lucide-react'
import { useMarketplace } from '@/store/marketplace'
import { toast } from '@/hooks/use-toast'
import { useApi } from '@/hooks/use-api'
import type { StorefrontSettings, BannerSlideDTO } from '@/lib/settings/schema'
import { resolveImageVariant } from '@/lib/storage/url'
import type { CategoryDTO } from '@/lib/types'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { Slider } from '@/components/ui/slider'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'
import { SlideEditor } from './slide-editor'
import { cn } from '@/lib/utils'

type SubTab = 'general' | 'theme' | 'layout' | 'slider' | 'slides'

const SUB_TABS: { id: SubTab; label: string; icon: typeof Settings2; hint: string }[] = [
  { id: 'general', label: 'General', icon: Settings2, hint: 'Branding & announcement bar' },
  { id: 'theme', label: 'Theme', icon: Palette, hint: 'Default mode, accent & radius' },
  { id: 'layout', label: 'Layout', icon: PanelLeft, hint: 'Content width & grid density' },
  { id: 'slider', label: 'Hero slider', icon: ImageIcon, hint: 'Orientation & playback' },
  { id: 'slides', label: 'Slides', icon: Columns3, hint: 'Banner content & ordering' },
]

export function AdminSettings() {
  const applySettings = useMarketplace((s) => s.applySettings)
  const [draft, setDraft] = useState<StorefrontSettings | null>(null)
  const [saved, setSaved] = useState<StorefrontSettings | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [subTab, setSubTab] = useState<SubTab>('general')
  const [slides, setSlides] = useState<BannerSlideDTO[] | null>(null)
  const [slidesLoading, setSlidesLoading] = useState(false)
  const [editorOpen, setEditorOpen] = useState<{ open: boolean; slide: BannerSlideDTO | null }>({ open: false, slide: null })

  const { data: catData } = useApi<{ categories: CategoryDTO[] }>('/api/categories')
  const categories = catData?.categories ?? []

  // ── load ──
  useEffect(() => {
    let cancelled = false
    const load = async () => {
      try {
        const [settingsRes, slidesRes] = await Promise.all([fetch('/api/admin/settings'), fetch('/api/admin/slides')])
        if (!settingsRes.ok || !slidesRes.ok) throw new Error('load failed')
        const settingsJson = (await settingsRes.json()) as { settings: StorefrontSettings }
        const slidesJson = (await slidesRes.json()) as { slides: BannerSlideDTO[] }
        if (cancelled) return
        setDraft(structuredClone(settingsJson.settings))
        setSaved(structuredClone(settingsJson.settings))
        setSlides(slidesJson.slides)
      } catch {
        if (!cancelled) toast({ title: 'Could not load settings', description: 'Please try refreshing the page.', variant: 'destructive' })
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    void load()
    return () => { cancelled = true }
  }, [])

  const refreshSlides = useCallback(async () => {
    setSlidesLoading(true)
    try {
      const res = await fetch('/api/admin/slides')
      if (res.ok) {
        const json = (await res.json()) as { slides: BannerSlideDTO[] }
        setSlides(json.slides)
      }
    } finally {
      setSlidesLoading(false)
    }
  }, [])

  // ── draft helpers ──
  const update = useCallback(
    <K extends keyof StorefrontSettings, F extends keyof StorefrontSettings[K]>(
      section: K,
      field: F,
      value: StorefrontSettings[K][F]
    ) => {
      setDraft((prev) => {
        if (!prev) return prev
        return { ...prev, [section]: { ...prev[section], [field]: value } }
      })
    },
    []
  )

  const dirty = useMemo(
    () => !!draft && !!saved && JSON.stringify(draft) !== JSON.stringify(saved),
    [draft, saved]
  )

  const save = async () => {
    if (!draft) return
    setSaving(true)
    try {
      const res = await fetch('/api/admin/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(draft),
      })
      const json = (await res.json()) as { settings?: StorefrontSettings; error?: string }
      if (!res.ok || !json.settings) throw new Error(json.error ?? 'Save failed')
      setDraft(structuredClone(json.settings))
      setSaved(structuredClone(json.settings))
      applySettings({ settings: json.settings })
      toast({ title: 'Settings saved', description: 'The storefront has been updated live.' })
    } catch (err) {
      toast({ title: 'Save failed', description: err instanceof Error ? err.message : 'Please try again.', variant: 'destructive' })
    } finally {
      setSaving(false)
    }
  }

  if (loading || !draft) {
    return (
      <div className="flex items-center justify-center py-24 text-muted-foreground">
        <Loader2 className="mr-2 h-5 w-5 animate-spin" /> Loading platform settings…
      </div>
    )
  }

  return (
    <div className="relative">
      {/* sub-tab bar */}
      <div className="scrollbar-thin -mx-1 mb-6 flex gap-1.5 overflow-x-auto px-1 pb-1">
        {SUB_TABS.map((t) => (
          <button
            key={t.id}
            onClick={() => setSubTab(t.id)}
            aria-current={subTab === t.id}
            className={cn(
              'flex shrink-0 items-center gap-2 rounded-xl border px-3.5 py-2 text-sm font-medium transition-all',
              subTab === t.id
                ? 'border-primary/40 bg-primary/10 text-primary shadow-sm'
                : 'bg-card text-muted-foreground hover:border-primary/25 hover:text-foreground'
            )}
          >
            <t.icon size={15} />
            {t.label}
          </button>
        ))}
      </div>

      {/* ── General ── */}
      {subTab === 'general' && (
        <div className="grid gap-5 lg:grid-cols-2">
          <FieldCard title="Store identity" desc="Shown in the header, footer and browser chrome.">
            <div className="space-y-4">
              <div>
                <Label htmlFor="siteName">Site name</Label>
                <Input
                  id="siteName"
                  value={draft.general.siteName}
                  onChange={(e) => update('general', 'siteName', e.target.value)}
                  className="mt-1.5"
                  maxLength={60}
                />
              </div>
              <div>
                <Label htmlFor="tagline">Tagline</Label>
                <Textarea
                  id="tagline"
                  value={draft.general.tagline}
                  onChange={(e) => update('general', 'tagline', e.target.value)}
                  className="mt-1.5 min-h-16"
                  maxLength={120}
                />
                <p className="mt-1 text-xs text-muted-foreground">{draft.general.tagline.length}/120 characters</p>
              </div>
            </div>
          </FieldCard>

          <FieldCard title="Announcement bar" desc="The slim promo strip at the very top of every page.">
            <div className="space-y-4">
              <div className="flex items-center justify-between rounded-xl border bg-card px-3.5 py-3">
                <div>
                  <p className="text-sm font-medium">Show announcement bar</p>
                  <p className="text-xs text-muted-foreground">Hidden entirely when off</p>
                </div>
                <Switch
                  checked={draft.general.announcementEnabled}
                  onCheckedChange={(v) => update('general', 'announcementEnabled', v)}
                  aria-label="Toggle announcement bar"
                />
              </div>
              <div>
                <Label htmlFor="announcement">Announcement text</Label>
                <Textarea
                  id="announcement"
                  value={draft.general.announcementText}
                  onChange={(e) => update('general', 'announcementText', e.target.value)}
                  className="mt-1.5 min-h-16"
                  maxLength={200}
                />
                <p className="mt-1 text-xs text-muted-foreground">{draft.general.announcementText.length}/200 characters</p>
              </div>
            </div>
          </FieldCard>

          <FieldCard
            title="Quick-pick sample images"
            desc="Image URLs offered to sellers as one-click picks in the product form. One URL per line."
            className="lg:col-span-2"
          >
            <Textarea
              value={draft.general.sampleImages.join('\n')}
              onChange={(e) =>
                update(
                  'general',
                  'sampleImages',
                  e.target.value.split('\n').map((l) => l.trim()).filter(Boolean).slice(0, 24)
                )
              }
              className="scrollbar-thin min-h-36 font-mono text-xs"
              placeholder="https://…"
            />
            <p className="mt-1.5 text-xs text-muted-foreground">
              {draft.general.sampleImages.length} images · max 24
            </p>
          </FieldCard>
        </div>
      )}

      {/* ── Theme ── */}
      {subTab === 'theme' && (
        <div className="grid gap-5 lg:grid-cols-2">
          <FieldCard title="Default color mode" desc="What first-time visitors see before picking their own.">
            <RadioRow
              name="defaultTheme"
              value={draft.theme.defaultTheme}
              onChange={(v) => update('theme', 'defaultTheme', v as StorefrontSettings['theme']['defaultTheme'])}
              options={[
                { value: 'light', label: 'Light', icon: Sun },
                { value: 'dark', label: 'Dark', icon: Moon },
                { value: 'system', label: 'System', icon: Monitor },
              ]}
            />
          </FieldCard>

          <FieldCard title="Accent color" desc="Buttons, links, highlights and charts across the storefront.">
            <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
              {(
                [
                  { value: 'orange', label: 'Sunset', swatch: 'bg-orange-500' },
                  { value: 'emerald', label: 'Emerald', swatch: 'bg-emerald-600' },
                  { value: 'rose', label: 'Rose', swatch: 'bg-rose-500' },
                  { value: 'amber', label: 'Amber', swatch: 'bg-amber-500' },
                ] as const
              ).map((o) => (
                <button
                  key={o.value}
                  onClick={() => update('theme', 'accent', o.value)}
                  aria-pressed={draft.theme.accent === o.value}
                  className={cn(
                    'flex flex-col items-center gap-2 rounded-xl border bg-card px-3 py-3.5 transition-all hover:border-primary/40',
                    draft.theme.accent === o.value && 'border-primary bg-primary/5 ring-1 ring-primary/30'
                  )}
                >
                  <span className={cn('flex h-9 w-9 items-center justify-center rounded-full text-white shadow-inner', o.swatch)}>
                    {draft.theme.accent === o.value && <Check size={16} className="drop-shadow" strokeWidth={3} />}
                  </span>
                  <span className="text-xs font-medium">{o.label}</span>
                </button>
              ))}
            </div>
          </FieldCard>

          <FieldCard title="Corner radius" desc="Global roundness of cards, buttons and inputs." className="lg:col-span-2">
            <RadioRow
              name="radius"
              value={draft.theme.radius}
              onChange={(v) => update('theme', 'radius', v as StorefrontSettings['theme']['radius'])}
              options={[
                { value: 'sharp', label: 'Sharp', hint: '0–2px', icon: Ruler },
                { value: 'compact', label: 'Compact', hint: '6px', icon: Ruler },
                { value: 'cozy', label: 'Cozy', hint: '10px', icon: Ruler },
                { value: 'roomy', label: 'Roomy', hint: '14px', icon: Ruler },
              ]}
            />
          </FieldCard>
        </div>
      )}

      {/* ── Layout ── */}
      {subTab === 'layout' && (
        <div className="grid gap-5 lg:grid-cols-2">
          <FieldCard title="Content width" desc="How much of the screen product pages and listings use.">
            <RadioRow
              name="container"
              value={draft.layout.container}
              onChange={(v) => update('layout', 'container', v as StorefrontSettings['layout']['container'])}
              options={[
                { value: 'standard', label: 'Standard', hint: '1280px' },
                { value: 'wide', label: 'Wide', hint: '1536px' },
                { value: 'full', label: 'Full width', hint: 'edge-to-edge' },
              ]}
            />
          </FieldCard>

          <FieldCard title="Product grid density" desc="Products per row on desktop grids.">
            <RadioRow
              name="productColumns"
              value={draft.layout.productColumns}
              onChange={(v) => update('layout', 'productColumns', v as StorefrontSettings['layout']['productColumns'])}
              options={[
                { value: '4', label: '4 columns', hint: 'comfortable' },
                { value: '5', label: '5 columns', hint: 'balanced' },
                { value: '6', label: '6 columns', hint: 'dense' },
              ]}
            />
          </FieldCard>
        </div>
      )}

      {/* ── Slider behavior ── */}
      {subTab === 'slider' && (
        <div className="grid gap-5 lg:grid-cols-2">
          <FieldCard title="Orientation" desc="Travel direction of the hero banner — the headline switch.">
            <div className="grid grid-cols-2 gap-2.5">
              {(
                [
                  { value: 'horizontal', label: 'Horizontal', icon: MoveHorizontal, desc: 'Slides move left ↔ right' },
                  { value: 'vertical', label: 'Vertical', icon: MoveVertical, desc: 'Slides move up ↕ down' },
                ] as const
              ).map((o) => (
                <button
                  key={o.value}
                  onClick={() => update('slider', 'orientation', o.value)}
                  aria-pressed={draft.slider.orientation === o.value}
                  className={cn(
                    'flex flex-col items-center gap-1.5 rounded-xl border bg-card px-4 py-4 transition-all hover:border-primary/40',
                    draft.slider.orientation === o.value && 'border-primary bg-primary/5 ring-1 ring-primary/30'
                  )}
                >
                  <o.icon size={20} className={draft.slider.orientation === o.value ? 'text-primary' : 'text-muted-foreground'} />
                  <span className="text-sm font-semibold">{o.label}</span>
                  <span className="text-center text-xs text-muted-foreground">{o.desc}</span>
                </button>
              ))}
            </div>
          </FieldCard>

          <FieldCard title="Banner height" desc="Vertical footprint of the hero.">
            <RadioRow
              name="height"
              value={draft.slider.height}
              onChange={(v) => update('slider', 'height', v as StorefrontSettings['slider']['height'])}
              options={[
                { value: 'short', label: 'Short', hint: '~352px' },
                { value: 'medium', label: 'Medium', hint: '~432px' },
                { value: 'tall', label: 'Tall', hint: '~544px' },
              ]}
            />
          </FieldCard>

          <FieldCard title="Playback" desc="Autoplay cadence and controls." className="lg:col-span-2">
            <div className="space-y-4">
              <ToggleRow
                label="Enable hero slider"
                desc="Turn off to remove the banner entirely"
                checked={draft.slider.enabled}
                onChange={(v) => update('slider', 'enabled', v)}
              />
              <Separator />
              <ToggleRow
                label="Autoplay"
                desc="Advance slides automatically; pauses on hover"
                checked={draft.slider.autoplay}
                onChange={(v) => update('slider', 'autoplay', v)}
                disabled={!draft.slider.enabled}
              />
              <div className={cn('transition-opacity', !draft.slider.autoplay && 'pointer-events-none opacity-40')}>
                <div className="mb-2.5 flex items-baseline justify-between">
                  <Label>Interval</Label>
                  <span className="text-sm font-bold tabular-nums text-primary">{draft.slider.intervalSec}s</span>
                </div>
                <Slider
                  value={[draft.slider.intervalSec]}
                  min={3}
                  max={20}
                  step={1}
                  onValueChange={([v]) => update('slider', 'intervalSec', v)}
                  aria-label="Autoplay interval in seconds"
                />
                <div className="mt-1 flex justify-between text-[11px] text-muted-foreground">
                  <span>3s</span>
                  <span>20s</span>
                </div>
              </div>
              <Separator />
              <div className="grid gap-3 sm:grid-cols-2">
                <ToggleRow
                  label="Arrow buttons"
                  desc="Manual prev/next controls"
                  checked={draft.slider.showArrows}
                  onChange={(v) => update('slider', 'showArrows', v)}
                  disabled={!draft.slider.enabled}
                />
                <ToggleRow
                  label="Dot indicators"
                  desc="Position pills for direct jumps"
                  checked={draft.slider.showDots}
                  onChange={(v) => update('slider', 'showDots', v)}
                  disabled={!draft.slider.enabled}
                />
              </div>
            </div>
          </FieldCard>
        </div>
      )}

      {/* ── Slides management ── */}
      {subTab === 'slides' && (
        <SlidesPanel
          slides={slides}
          loading={slidesLoading}
          onRefresh={refreshSlides}
          onEdit={(slide) => setEditorOpen({ open: true, slide })}
          onNew={() => setEditorOpen({ open: true, slide: null })}
        />
      )}

      {/* editor dialog (add / edit slide) */}
      <SlideEditor
        key={editorOpen.slide?.id ?? 'new'}
        open={editorOpen.open}
        slide={editorOpen.slide}
        categories={categories}
        onClose={() => setEditorOpen({ open: false, slide: null })}
        onSaved={refreshSlides}
      />

      {/* sticky save bar */}
      {dirty && (
        <div className="sticky bottom-4 z-30 mt-6 flex items-center justify-between gap-3 rounded-2xl border bg-card/95 p-3.5 pl-5 shadow-xl backdrop-blur">
          <p className="flex items-center gap-2 text-sm font-medium">
            <Sparkles size={15} className="text-primary" />
            Unsaved changes
          </p>
          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setDraft(structuredClone(saved))}
              disabled={saving}
            >
              <RotateCcw size={14} className="mr-1.5" /> Discard
            </Button>
            <Button size="sm" onClick={save} disabled={saving} className="rounded-xl px-5">
              {saving ? <Loader2 size={14} className="mr-1.5 animate-spin" /> : <Save size={14} className="mr-1.5" />}
              Save changes
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}

// ── shared bits ─────────────────────────────────────────────────────────────

function FieldCard({
  title,
  desc,
  className,
  children,
}: {
  title: string
  desc: string
  className?: string
  children: React.ReactNode
}) {
  return (
    <section className={cn('rounded-2xl border bg-card/60 p-5', className)}>
      <h3 className="text-sm font-bold">{title}</h3>
      <p className="mt-0.5 text-xs text-muted-foreground">{desc}</p>
      <div className="mt-4">{children}</div>
    </section>
  )
}

function ToggleRow({
  label,
  desc,
  checked,
  onChange,
  disabled,
}: {
  label: string
  desc: string
  checked: boolean
  onChange: (v: boolean) => void
  disabled?: boolean
}) {
  return (
    <div className={cn('flex items-center justify-between gap-4 rounded-xl border bg-card px-3.5 py-3', disabled && 'opacity-50')}>
      <div>
        <p className="text-sm font-medium">{label}</p>
        <p className="text-xs text-muted-foreground">{desc}</p>
      </div>
      <Switch checked={checked} onCheckedChange={onChange} disabled={disabled} aria-label={label} />
    </div>
  )
}

function RadioRow({
  name,
  value,
  onChange,
  options,
}: {
  name: string
  value: string
  onChange: (v: string) => void
  options: { value: string; label: string; hint?: string; icon?: typeof Sun }[]
}) {
  return (
    <div role="radiogroup" aria-label={name} className="grid grid-cols-3 gap-2.5 sm:grid-cols-3">
      {options.map((o) => (
        <button
          key={o.value}
          role="radio"
          aria-checked={value === o.value}
          onClick={() => onChange(o.value)}
          className={cn(
            'flex flex-col items-center gap-1 rounded-xl border bg-card px-2 py-3 transition-all hover:border-primary/40',
            value === o.value && 'border-primary bg-primary/5 ring-1 ring-primary/30'
          )}
        >
          {o.icon && <o.icon size={17} className={value === o.value ? 'text-primary' : 'text-muted-foreground'} />}
          <span className={cn('text-xs font-semibold sm:text-sm', value === o.value && 'text-primary')}>{o.label}</span>
          {o.hint && <span className="text-[10px] text-muted-foreground">{o.hint}</span>}
        </button>
      ))}
    </div>
  )
}

// ── slides panel (list + reorder + activate) ────────────────────────────────

function SlidesPanel({
  slides,
  loading,
  onRefresh,
  onEdit,
  onNew,
}: {
  slides: BannerSlideDTO[] | null
  loading: boolean
  onRefresh: () => void
  onEdit: (slide: BannerSlideDTO) => void
  onNew: () => void
}) {
  const [busyId, setBusyId] = useState<string | null>(null)

  const mutate = async (id: string, body: Record<string, unknown>) => {
    setBusyId(id)
    try {
      const res = await fetch(`/api/admin/slides/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      if (!res.ok) {
        const json = (await res.json()) as { error?: string }
        throw new Error(json.error ?? 'Update failed')
      }
      await onRefresh()
    } catch (err) {
      toast({ title: 'Slide update failed', description: err instanceof Error ? err.message : undefined, variant: 'destructive' })
    } finally {
      setBusyId(null)
    }
  }

  const remove = async (slide: BannerSlideDTO) => {
    if (!window.confirm(`Delete slide “${slide.title ?? 'Untitled'}”? This cannot be undone.`)) return
    setBusyId(slide.id)
    try {
      const res = await fetch(`/api/admin/slides/${slide.id}`, { method: 'DELETE' })
      if (!res.ok) throw new Error('Delete failed')
      await onRefresh()
      toast({ title: 'Slide deleted' })
    } catch (err) {
      toast({ title: 'Delete failed', description: err instanceof Error ? err.message : undefined, variant: 'destructive' })
    } finally {
      setBusyId(null)
    }
  }

  return (
    <div>
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="text-sm font-bold">Banner slides</h3>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Content of the hero slider — reorder, deactivate or edit. Inactive slides stay stored but hidden from shoppers.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" className="rounded-xl" onClick={onRefresh} disabled={loading}>
            <Loader2 size={13} className={cn('mr-1.5', loading ? 'animate-spin' : 'hidden')} />
            Refresh
          </Button>
          <Button size="sm" className="rounded-xl" onClick={onNew}>
            + Add slide
          </Button>
        </div>
      </div>

      {slides === null ? (
        <div className="space-y-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="h-28 animate-pulse rounded-2xl bg-muted" />
          ))}
        </div>
      ) : slides.length === 0 ? (
        <div className="rounded-2xl border border-dashed py-16 text-center">
          <ImageIcon size={32} className="mx-auto text-muted-foreground/40" />
          <p className="mt-3 text-sm font-medium">No slides yet</p>
          <p className="mt-1 text-xs text-muted-foreground">Add your first banner to light up the homepage hero.</p>
          <Button size="sm" className="mt-4 rounded-xl" onClick={onNew}>+ Add slide</Button>
        </div>
      ) : (
        <ol className="space-y-3">
          {slides.map((s, i) => (
            <li
              key={s.id}
              className={cn(
                'flex flex-col gap-4 rounded-2xl border bg-card p-4 transition-opacity sm:flex-row sm:items-center',
                !s.active && 'opacity-60',
                busyId === s.id && 'animate-pulse'
              )}
            >
              {/* preview */}
              <div className="relative h-20 w-full shrink-0 overflow-hidden rounded-xl border bg-muted sm:h-14 sm:w-24">
                <img
                  src={resolveImageVariant(s.image, 'thumb') || s.image}
                  alt=""
                  className="h-full w-full object-cover"
                  onError={(e) => { (e.target as HTMLImageElement).style.visibility = 'hidden' }}
                />
                <Badge className="absolute left-1 top-1 h-4 rounded-md bg-black/60 px-1.5 text-[9px] font-bold text-white hover:bg-black/60">
                  {i + 1}
                </Badge>
              </div>

              {/* text */}
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold">{s.title ?? <span className="text-muted-foreground">Untitled</span>}</p>
                <p className="truncate text-xs text-muted-foreground">
                  {s.eyebrow && <>{s.eyebrow} · </>}
                  {s.subtitle ?? 'No subtitle'}
                </p>
                <p className="mt-0.5 truncate font-mono text-[10px] text-muted-foreground/70">{s.image}</p>
              </div>

              {/* actions */}
              <div className="flex shrink-0 flex-wrap items-center gap-1.5">
                <Switch
                  checked={s.active}
                  onCheckedChange={(v) => mutate(s.id, { active: v })}
                  disabled={busyId === s.id}
                  aria-label={s.active ? 'Deactivate slide' : 'Activate slide'}
                />
                <Button variant="ghost" size="icon" className="h-8 w-8" aria-label="Move slide up" disabled={i === 0 || busyId === s.id} onClick={() => mutate(s.id, { move: 'up' })}>
                  ↑
                </Button>
                <Button variant="ghost" size="icon" className="h-8 w-8" aria-label="Move slide down" disabled={i === slides.length - 1 || busyId === s.id} onClick={() => mutate(s.id, { move: 'down' })}>
                  ↓
                </Button>
                <Button variant="outline" size="sm" className="h-8 rounded-lg px-2.5 text-xs" onClick={() => onEdit(s)} disabled={busyId === s.id}>
                  Edit
                </Button>
                <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive hover:text-destructive" aria-label="Delete slide" disabled={busyId === s.id} onClick={() => remove(s)}>
                  ×
                </Button>
              </div>
            </li>
          ))}
        </ol>
      )}
    </div>
  )
}
