'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import {
  AlertCircle,
  Check,
  HardDrive,
  Images,
  Link,
  Loader2,
  Sparkles,
  Star,
  Trash2,
  UploadCloud,
  X,
} from 'lucide-react'
import { toast } from '@/hooks/use-toast'
import { useMarketplace } from '@/store/marketplace'
import { resolveImageVariant } from '@/lib/storage/url'
import type { MediaAssetDTO } from '@/lib/types'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { cn } from '@/lib/utils'

// Media tab (day-1 storage core UX).
// ────────────────────────────────
// Four ways to add product imagery, one shared outcome (urls in form.images):
//   1. Upload — drag & drop / click to browse / paste from clipboard.
//      Files go to POST /api/uploads → sharp webp renditions (400/800/1200/2000w)
//      → the medium URL is stored, storefront picks smaller/larger variants.
//   2. My library — reuse anything previously uploaded (MediaAsset, sha256-deduped).
//   3. Paste an external URL (seeds / CDN images).
//   4. Sample quick-picks (demo sellers without files at hand).
// First image in the grid is the cover shown on product cards.

const MAX_IMAGES = 6
const MAX_BYTES = 8 * 1024 * 1024
const ACCEPT = 'image/jpeg,image/png,image/webp,image/gif'

interface UploadRow {
  id: string
  name: string
  size: number
  status: 'uploading' | 'done' | 'error'
  error?: string
}

function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`
  return `${(n / (1024 * 1024)).toFixed(1)} MB`
}

export function MediaTab({
  images,
  onChange,
}: {
  images: string[]
  onChange: (images: string[]) => void
}) {
  const [imageUrl, setImageUrl] = useState('')
  const [rows, setRows] = useState<UploadRow[]>([])
  const [dragOver, setDragOver] = useState(false)
  const [library, setLibrary] = useState<MediaAssetDTO[] | null>(null)
  const [libraryOpen, setLibraryOpen] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)
  const dropRef = useRef<HTMLDivElement>(null)
  // admin-managed quick-pick gallery (platform settings → General)
  const sampleImages = useMarketplace((s) => s.settings.general.sampleImages)

  const remaining = MAX_IMAGES - images.length

  const addUrl = useCallback(
    (url: string, opts: { silent?: boolean } = {}) => {
      if (!url) return false
      if (images.includes(url)) return false
      if (images.length >= MAX_IMAGES) {
        if (!opts.silent) toast({ title: `Up to ${MAX_IMAGES} images per product` })
        return false
      }
      onChange([...images, url])
      return true
    },
    [images, onChange],
  )

  // ── Upload flow ────────────────────────────────────────────────
  const uploadFile = useCallback(
    async (file: File) => {
      const id = crypto.randomUUID()
      setRows((prev) => [...prev, { id, name: file.name, size: file.size, status: 'uploading' }])
      try {
        const fd = new FormData()
        fd.append('file', file)
        const res = await fetch('/api/uploads', { method: 'POST', body: fd })
        const json = await res.json().catch(() => ({}))
        const asset: MediaAssetDTO | undefined = json.assets?.[0]
        if (!res.ok || !asset) {
          throw new Error(json.errors?.[0]?.error || json.error || 'Upload failed')
        }
        if (!addUrl(asset.url)) {
          setRows((prev) => prev.map((r) => (r.id === id ? { ...r, status: 'error', error: 'Image limit reached' } : r)))
          return
        }
        setRows((prev) => prev.map((r) => (r.id === id ? { ...r, status: 'done' } : r)))
        setTimeout(() => setRows((prev) => prev.filter((r) => r.id !== id)), 1600)
      } catch (err) {
        setRows((prev) =>
          prev.map((r) => (r.id === id ? { ...r, status: 'error', error: (err as Error).message } : r)),
        )
      }
    },
    [addUrl],
  )

  const handleFiles = useCallback(
    (files: File[]) => {
      const imgs = files.filter((f) => f.size > 0)
      if (imgs.length === 0) return
      if (remaining <= 0) {
        toast({ title: `Up to ${MAX_IMAGES} images per product`, description: 'Remove one first to add another' })
        return
      }
      if (imgs.length > remaining) {
        toast({
          title: `Only ${remaining} slot${remaining === 1 ? '' : 's'} left`,
          description: `The first ${remaining} file${remaining === 1 ? '' : 's'} will be added`,
        })
      }
      for (const f of imgs.slice(0, remaining)) {
        if (f.size > MAX_BYTES) {
          setRows((prev) => [...prev, { id: crypto.randomUUID(), name: f.name, size: f.size, status: 'error', error: 'Exceeds the 8 MB limit' }])
          continue
        }
        if (f.type && !ACCEPT.split(',').includes(f.type)) {
          setRows((prev) => [...prev, { id: crypto.randomUUID(), name: f.name, size: f.size, status: 'error', error: 'Use JPEG, PNG, WebP or GIF' }])
          continue
        }
        void uploadFile(f)
      }
    },
    [remaining, uploadFile],
  )

  // Paste images from the clipboard while the dropzone is visible.
  useEffect(() => {
    const onPaste = (e: ClipboardEvent) => {
      const files = Array.from(e.clipboardData?.files ?? [])
      if (files.length === 0) return
      // Only when the media tab is actually visible (offsetParent is null when hidden).
      if (!dropRef.current || dropRef.current.offsetParent === null) return
      e.preventDefault()
      handleFiles(files)
    }
    document.addEventListener('paste', onPaste)
    return () => document.removeEventListener('paste', onPaste)
  }, [handleFiles])

  // ── My library (previously uploaded assets) ─────────────────────
  useEffect(() => {
    let alive = true
    fetch('/api/uploads?limit=12')
      .then((r) => (r.ok ? r.json() : null))
      .then((json) => {
        if (alive && json?.assets) {
          setLibrary(json.assets)
          if (json.assets.length > 0) setLibraryOpen(true)
        }
      })
      .catch(() => {})
    return () => {
      alive = false
    }
  }, [])

  // ── URL add (external) ─────────────────────────────────────────
  const submitUrl = () => {
    const clean = imageUrl.trim()
    if (!clean) return
    if (!/^https?:\/\//.test(clean)) {
      toast({ title: 'Invalid image URL', description: 'Please paste a valid http(s) URL', variant: 'destructive' })
      return
    }
    if (addUrl(clean)) setImageUrl('')
  }

  const makeCover = (url: string) => {
    const next = [url, ...images.filter((i) => i !== url)]
    onChange(next.slice(0, MAX_IMAGES))
  }

  const isLocal = (url: string) => url.startsWith('/api/media/')

  return (
    <div className="space-y-4">
      <div className="space-y-2.5">
        <div className="flex items-center justify-between">
          <Label>
            Images <span className="text-muted-foreground">({images.length}/{MAX_IMAGES})</span>
          </Label>
          {images.length > 0 && <span className="text-[11px] text-muted-foreground">First image is the cover on cards</span>}
        </div>

        {/* Upload dropzone */}
        <div
          ref={dropRef}
          role="button"
          tabIndex={0}
          aria-label="Upload images"
          onClick={() => inputRef.current?.click()}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault()
              inputRef.current?.click()
            }
          }}
          onDragOver={(e) => {
            e.preventDefault()
            setDragOver(true)
          }}
          onDragLeave={() => setDragOver(false)}
          onDrop={(e) => {
            e.preventDefault()
            setDragOver(false)
            handleFiles(Array.from(e.dataTransfer.files))
          }}
          className={cn(
            'group flex cursor-pointer flex-col items-center justify-center gap-1.5 rounded-2xl border-2 border-dashed px-4 py-6 text-center transition-colors',
            dragOver ? 'border-primary bg-primary/10' : 'border-border hover:border-primary/50 hover:bg-primary/5',
            remaining <= 0 && 'pointer-events-none opacity-40',
          )}
        >
          <input
            ref={inputRef}
            type="file"
            accept={ACCEPT}
            multiple
            className="hidden"
            aria-hidden="true"
            tabIndex={-1}
            onChange={(e) => {
              handleFiles(Array.from(e.target.files ?? []))
              e.target.value = '' // allow re-selecting the same file
            }}
          />
          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/10 text-primary transition-transform group-hover:scale-105">
            <UploadCloud size={18} />
          </div>
          <p className="text-sm font-medium">
            {dragOver ? 'Drop to upload' : 'Drag & drop, click to browse, or paste'}
          </p>
          <p className="text-xs text-muted-foreground">JPEG · PNG · WebP · GIF — up to 8 MB each (auto-converted to WebP)</p>
        </div>

        {/* Upload queue */}
        {rows.length > 0 && (
          <div className="space-y-1.5">
            {rows.map((r) => (
              <div
                key={r.id}
                className={cn(
                  'flex items-center gap-2.5 rounded-xl border px-3 py-2 text-xs',
                  r.status === 'error' ? 'border-destructive/40 bg-destructive/5' : 'border-border bg-muted/40',
                )}
              >
                {r.status === 'uploading' && <Loader2 size={14} className="shrink-0 animate-spin text-primary" />}
                {r.status === 'done' && <Check size={14} className="shrink-0 text-primary" />}
                {r.status === 'error' && <AlertCircle size={14} className="shrink-0 text-destructive" />}
                <span className="min-w-0 flex-1 truncate font-medium">{r.name}</span>
                <span className="shrink-0 text-muted-foreground">{formatBytes(r.size)}</span>
                {r.status === 'error' && <span className="max-w-[45%] truncate text-destructive">{r.error}</span>}
                {r.status === 'error' && (
                  <button
                    type="button"
                    onClick={() => setRows((prev) => prev.filter((x) => x.id !== r.id))}
                    className="shrink-0 rounded-md p-0.5 text-muted-foreground hover:text-foreground"
                    aria-label="Dismiss"
                  >
                    <X size={12} />
                  </button>
                )}
              </div>
            ))}
          </div>
        )}

        {/* Selected images */}
        {images.length > 0 && (
          <div className="flex flex-wrap gap-2.5">
            {images.map((img, i) => (
              <div key={img} className="group relative h-24 w-24 overflow-hidden rounded-xl border bg-muted">
                <img
                  src={resolveImageVariant(img, 'thumb')}
                  alt={`Product image ${i + 1}`}
                  className="h-full w-full object-cover"
                  loading="lazy"
                />
                {i === 0 && (
                  <span className="absolute bottom-0 w-full bg-primary/90 py-0.5 text-center text-[9px] font-bold uppercase tracking-wide text-primary-foreground">
                    Cover
                  </span>
                )}
                {isLocal(img) && (
                  <span className="absolute left-1 top-1 flex items-center gap-0.5 rounded-md bg-black/55 px-1 py-0.5 text-[8px] font-semibold uppercase text-white">
                    <HardDrive size={8} /> Local
                  </span>
                )}
                <div className="absolute right-1 top-1 flex gap-1 opacity-0 transition-opacity group-hover:opacity-100">
                  {i !== 0 && (
                    <button
                      type="button"
                      onClick={() => makeCover(img)}
                      className="flex h-6 w-6 items-center justify-center rounded-full bg-black/60 text-white transition hover:bg-primary"
                      aria-label="Make cover"
                      title="Make cover"
                    >
                      <Star size={12} />
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => onChange(images.filter((x) => x !== img))}
                    className="flex h-6 w-6 items-center justify-center rounded-full bg-black/60 text-white transition hover:bg-destructive"
                    aria-label="Remove image"
                    title="Remove"
                  >
                    <Trash2 size={12} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* My library */}
        {library !== null && library.length > 0 && (
          <div className="rounded-xl border bg-muted/30">
            <button
              type="button"
              onClick={() => setLibraryOpen((v) => !v)}
              className="flex w-full items-center justify-between px-3 py-2 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground"
              aria-expanded={libraryOpen}
            >
              <span className="flex items-center gap-1.5">
                <Images size={13} /> My library ({library.length})
              </span>
              <span className={cn('transition-transform', libraryOpen && 'rotate-180')}>▾</span>
            </button>
            {libraryOpen && (
              <div className="flex flex-wrap gap-1.5 border-t px-3 py-2.5">
                {library.slice(0, 12).map((a) => {
                  const added = images.includes(a.url)
                  return (
                    <button
                      key={a.id}
                      type="button"
                      disabled={added || remaining <= 0}
                      onClick={() => addUrl(a.url)}
                      title={`${a.originalName} — ${a.width ?? '?'}×${a.height ?? '?'}`}
                      className={cn(
                        'relative h-12 w-12 overflow-hidden rounded-lg border-2 transition',
                        added
                          ? 'cursor-default border-primary/60 opacity-50'
                          : 'border-transparent hover:border-primary disabled:cursor-not-allowed disabled:opacity-40',
                      )}
                    >
                      <img src={a.urls.thumb || a.url} alt={a.originalName} className="h-full w-full object-cover" loading="lazy" />
                      {added && (
                        <span className="absolute inset-0 flex items-center justify-center bg-black/40">
                          <Check size={13} className="text-white" />
                        </span>
                      )}
                    </button>
                  )
                })}
                <span className="self-center text-[10px] text-muted-foreground">Re-use your uploads — nothing is uploaded twice</span>
              </div>
            )}
          </div>
        )}
      </div>

      {/* External URL */}
      <div className="space-y-2">
        <div className="flex gap-2">
          <Input
            value={imageUrl}
            onChange={(e) => setImageUrl(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault()
                submitUrl()
              }
            }}
            placeholder="Paste an image URL and press Enter"
            className="bg-background"
          />
          <Button type="button" variant="outline" onClick={submitUrl} aria-label="Add image from URL">
            <Link size={15} />
          </Button>
        </div>

        <div>
          <p className="mb-1.5 flex items-center gap-1 text-xs text-muted-foreground">
            <Sparkles size={12} /> Or quick-pick a sample image:
          </p>
          <div className="flex flex-wrap gap-1.5">
            {sampleImages.filter((u) => !images.includes(u))
              .slice(0, 8)
              .map((u) => (
                <button
                  key={u}
                  type="button"
                  onClick={() => addUrl(u)}
                  disabled={remaining <= 0}
                  className={cn(
                    'h-11 w-11 overflow-hidden rounded-lg border-2 border-transparent transition hover:border-primary disabled:cursor-not-allowed disabled:opacity-40',
                  )}
                  aria-label="Add sample image"
                >
                  <img src={u} alt="Sample" className="h-full w-full object-cover" />
                </button>
              ))}
          </div>
        </div>
      </div>
    </div>
  )
}
