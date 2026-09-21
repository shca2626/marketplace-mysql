'use client'

// Slide add/edit dialog (admin settings → Slides).
// Image can be pasted as a URL or uploaded straight through the media
// pipeline (webp renditions + dedupe) — the returned medium URL is stored.

import { useEffect, useRef, useState } from 'react'
import { ImagePlus, Loader2, UploadCloud } from 'lucide-react'
import { toast } from '@/hooks/use-toast'
import type { BannerSlideDTO } from '@/lib/settings/schema'
import type { CategoryDTO, MediaAssetDTO } from '@/lib/types'
import { resolveImageVariant } from '@/lib/storage/url'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { Textarea } from '@/components/ui/textarea'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'

const CTA_VIEWS = [
  { value: 'catalog', label: 'Catalog (all products)' },
  { value: 'seller', label: 'Seller onboarding' },
  { value: 'home', label: 'Home page' },
  { value: 'favorites', label: 'Favorites' },
  { value: 'orders', label: 'My orders' },
  { value: 'account', label: 'Account settings' },
] as const

interface Draft {
  eyebrow: string
  title: string
  subtitle: string
  image: string
  ctaLabel: string
  ctaView: string
  ctaCategory: string
  active: boolean
}

const EMPTY: Draft = {
  eyebrow: '',
  title: '',
  subtitle: '',
  image: '',
  ctaLabel: '',
  ctaView: 'catalog',
  ctaCategory: 'all',
  active: true,
}

export function SlideEditor({
  open,
  slide,
  categories,
  onClose,
  onSaved,
}: {
  open: boolean
  slide: BannerSlideDTO | null
  categories: CategoryDTO[]
  onClose: () => void
  onSaved: () => void
}) {
  const [draft, setDraft] = useState<Draft>(EMPTY)
  const [saving, setSaving] = useState(false)
  const [uploading, setUploading] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (open) {
      setDraft(
        slide
          ? {
              eyebrow: slide.eyebrow ?? '',
              title: slide.title ?? '',
              subtitle: slide.subtitle ?? '',
              image: slide.image,
              ctaLabel: slide.ctaLabel ?? '',
              ctaView: slide.ctaView ?? 'catalog',
              ctaCategory: slide.ctaCategory ?? 'all',
              active: slide.active,
            }
          : EMPTY
      )
    }
  }, [open, slide])

  const set = <K extends keyof Draft>(k: K, v: Draft[K]) => setDraft((d) => ({ ...d, [k]: v }))

  const upload = async (file: File) => {
    setUploading(true)
    try {
      const form = new FormData()
      form.append('file', file)
      const res = await fetch('/api/uploads', { method: 'POST', body: form })
      const json = (await res.json()) as { assets?: MediaAssetDTO[]; error?: string }
      if (!res.ok || !json.assets?.length) throw new Error(json.error ?? 'Upload failed')
      set('image', json.assets[0].urls.medium)
      toast({ title: 'Image uploaded', description: 'Renditions generated automatically.' })
    } catch (err) {
      toast({ title: 'Upload failed', description: err instanceof Error ? err.message : undefined, variant: 'destructive' })
    } finally {
      setUploading(false)
    }
  }

  const save = async () => {
    if (!draft.image.trim()) {
      toast({ title: 'Image required', description: 'Upload a banner image or paste a URL.', variant: 'destructive' })
      return
    }
    if (!draft.title.trim() && !draft.subtitle.trim()) {
      toast({ title: 'Add some text', description: 'At least a title or subtitle is needed.', variant: 'destructive' })
      return
    }
    setSaving(true)
    try {
      const body = {
        eyebrow: draft.eyebrow.trim() || null,
        title: draft.title.trim() || null,
        subtitle: draft.subtitle.trim() || null,
        image: draft.image.trim(),
        ctaLabel: draft.ctaLabel.trim() || null,
        ctaView: draft.ctaLabel.trim() ? draft.ctaView : null,
        ctaCategory: draft.ctaView === 'catalog' && draft.ctaCategory !== 'all' ? draft.ctaCategory : null,
        active: draft.active,
      }
      const res = await fetch(slide ? `/api/admin/slides/${slide.id}` : '/api/admin/slides', {
        method: slide ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      const json = (await res.json()) as { error?: string }
      if (!res.ok) throw new Error(json.error ?? 'Save failed')
      toast({ title: slide ? 'Slide updated' : 'Slide created' })
      onSaved()
      onClose()
    } catch (err) {
      toast({ title: 'Save failed', description: err instanceof Error ? err.message : undefined, variant: 'destructive' })
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="scrollbar-thin max-h-[88vh] max-w-lg overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{slide ? 'Edit slide' : 'Add slide'}</DialogTitle>
          <DialogDescription>
            Banner content shown in the hero slider. Keep titles short — they overlay the image.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* image */}
          <div>
            <Label>Image</Label>
            <div className="mt-1.5 flex items-start gap-3">
              <div className="relative h-20 w-32 shrink-0 overflow-hidden rounded-xl border bg-muted">
                {draft.image ? (
                  <img
                    src={resolveImageVariant(draft.image, 'medium') || draft.image}
                    alt="Slide preview"
                    className="h-full w-full object-cover"
                    onError={(e) => { (e.target as HTMLImageElement).style.visibility = 'hidden' }}
                  />
                ) : (
                  <div className="flex h-full items-center justify-center text-muted-foreground/50">
                    <ImagePlus size={20} />
                  </div>
                )}
                {uploading && (
                  <div className="absolute inset-0 flex items-center justify-center bg-black/50">
                    <Loader2 size={16} className="animate-spin text-white" />
                  </div>
                )}
              </div>
              <div className="min-w-0 flex-1 space-y-2">
                <Input
                  value={draft.image}
                  onChange={(e) => set('image', e.target.value)}
                  placeholder="https://… or /api/media/…"
                  className="text-xs"
                />
                <input
                  ref={fileRef}
                  type="file"
                  accept="image/jpeg,image/png,image/webp,image/gif"
                  className="hidden"
                  onChange={(e) => {
                    const f = e.target.files?.[0]
                    if (f) void upload(f)
                    e.target.value = ''
                  }}
                />
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="w-full rounded-lg text-xs"
                  onClick={() => fileRef.current?.click()}
                  disabled={uploading}
                >
                  <UploadCloud size={13} className="mr-1.5" /> Upload image
                </Button>
              </div>
            </div>
          </div>

          {/* text */}
          <div>
            <Label htmlFor="slide-eyebrow">Kicker <span className="text-muted-foreground">(optional)</span></Label>
            <Input
              id="slide-eyebrow"
              value={draft.eyebrow}
              onChange={(e) => set('eyebrow', e.target.value)}
              placeholder="e.g. Audio & tech picks"
              className="mt-1.5"
              maxLength={120}
            />
          </div>
          <div>
            <Label htmlFor="slide-title">Title</Label>
            <Input
              id="slide-title"
              value={draft.title}
              onChange={(e) => set('title', e.target.value)}
              placeholder="Big bold headline"
              className="mt-1.5"
              maxLength={200}
            />
          </div>
          <div>
            <Label htmlFor="slide-subtitle">Subtitle</Label>
            <Textarea
              id="slide-subtitle"
              value={draft.subtitle}
              onChange={(e) => set('subtitle', e.target.value)}
              placeholder="One sentence of supporting copy"
              className="mt-1.5 min-h-16"
              maxLength={400}
            />
          </div>

          {/* CTA */}
          <div className="rounded-xl border bg-card/60 p-3.5">
            <p className="mb-3 text-xs font-bold uppercase tracking-wider text-muted-foreground">Call-to-action button</p>
            <div className="space-y-3">
              <div>
                <Label htmlFor="slide-cta">Button label <span className="text-muted-foreground">(empty = no button)</span></Label>
                <Input
                  id="slide-cta"
                  value={draft.ctaLabel}
                  onChange={(e) => set('ctaLabel', e.target.value)}
                  placeholder="e.g. Shop electronics"
                  className="mt-1.5"
                  maxLength={80}
                />
              </div>
              {draft.ctaLabel.trim() && (
                <div className="grid gap-3 sm:grid-cols-2">
                  <div>
                    <Label>Links to</Label>
                    <Select value={draft.ctaView} onValueChange={(v) => set('ctaView', v)}>
                      <SelectTrigger className="mt-1.5 w-full"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {CTA_VIEWS.map((v) => (
                          <SelectItem key={v.value} value={v.value}>{v.label}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  {draft.ctaView === 'catalog' && (
                    <div>
                      <Label>Category filter</Label>
                      <Select value={draft.ctaCategory} onValueChange={(v) => set('ctaCategory', v)}>
                        <SelectTrigger className="mt-1.5 w-full"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="all">All categories</SelectItem>
                          {categories.map((c) => (
                            <SelectItem key={c.id} value={c.slug}>{c.name}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>

          {/* active */}
          <div className="flex items-center justify-between rounded-xl border bg-card/60 px-3.5 py-3">
            <div>
              <p className="text-sm font-medium">Active</p>
              <p className="text-xs text-muted-foreground">Inactive slides stay stored but hidden</p>
            </div>
            <Switch checked={draft.active} onCheckedChange={(v) => set('active', v)} aria-label="Slide active" />
          </div>
        </div>

        <DialogFooter className="mt-2">
          <Button variant="ghost" onClick={onClose} disabled={saving}>Cancel</Button>
          <Button onClick={save} disabled={saving || uploading}>
            {saving && <Loader2 size={14} className="mr-1.5 animate-spin" />}
            {slide ? 'Save slide' : 'Create slide'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
