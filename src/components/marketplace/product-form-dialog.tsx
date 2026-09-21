'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import {
  ArrowDown,
  ArrowUp,
  Check,
  Coins,
  FileText,
  Image as ImageIcon,
  ImagePlus,
  Layers,
  ListChecks,
  Loader2,
  Plus,
  Search,
  Shuffle,
  Trash2,
  Truck,
  UploadCloud,
} from 'lucide-react'
import { toast } from '@/hooks/use-toast'
import type { CategoryDTO, ProductDTO } from '@/lib/types'
import { SAMPLE_PRODUCT_IMAGES } from '@/lib/constants'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Switch } from '@/components/ui/switch'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Separator } from '@/components/ui/separator'
import { cn } from '@/lib/utils'

// ── Form state types ──────────────────────────────────────────────────────────

interface SpecRow {
  id: string
  label: string
  value: string
}

interface VariantRow {
  key: string
  name: string
  options: Record<string, string>
  price: string // '' = inherit product price
  compareAtPrice: string
  stock: string
  sku: string
  isActive: boolean
}

interface OptionDef {
  id: string
  name: string
  values: string // comma-separated, e.g. "S, M, L"
}

interface UploadItem {
  id: string
  name: string
  preview: string
  progress: number
  status: 'uploading' | 'done' | 'error'
  error?: string
}

const MAX_UPLOAD_BYTES = 6 * 1024 * 1024 // keep in sync with /api/upload

// Downscale huge photos in the browser so uploads stay small and fast.
// GIFs are passed through untouched (canvas would kill the animation).
async function shrinkImage(file: File): Promise<Blob> {
  if (file.type === 'image/gif' || file.size <= 256 * 1024) return file
  try {
    const bitmap = await createImageBitmap(file)
    const MAX_DIM = 1600
    if (bitmap.width <= MAX_DIM && bitmap.height <= MAX_DIM && file.size <= 1024 * 1024) {
      bitmap.close()
      return file
    }
    const scale = Math.min(1, MAX_DIM / Math.max(bitmap.width, bitmap.height))
    const w = Math.max(1, Math.round(bitmap.width * scale))
    const h = Math.max(1, Math.round(bitmap.height * scale))
    const canvas = document.createElement('canvas')
    canvas.width = w
    canvas.height = h
    const ctx = canvas.getContext('2d')
    if (!ctx) {
      bitmap.close()
      return file
    }
    ctx.drawImage(bitmap, 0, 0, w, h)
    bitmap.close()
    // WebP = small + keeps transparency; fall back to PNG, then JPEG on white.
    let out = await new Promise<Blob | null>((res) => canvas.toBlob(res, 'image/webp', 0.87))
    if (!out || out.type !== 'image/webp') {
      out = await new Promise<Blob | null>((res) => canvas.toBlob(res, 'image/png'))
    }
    if (out && out.type === 'image/png' && out.size > 4.5 * 1024 * 1024) {
      const flat = document.createElement('canvas')
      flat.width = w
      flat.height = h
      const fctx = flat.getContext('2d')
      if (fctx) {
        fctx.fillStyle = '#ffffff'
        fctx.fillRect(0, 0, w, h)
        fctx.drawImage(canvas, 0, 0)
        out = (await new Promise<Blob | null>((res) => flat.toBlob(res, 'image/jpeg', 0.87))) ?? out
      }
    }
    return out ?? file
  } catch {
    return file
  }
}

interface ProductFormValues {
  title: string
  description: string
  price: string
  compareAtPrice: string
  categoryId: string
  stock: string
  images: string[]
  videoUrl: string
  sku: string
  barcode: string
  materials: string
  care: string
  weightGrams: string
  lengthCm: string
  widthCm: string
  heightCm: string
  processingDays: string
  freeShipping: boolean
  shippingFee: string
  shippingPolicy: string
  slug: string
  metaTitle: string
  metaDescription: string
}

const emptyForm: ProductFormValues = {
  title: '',
  description: '',
  price: '',
  compareAtPrice: '',
  categoryId: '',
  stock: '10',
  images: [],
  videoUrl: '',
  sku: '',
  barcode: '',
  materials: '',
  care: '',
  weightGrams: '',
  lengthCm: '',
  widthCm: '',
  heightCm: '',
  processingDays: '',
  freeShipping: false,
  shippingFee: '',
  shippingPolicy: '',
  slug: '',
  metaTitle: '',
  metaDescription: '',
}

const uid = () => Math.random().toString(36).slice(2, 10)

const TAB_ORDER = ['basics', 'pricing', 'media', 'variants', 'details', 'shipping', 'seo'] as const
type TabId = (typeof TAB_ORDER)[number]

export function ProductFormDialog({
  open,
  onOpenChange,
  categories,
  editing,
  onSaved,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  categories: CategoryDTO[]
  editing: ProductDTO | null
  onSaved: () => void
}) {
  const [form, setForm] = useState<ProductFormValues>(emptyForm)
  const [imageUrl, setImageUrl] = useState('')
  const [sampleOffset, setSampleOffset] = useState(0)
  const [saving, setSaving] = useState<'idle' | 'draft' | 'publish'>('idle')
  const [tab, setTab] = useState<TabId>('basics')
  const [highlightInput, setHighlightInput] = useState('')
  const [highlights, setHighlights] = useState<string[]>([])
  const [specs, setSpecs] = useState<SpecRow[]>([])
  const [optionDefs, setOptionDefs] = useState<OptionDef[]>([])
  const [variantRows, setVariantRows] = useState<VariantRow[]>([])
  const [uploads, setUploads] = useState<UploadItem[]>([])
  const [dragOver, setDragOver] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  // ── Hydrate on open ────────────────────────────────────────────────────────
  useEffect(() => {
    if (!open) return
    setTab('basics')
    setImageUrl('')
    setHighlightInput('')
    setUploads([])
    setDragOver(false)
    if (editing) {
      setForm({
        title: editing.title,
        description: editing.description,
        price: String(editing.price),
        compareAtPrice: editing.compareAtPrice ? String(editing.compareAtPrice) : '',
        categoryId: editing.categoryId,
        stock: String(editing.stock),
        images: [...editing.images],
        videoUrl: editing.videoUrl ?? '',
        sku: editing.sku ?? '',
        barcode: editing.barcode ?? '',
        materials: editing.materials ?? '',
        care: editing.care ?? '',
        weightGrams: editing.weightGrams != null ? String(editing.weightGrams) : '',
        lengthCm: editing.lengthCm != null ? String(editing.lengthCm) : '',
        widthCm: editing.widthCm != null ? String(editing.widthCm) : '',
        heightCm: editing.heightCm != null ? String(editing.heightCm) : '',
        processingDays: editing.processingDays != null ? String(editing.processingDays) : '',
        freeShipping: editing.freeShipping ?? false,
        shippingFee: editing.shippingFee != null ? String(editing.shippingFee) : '',
        shippingPolicy: editing.shippingPolicy ?? '',
        slug: editing.slug ?? '',
        metaTitle: editing.metaTitle ?? '',
        metaDescription: editing.metaDescription ?? '',
      })
      setHighlights([...(editing.highlights ?? [])])
      setSpecs((editing.specs ?? []).map((s) => ({ id: uid(), label: s.label, value: s.value })))
      // Rebuild option definitions from the stored variants
      const variants = editing.variants ?? []
      const names: string[] = []
      const valueOrder = new Map<string, string[]>()
      for (const v of variants) {
        for (const [key, val] of Object.entries(v.options)) {
          if (!names.includes(key)) names.push(key)
          const list = valueOrder.get(key) ?? []
          if (!list.includes(val)) list.push(val)
          valueOrder.set(key, list)
        }
      }
      setOptionDefs(names.map((n) => ({ id: uid(), name: n, values: (valueOrder.get(n) ?? []).join(', ') })))
      setVariantRows(
        variants.map((v) => ({
          key: uid(),
          name: v.name,
          options: { ...v.options },
          price: v.price != null ? String(v.price) : '',
          compareAtPrice: v.compareAtPrice != null ? String(v.compareAtPrice) : '',
          stock: String(v.stock),
          sku: v.sku ?? '',
          isActive: v.isActive,
        }))
      )
    } else {
      setForm(emptyForm)
      setHighlights([])
      setSpecs([])
      setOptionDefs([])
      setVariantRows([])
    }
  }, [open, editing])

  const set =
    (key: keyof ProductFormValues) =>
    (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
      setForm((f) => ({ ...f, [key]: e.target.value }))

  // ── Media helpers ──────────────────────────────────────────────────────────
  const addImage = (url: string) => {
    const clean = url.trim()
    if (!clean) return
    if (!/^https?:\/\//.test(clean)) {
      toast({ title: 'Invalid image URL', description: 'Please paste a valid http(s) URL', variant: 'destructive' })
      return
    }
    setForm((f) => {
      if (f.images.includes(clean) || f.images.length >= 6) return f
      return { ...f, images: [...f.images, clean] }
    })
    setImageUrl('')
  }

  const moveImage = (i: number, dir: -1 | 1) => {
    setForm((f) => {
      const j = i + dir
      if (j < 0 || j >= f.images.length) return f
      const images = [...f.images]
      ;[images[i], images[j]] = [images[j], images[i]]
      return { ...f, images }
    })
  }

  const addUploadedImage = (url: string) => {
    setForm((f) => {
      if (f.images.includes(url) || f.images.length >= 6) return f
      return { ...f, images: [...f.images, url] }
    })
  }

  const patchUpload = (id: string, patch: Partial<UploadItem>) =>
    setUploads((u) => u.map((x) => (x.id === id ? { ...x, ...patch } : x)))

  const dismissUpload = (id: string) =>
    setUploads((u) => {
      const item = u.find((x) => x.id === id)
      if (item) URL.revokeObjectURL(item.preview)
      return u.filter((x) => x.id !== id)
    })

  const uploadFile = async (file: File) => {
    const id = uid()
    const preview = URL.createObjectURL(file)
    setUploads((u) => [...u, { id, name: file.name, preview, progress: 0, status: 'uploading' }])
    try {
      if (!/^image\/(jpeg|png|webp|gif)$/i.test(file.type)) {
        throw new Error('Only JPG, PNG, WebP or GIF images are supported')
      }
      if (file.size > MAX_UPLOAD_BYTES) throw new Error('Image is larger than 6 MB')
      const blob = await shrinkImage(file)
      const url = await new Promise<string>((resolve, reject) => {
        const fd = new FormData()
        const ext = (file.name.match(/\.([a-z0-9]+)$/i)?.[1] ?? 'img').toLowerCase()
        fd.append('file', blob, `${file.name.replace(/\.[^.]+$/, '') || 'image'}.${ext}`)
        fd.append('scope', 'products')
        const xhr = new XMLHttpRequest()
        xhr.open('POST', '/api/upload')
        xhr.upload.onprogress = (e) => {
          if (e.lengthComputable) patchUpload(id, { progress: Math.round((e.loaded / e.total) * 100) })
        }
        xhr.onload = () => {
          try {
            const data = JSON.parse(xhr.responseText || '{}') as { url?: string; error?: string }
            if (xhr.status >= 200 && xhr.status < 300 && data.url) resolve(data.url)
            else reject(new Error(data.error || `Upload failed (${xhr.status})`))
          } catch {
            reject(new Error(`Upload failed (${xhr.status})`))
          }
        }
        xhr.onerror = () => reject(new Error('Network error during upload'))
        xhr.send(fd)
      })
      addUploadedImage(url)
      patchUpload(id, { status: 'done', progress: 100 })
      setTimeout(() => dismissUpload(id), 1800)
    } catch (err) {
      patchUpload(id, { status: 'error', error: err instanceof Error ? err.message : 'Upload failed' })
    }
  }

  const handleFiles = (files: FileList | File[]) => {
    const list = Array.from(files).filter((f) => f.type.startsWith('image/'))
    if (list.length === 0) {
      toast({
        title: 'No images found',
        description: 'Please choose image files (JPG, PNG, WebP or GIF)',
        variant: 'destructive',
      })
      return
    }
    const remaining = 6 - form.images.length - uploads.filter((u) => u.status === 'uploading').length
    if (remaining <= 0) {
      toast({
        title: 'Image limit reached',
        description: 'A product can have up to 6 images — remove one first',
        variant: 'destructive',
      })
      return
    }
    if (list.length > remaining) {
      toast({
        title: `Adding the first ${remaining} image${remaining > 1 ? 's' : ''}`,
        description: 'A product can have up to 6 images',
      })
    }
    list.slice(0, remaining).forEach((f) => void uploadFile(f))
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  const samples = useMemo(() => {
    const list = SAMPLE_PRODUCT_IMAGES.filter((u) => !form.images.includes(u))
    if (list.length === 0) return []
    const out: string[] = []
    for (let i = 0; i < Math.min(8, list.length); i++) out.push(list[(sampleOffset + i) % list.length])
    return out
  }, [sampleOffset, form.images])

  // ── Highlights / specs helpers ────────────────────────────────────────────
  const addHighlight = () => {
    const clean = highlightInput.trim()
    if (!clean) return
    if (highlights.length >= 10) {
      toast({ title: 'Too many highlights', description: 'Up to 10 bullet points', variant: 'destructive' })
      return
    }
    setHighlights((h) => [...h, clean.slice(0, 160)])
    setHighlightInput('')
  }

  const moveHighlight = (i: number, dir: -1 | 1) => {
    setHighlights((h) => {
      const j = i + dir
      if (j < 0 || j >= h.length) return h
      const next = [...h]
      ;[next[i], next[j]] = [next[j], next[i]]
      return next
    })
  }

  // ── Variants ────────────────────────────────────────────────────────────────
  const updateOptionDef = (id: string, patch: Partial<OptionDef>) =>
    setOptionDefs((defs) => defs.map((d) => (d.id === id ? { ...d, ...patch } : d)))

  const addOptionDef = () => {
    if (optionDefs.length >= 3) {
      toast({ title: 'Up to 3 options', description: 'e.g. Size, Color, Material', variant: 'destructive' })
      return
    }
    setOptionDefs((d) => [...d, { id: uid(), name: '', values: '' }])
  }

  const generateVariants = () => {
    const defs = optionDefs
      .map((d) => ({
        name: d.name.trim(),
        values: d.values.split(',').map((v) => v.trim()).filter(Boolean),
      }))
      .filter((d) => d.name && d.values.length > 0)
    if (defs.length === 0) {
      toast({
        title: 'Nothing to generate',
        description: 'Add at least one option with a name and values (e.g. Size: S, M, L)',
        variant: 'destructive',
      })
      return
    }
    const combos: Record<string, string>[] = [{}]
    for (const d of defs) {
      const next: Record<string, string>[] = []
      for (const combo of combos) for (const value of d.values) next.push({ ...combo, [d.name]: value })
      combos.splice(0, combos.length, ...next)
    }
    if (combos.length > 100) {
      toast({ title: 'Too many combinations', description: 'Maximum is 100 variants', variant: 'destructive' })
      return
    }
    setVariantRows((rows) =>
      combos.map((options) => {
        const name = Object.values(options).join(' / ')
        const existing = rows.find((r) => r.name === name) // preserve edits on regenerate
        return (
          existing ?? {
            key: uid(),
            name,
            options,
            price: '',
            compareAtPrice: '',
            stock: '0',
            sku: '',
            isActive: true,
          }
        )
      })
    )
    toast({ title: `${combos.length} variant${combos.length === 1 ? '' : 's'} generated`, description: 'Set price and stock per combination' })
  }

  const variantStockTotal = variantRows.reduce((s, v) => s + (parseInt(v.stock || '0', 10) || 0), 0)

  // ── Validation ─────────────────────────────────────────────────────────────
  const validate = (status: 'ACTIVE' | 'DRAFT'): string | null => {
    if (form.title.trim().length < 3) return 'Title must be at least 3 characters'
    if (form.description.trim().length < 10) return 'Description must be at least 10 characters'
    if (!form.categoryId) return 'Pick a category'
    if (!parseFloat(form.price) || parseFloat(form.price) <= 0) return 'Enter a valid price'
    if (status === 'ACTIVE' && form.images.length === 0)
      return 'Add at least one image before publishing (or save as draft)'
    if (form.videoUrl.trim() && !/^https?:\/\//.test(form.videoUrl.trim()))
      return 'Video URL must start with http(s)://'
    for (const v of variantRows) {
      const stock = parseInt(v.stock || '0', 10)
      if (Number.isNaN(stock) || stock < 0) return `Invalid stock for "${v.name}"`
      if (v.price !== '' && (!parseFloat(v.price) || parseFloat(v.price) <= 0))
        return `Variant "${v.name}" needs a valid price (or leave empty to inherit)`
    }
    return null
  }

  // ── Submit ─────────────────────────────────────────────────────────────────
  const submit = async (status: 'ACTIVE' | 'DRAFT') => {
    const error = validate(status)
    if (error) {
      toast({ title: 'Cannot save yet', description: error, variant: 'destructive' })
      // Jump to the tab that most likely holds the problem
      if (error.includes('image') || error.includes('Video')) setTab('media')
      else if (error.includes('itle') || error.includes('escription') || error.includes('category')) setTab('basics')
      else if (error.includes('price') && error.includes('Variant')) setTab('variants')
      else if (error.includes('price')) setTab('pricing')
      return
    }
    setSaving(status === "DRAFT" ? "draft" : "publish")
    try {
      const payload = {
        title: form.title.trim(),
        description: form.description.trim(),
        price: parseFloat(form.price),
        compareAtPrice: form.compareAtPrice ? parseFloat(form.compareAtPrice) : null,
        images: form.images,
        categoryId: form.categoryId,
        stock: variantRows.length
          ? variantStockTotal // server recomputes; keep payload honest
          : parseInt(form.stock || '0', 10) || 0,
        status,
        sku: form.sku.trim() || null,
        barcode: form.barcode.trim() || null,
        videoUrl: form.videoUrl.trim() || null,
        highlights: highlights.filter(Boolean),
        specs: specs
          .map((s) => ({ label: s.label.trim(), value: s.value.trim() }))
          .filter((s) => s.label && s.value),
        materials: form.materials.trim() || null,
        care: form.care.trim() || null,
        weightGrams: form.weightGrams ? parseInt(form.weightGrams, 10) : null,
        lengthCm: form.lengthCm ? parseFloat(form.lengthCm) : null,
        widthCm: form.widthCm ? parseFloat(form.widthCm) : null,
        heightCm: form.heightCm ? parseFloat(form.heightCm) : null,
        processingDays: form.processingDays ? parseInt(form.processingDays, 10) : null,
        freeShipping: form.freeShipping,
        shippingFee: form.freeShipping || !form.shippingFee ? null : parseFloat(form.shippingFee),
        shippingPolicy: form.shippingPolicy.trim() || null,
        slug: form.slug.trim() || null,
        metaTitle: form.metaTitle.trim() || null,
        metaDescription: form.metaDescription.trim() || null,
        variants: variantRows.map((v) => ({
          name: v.name,
          options: v.options,
          price: v.price === '' ? null : parseFloat(v.price),
          compareAtPrice: v.compareAtPrice === '' ? null : parseFloat(v.compareAtPrice),
          stock: parseInt(v.stock || '0', 10) || 0,
          sku: v.sku.trim() || null,
          isActive: v.isActive,
        })),
      }
      const res = await fetch(editing ? `/api/products/${editing.id}` : '/api/products', {
        method: editing ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      const json = await res.json()
      if (!res.ok) {
        toast({ title: 'Save failed', description: json.error, variant: 'destructive' })
        return
      }
      toast({
        title:
          status === 'DRAFT'
            ? 'Draft saved'
            : editing
              ? 'Product updated'
              : 'Product published',
        description: form.title,
      })
      onOpenChange(false)
      onSaved()
    } catch {
      toast({ title: 'Save failed', description: 'Network error', variant: 'destructive' })
    } finally {
      setSaving("idle")
    }
  }

  const slugPreview = (form.slug.trim() || form.title.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'your-product').slice(0, 80)
  const editingDraft = editing?.status === 'DRAFT'

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto scrollbar-thin sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>{editing ? 'Edit product' : 'Add new product'}</DialogTitle>
          <DialogDescription>
            {editing ? 'Update your listing section by section.' : 'Fill in the details section by section, then publish or save as draft.'}
          </DialogDescription>
        </DialogHeader>

        <Tabs value={tab} onValueChange={(v) => setTab(v as TabId)}>
          <TabsList className="h-auto w-full justify-start gap-1 overflow-x-auto rounded-xl bg-muted/60 p-1">
            <TabsTrigger value="basics" className="gap-1.5 rounded-lg px-3 py-1.5 text-xs sm:text-sm">
              <FileText size={14} /> Basics
            </TabsTrigger>
            <TabsTrigger value="pricing" className="gap-1.5 rounded-lg px-3 py-1.5 text-xs sm:text-sm">
              <Coins size={14} /> Pricing &amp; stock
            </TabsTrigger>
            <TabsTrigger value="media" className="gap-1.5 rounded-lg px-3 py-1.5 text-xs sm:text-sm">
              <ImageIcon size={14} /> Media
            </TabsTrigger>
            <TabsTrigger value="variants" className="gap-1.5 rounded-lg px-3 py-1.5 text-xs sm:text-sm">
              <Layers size={14} /> Variants
            </TabsTrigger>
            <TabsTrigger value="details" className="gap-1.5 rounded-lg px-3 py-1.5 text-xs sm:text-sm">
              <ListChecks size={14} /> Details
            </TabsTrigger>
            <TabsTrigger value="shipping" className="gap-1.5 rounded-lg px-3 py-1.5 text-xs sm:text-sm">
              <Truck size={14} /> Shipping
            </TabsTrigger>
            <TabsTrigger value="seo" className="gap-1.5 rounded-lg px-3 py-1.5 text-xs sm:text-sm">
              <Search size={14} /> SEO
            </TabsTrigger>
          </TabsList>

          {/* ── Basics ── */}
          <TabsContent value="basics" className="mt-4 space-y-4">
            <div className="space-y-1.5">
              <div className="flex items-baseline justify-between">
                <Label htmlFor="p-title">Title</Label>
                <span className="text-[11px] text-muted-foreground">{form.title.length}/120</span>
              </div>
              <Input
                id="p-title"
                value={form.title}
                onChange={set('title')}
                maxLength={120}
                placeholder="e.g. Handmade Ceramic Mug"
              />
            </div>
            <div className="space-y-1.5">
              <div className="flex items-baseline justify-between">
                <Label htmlFor="p-desc">Description</Label>
                <span className="text-[11px] text-muted-foreground">{form.description.length}/4000</span>
              </div>
              <Textarea
                id="p-desc"
                value={form.description}
                onChange={set('description')}
                maxLength={4000}
                placeholder="Describe materials, dimensions, what makes it special…"
                className="min-h-32"
              />
            </div>
            <div className="space-y-1.5">
              <Label>Category</Label>
              <Select value={form.categoryId} onValueChange={(v) => setForm((f) => ({ ...f, categoryId: v }))}>
                <SelectTrigger aria-label="Category">
                  <SelectValue placeholder="Choose a category" />
                </SelectTrigger>
                <SelectContent>
                  {categories.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </TabsContent>

          {/* ── Pricing & stock ── */}
          <TabsContent value="pricing" className="mt-4 space-y-4">
            <div className="grid gap-4 sm:grid-cols-3">
              <div className="space-y-1.5">
                <Label htmlFor="p-price">Price ($)</Label>
                <Input id="p-price" type="number" min="0.01" step="0.01" value={form.price} onChange={set('price')} placeholder="29.99" />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="p-compare">
                  Compare at <span className="text-xs text-muted-foreground">(opt.)</span>
                </Label>
                <Input id="p-compare" type="number" min="0" step="0.01" value={form.compareAtPrice} onChange={set('compareAtPrice')} placeholder="39.99" />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="p-stock">Stock</Label>
                <Input
                  id="p-stock"
                  type="number"
                  min="0"
                  value={form.stock}
                  onChange={set('stock')}
                  disabled={variantRows.length > 0}
                  className={variantRows.length > 0 ? 'opacity-60' : ''}
                />
                {variantRows.length > 0 && (
                  <p className="text-[11px] text-muted-foreground">
                    Managed by variants — total {variantStockTotal}
                  </p>
                )}
              </div>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="p-sku">
                  SKU <span className="text-xs text-muted-foreground">(opt.)</span>
                </Label>
                <Input id="p-sku" value={form.sku} onChange={set('sku')} maxLength={64} placeholder="e.g. MUG-CER-001" />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="p-barcode">
                  Barcode <span className="text-xs text-muted-foreground">(opt.)</span>
                </Label>
                <Input id="p-barcode" value={form.barcode} onChange={set('barcode')} maxLength={64} placeholder="e.g. 0123456789012" />
              </div>
            </div>
            <p className="rounded-xl bg-muted/50 px-4 py-3 text-xs leading-relaxed text-muted-foreground">
              If you sell this product in multiple versions (size, color…), set the exact price and stock per
              combination in the <span className="font-semibold text-foreground">Variants</span> tab — variant
              prices override this base price when selected.
            </p>
          </TabsContent>

          {/* ── Media ── */}
          <TabsContent value="media" className="mt-4 space-y-4">
            <div className="space-y-2.5">
              <Label>Images ({form.images.length}/6)</Label>

              {/* Upload dropzone (drag & drop or browse) */}
              <div
                role="button"
                tabIndex={0}
                aria-label="Upload product images from your device"
                onClick={() => fileInputRef.current?.click()}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault()
                    fileInputRef.current?.click()
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
                  if (e.dataTransfer.files.length) handleFiles(e.dataTransfer.files)
                }}
                className={cn(
                  'flex cursor-pointer flex-col items-center justify-center gap-1.5 rounded-xl border-2 border-dashed px-4 py-7 text-center outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring',
                  dragOver
                    ? 'border-primary bg-primary/10'
                    : 'border-border hover:border-primary/60 hover:bg-muted/50'
                )}
              >
                <UploadCloud
                  size={26}
                  className={dragOver ? 'text-primary' : 'text-muted-foreground'}
                  aria-hidden
                />
                <p className="text-sm font-medium">Drag &amp; drop product photos here</p>
                <p className="text-xs text-muted-foreground">
                  or{' '}
                  <span className="font-semibold text-primary underline underline-offset-2">
                    browse files
                  </span>{' '}
                  — JPG, PNG, WebP, GIF · up to 6 MB each
                </p>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/jpeg,image/png,image/webp,image/gif"
                  multiple
                  className="hidden"
                  onChange={(e) => {
                    if (e.target.files?.length) handleFiles(e.target.files)
                  }}
                />
              </div>

              {/* Upload queue with per-file progress */}
              {uploads.length > 0 && (
                <div className="space-y-1.5 rounded-xl border bg-muted/30 p-2.5">
                  {uploads.map((u) => (
                    <div key={u.id} className="flex items-center gap-2.5">
                      <img
                        src={u.preview}
                        alt=""
                        className="h-9 w-9 shrink-0 rounded-lg border object-cover"
                      />
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center justify-between gap-2">
                          <p className="truncate text-xs font-medium">{u.name}</p>
                          <span className="shrink-0 text-[10px] tabular-nums text-muted-foreground">
                            {u.status === 'uploading'
                              ? `${u.progress}%`
                              : u.status === 'done'
                                ? 'Added'
                                : 'Failed'}
                          </span>
                        </div>
                        {u.status === 'error' ? (
                          <p className="truncate text-[11px] text-destructive">{u.error}</p>
                        ) : (
                          <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-background">
                            <div
                              className={cn(
                                'h-full rounded-full transition-all duration-200',
                                u.status === 'done' ? 'bg-emerald-600' : 'bg-primary'
                              )}
                              style={{ width: `${u.status === 'done' ? 100 : u.progress}%` }}
                            />
                          </div>
                        )}
                      </div>
                      {u.status === 'done' && <Check size={14} className="shrink-0 text-emerald-600" />}
                      {u.status === 'error' && (
                        <button
                          type="button"
                          onClick={() => dismissUpload(u.id)}
                          className="shrink-0 text-muted-foreground transition-colors hover:text-destructive"
                          aria-label="Dismiss failed upload"
                        >
                          <Trash2 size={13} />
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              )}

              <p className="text-center text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
                or paste a link
              </p>
              <div className="flex gap-2">
                <Input
                  value={imageUrl}
                  onChange={(e) => setImageUrl(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault()
                      addImage(imageUrl)
                    }
                  }}
                  placeholder="Paste an image URL and press Enter"
                />
                <Button type="button" variant="outline" onClick={() => addImage(imageUrl)} aria-label="Add image URL">
                  <ImagePlus size={15} />
                </Button>
              </div>
              {form.images.length > 0 && (
                <div className="flex flex-wrap gap-2">
                  {form.images.map((img, i) => (
                    <div key={img} className="group relative h-20 w-20 overflow-hidden rounded-xl border">
                      <img src={img} alt={`Product image ${i + 1}`} className="h-full w-full object-cover" />
                      <button
                        type="button"
                        onClick={() => setForm((f) => ({ ...f, images: f.images.filter((x) => x !== img) }))}
                        className="absolute right-1 top-1 flex h-6 w-6 items-center justify-center rounded-full bg-black/60 text-white opacity-0 transition group-hover:opacity-100"
                        aria-label="Remove image"
                      >
                        <Trash2 size={12} />
                      </button>
                      {i === 0 && (
                        <span className="absolute bottom-0 w-full bg-primary/90 py-0.5 text-center text-[9px] font-bold uppercase text-primary-foreground">
                          Cover
                        </span>
                      )}
                      <div className="absolute inset-x-0 top-1 hidden justify-center gap-0.5 group-hover:flex">
                        <button
                          type="button"
                          onClick={() => moveImage(i, -1)}
                          disabled={i === 0}
                          className="flex h-5 w-5 items-center justify-center rounded-full bg-background/90 text-foreground shadow-sm disabled:opacity-30"
                          aria-label="Move image left"
                        >
                          <ArrowUp size={10} />
                        </button>
                        <button
                          type="button"
                          onClick={() => moveImage(i, 1)}
                          disabled={i === form.images.length - 1}
                          className="flex h-5 w-5 items-center justify-center rounded-full bg-background/90 text-foreground shadow-sm disabled:opacity-30"
                          aria-label="Move image right"
                        >
                          <ArrowDown size={10} />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
              <div>
                <div className="mb-1.5 flex items-center justify-between">
                  <p className="flex items-center gap-1 text-xs text-muted-foreground">
                    <UploadCloud size={12} /> Or quick-pick a sample image:
                  </p>
                  <button
                    type="button"
                    onClick={() => setSampleOffset((o) => o + 8)}
                    className="flex items-center gap-1 text-xs text-muted-foreground transition-colors hover:text-primary"
                  >
                    <Shuffle size={11} /> Shuffle
                  </button>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {samples.map((u) => (
                    <button
                      key={u}
                      type="button"
                      onClick={() => addImage(u)}
                      className={cn('h-11 w-11 overflow-hidden rounded-lg border-2 border-transparent transition hover:border-primary')}
                      aria-label="Use this sample image"
                    >
                      <img src={u} alt="Sample" className="h-full w-full object-cover" />
                    </button>
                  ))}
                </div>
              </div>
            </div>
            <Separator />
            <div className="space-y-1.5">
              <Label htmlFor="p-video">
                Video URL <span className="text-xs text-muted-foreground">(optional — YouTube or direct mp4 link)</span>
              </Label>
              <Input id="p-video" value={form.videoUrl} onChange={set('videoUrl')} maxLength={512} placeholder="https://…" />
            </div>
          </TabsContent>

          {/* ── Variants ── */}
          <TabsContent value="variants" className="mt-4 space-y-4">
            <p className="text-xs leading-relaxed text-muted-foreground">
              Define up to 3 options (e.g. Size, Color), then generate every combination as a variant with its own
              price, stock and SKU.
            </p>
            <div className="space-y-3">
              {optionDefs.map((d, i) => (
                <div key={d.id} className="flex items-center gap-2">
                  <span className="w-6 shrink-0 text-center text-xs font-bold text-muted-foreground">{i + 1}</span>
                  <Input
                    value={d.name}
                    onChange={(e) => updateOptionDef(d.id, { name: e.target.value })}
                    placeholder="Option name (e.g. Size)"
                    maxLength={40}
                    className="w-32 shrink-0 sm:w-40"
                    aria-label={`Option ${i + 1} name`}
                  />
                  <Input
                    value={d.values}
                    onChange={(e) => updateOptionDef(d.id, { values: e.target.value })}
                    placeholder="Values, comma separated (e.g. S, M, L)"
                    aria-label={`Option ${i + 1} values`}
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="h-9 w-9 shrink-0 text-muted-foreground hover:text-destructive"
                    onClick={() => setOptionDefs((defs) => defs.filter((x) => x.id !== d.id))}
                    aria-label="Remove option"
                  >
                    <Trash2 size={14} />
                  </Button>
                </div>
              ))}
            </div>
            <div className="flex flex-wrap gap-2">
              <Button type="button" variant="outline" size="sm" onClick={addOptionDef}>
                <Plus size={14} className="mr-1" /> Add option
              </Button>
              <Button type="button" variant="secondary" size="sm" onClick={generateVariants}>
                <Layers size={14} className="mr-1" /> Generate variants
              </Button>
              {variantRows.length > 0 && (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="text-muted-foreground hover:text-destructive"
                  onClick={() => {
                    setVariantRows([])
                    setOptionDefs([])
                  }}
                >
                  <Trash2 size={14} className="mr-1" /> Clear all
                </Button>
              )}
            </div>

            {variantRows.length > 0 && (
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <p className="text-sm font-semibold">
                    {variantRows.length} variant{variantRows.length === 1 ? '' : 's'}
                  </p>
                  <p className="text-xs text-muted-foreground">Total stock: {variantStockTotal}</p>
                </div>
                <div className="overflow-x-auto rounded-xl border">
                  <table className="w-full min-w-[560px] text-sm">
                    <thead>
                      <tr className="border-b bg-muted/50 text-left text-xs text-muted-foreground">
                        <th className="px-3 py-2 font-medium">Variant</th>
                        <th className="px-3 py-2 font-medium">Price ($) <span className="text-[10px]">(empty = base)</span></th>
                        <th className="px-3 py-2 font-medium">Stock</th>
                        <th className="px-3 py-2 font-medium">SKU</th>
                        <th className="px-3 py-2 font-medium">Active</th>
                      </tr>
                    </thead>
                    <tbody>
                      {variantRows.map((v, i) => (
                        <tr key={v.key} className="border-b last:border-0">
                          <td className="px-3 py-2">
                            <span className="font-medium">{v.name}</span>
                            {v.isActive ? null : (
                              <span className="ml-1.5 rounded-full bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground">hidden</span>
                            )}
                          </td>
                          <td className="px-3 py-2">
                            <Input
                              type="number"
                              min="0.01"
                              step="0.01"
                              value={v.price}
                              onChange={(e) =>
                                setVariantRows((rows) => rows.map((r, j) => (j === i ? { ...r, price: e.target.value } : r)))
                              }
                              placeholder="—"
                              className="h-8 w-24"
                              aria-label={`Price for ${v.name}`}
                            />
                          </td>
                          <td className="px-3 py-2">
                            <Input
                              type="number"
                              min="0"
                              value={v.stock}
                              onChange={(e) =>
                                setVariantRows((rows) => rows.map((r, j) => (j === i ? { ...r, stock: e.target.value } : r)))
                              }
                              className="h-8 w-20"
                              aria-label={`Stock for ${v.name}`}
                            />
                          </td>
                          <td className="px-3 py-2">
                            <Input
                              value={v.sku}
                              onChange={(e) =>
                                setVariantRows((rows) => rows.map((r, j) => (j === i ? { ...r, sku: e.target.value } : r)))
                              }
                              placeholder="—"
                              maxLength={64}
                              className="h-8 w-28"
                              aria-label={`SKU for ${v.name}`}
                            />
                          </td>
                          <td className="px-3 py-2">
                            <Switch
                              checked={v.isActive}
                              onCheckedChange={(checked) =>
                                setVariantRows((rows) => rows.map((r, j) => (j === i ? { ...r, isActive: checked } : r)))
                              }
                              aria-label={`Toggle ${v.name}`}
                            />
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </TabsContent>

          {/* ── Details ── */}
          <TabsContent value="details" className="mt-4 space-y-5">
            <div className="space-y-2.5">
              <Label>Highlights</Label>
              <p className="text-xs text-muted-foreground">Bullet points shown as “About this item” (up to 10).</p>
              <div className="flex gap-2">
                <Input
                  value={highlightInput}
                  onChange={(e) => setHighlightInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault()
                      addHighlight()
                    }
                  }}
                  placeholder="e.g. Handmade in small batches"
                  maxLength={160}
                />
                <Button type="button" variant="outline" onClick={addHighlight} aria-label="Add highlight">
                  <Plus size={15} />
                </Button>
              </div>
              {highlights.length > 0 && (
                <ul className="space-y-1.5">
                  {highlights.map((h, i) => (
                    <li key={`${i}-${h}`} className="flex items-center gap-2 rounded-lg border bg-muted/30 px-3 py-2 text-sm">
                      <Check size={13} className="shrink-0 text-primary" />
                      <span className="min-w-0 flex-1 truncate">{h}</span>
                      <button
                        type="button"
                        onClick={() => moveHighlight(i, -1)}
                        disabled={i === 0}
                        className="text-muted-foreground transition-colors hover:text-foreground disabled:opacity-30"
                        aria-label="Move up"
                      >
                        <ArrowUp size={13} />
                      </button>
                      <button
                        type="button"
                        onClick={() => moveHighlight(i, 1)}
                        disabled={i === highlights.length - 1}
                        className="text-muted-foreground transition-colors hover:text-foreground disabled:opacity-30"
                        aria-label="Move down"
                      >
                        <ArrowDown size={13} />
                      </button>
                      <button
                        type="button"
                        onClick={() => setHighlights((list) => list.filter((_, j) => j !== i))}
                        className="text-muted-foreground transition-colors hover:text-destructive"
                        aria-label="Remove highlight"
                      >
                        <Trash2 size={13} />
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            <div className="space-y-2.5">
              <Label>Specifications</Label>
              <p className="text-xs text-muted-foreground">Key–value pairs shown in a specifications table (up to 12).</p>
              {specs.map((s, i) => (
                <div key={s.id} className="flex items-center gap-2">
                  <Input
                    value={s.label}
                    onChange={(e) => setSpecs((rows) => rows.map((r, j) => (j === i ? { ...r, label: e.target.value } : r)))}
                    placeholder="Label (e.g. Dimensions)"
                    maxLength={60}
                    className="w-36 shrink-0 sm:w-44"
                    aria-label="Specification label"
                  />
                  <Input
                    value={s.value}
                    onChange={(e) => setSpecs((rows) => rows.map((r, j) => (j === i ? { ...r, value: e.target.value } : r)))}
                    placeholder="Value (e.g. 30 × 20 cm)"
                    maxLength={200}
                    aria-label="Specification value"
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="h-9 w-9 shrink-0 text-muted-foreground hover:text-destructive"
                    onClick={() => setSpecs((rows) => rows.filter((_, j) => j !== i))}
                    aria-label="Remove specification"
                  >
                    <Trash2 size={14} />
                  </Button>
                </div>
              ))}
              <Button type="button" variant="outline" size="sm" onClick={() => setSpecs((rows) => [...rows, { id: uid(), label: '', value: '' }])}>
                <Plus size={14} className="mr-1" /> Add specification
              </Button>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="p-materials">
                  Materials <span className="text-xs text-muted-foreground">(opt.)</span>
                </Label>
                <Input id="p-materials" value={form.materials} onChange={set('materials')} maxLength={500} placeholder="e.g. 100% organic cotton" />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="p-care">
                  Care instructions <span className="text-xs text-muted-foreground">(opt.)</span>
                </Label>
                <Input id="p-care" value={form.care} onChange={set('care')} maxLength={500} placeholder="e.g. Machine wash cold" />
              </div>
            </div>
          </TabsContent>

          {/* ── Shipping ── */}
          <TabsContent value="shipping" className="mt-4 space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="p-weight">
                  Weight <span className="text-xs text-muted-foreground">(grams)</span>
                </Label>
                <Input id="p-weight" type="number" min="1" value={form.weightGrams} onChange={set('weightGrams')} placeholder="e.g. 350" />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="p-processing">
                  Processing time <span className="text-xs text-muted-foreground">(business days)</span>
                </Label>
                <Select
                  value={form.processingDays}
                  onValueChange={(v) => setForm((f) => ({ ...f, processingDays: v }))}
                >
                  <SelectTrigger id="p-processing" aria-label="Processing time">
                    <SelectValue placeholder="e.g. 1–3 days" />
                  </SelectTrigger>
                  <SelectContent>
                    {['1', '2', '3', '5', '7', '10', '14'].map((d) => (
                      <SelectItem key={d} value={d}>
                        {d} {d === '1' ? 'day' : 'days'}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid grid-cols-3 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="p-l">
                  Length <span className="text-xs text-muted-foreground">(cm)</span>
                </Label>
                <Input id="p-l" type="number" min="0" step="0.1" value={form.lengthCm} onChange={set('lengthCm')} placeholder="30" />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="p-w">
                  Width <span className="text-xs text-muted-foreground">(cm)</span>
                </Label>
                <Input id="p-w" type="number" min="0" step="0.1" value={form.widthCm} onChange={set('widthCm')} placeholder="20" />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="p-h">
                  Height <span className="text-xs text-muted-foreground">(cm)</span>
                </Label>
                <Input id="p-h" type="number" min="0" step="0.1" value={form.heightCm} onChange={set('heightCm')} placeholder="10" />
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-4 rounded-xl border bg-muted/30 px-4 py-3">
              <div className="flex items-center gap-2">
                <Switch
                  id="p-free"
                  checked={form.freeShipping}
                  onCheckedChange={(checked) => setForm((f) => ({ ...f, freeShipping: checked }))}
                  aria-label="Free shipping"
                />
                <Label htmlFor="p-free" className="cursor-pointer">Free shipping</Label>
              </div>
              <div className={cn('flex items-center gap-2', form.freeShipping && 'opacity-50')}>
                <Label htmlFor="p-fee">
                  Flat rate ($)
                </Label>
                <Input
                  id="p-fee"
                  type="number"
                  min="0"
                  step="0.01"
                  value={form.shippingFee}
                  onChange={set('shippingFee')}
                  disabled={form.freeShipping}
                  placeholder="4.99"
                  className="h-9 w-24"
                />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="p-policy">
                Shipping policy <span className="text-xs text-muted-foreground">(optional — shown on the product page)</span>
              </Label>
              <Textarea
                id="p-policy"
                value={form.shippingPolicy}
                onChange={set('shippingPolicy')}
                maxLength={1000}
                placeholder="e.g. Ships within 1 business day. Free local pickup available."
                className="min-h-20"
              />
            </div>
          </TabsContent>

          {/* ── SEO ── */}
          <TabsContent value="seo" className="mt-4 space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="p-slug">
                URL handle <span className="text-xs text-muted-foreground">(auto-generated from title if empty)</span>
              </Label>
              <div className="flex items-center gap-2">
                <span className="hidden shrink-0 text-sm text-muted-foreground sm:inline">/p/</span>
                <Input
                  id="p-slug"
                  value={form.slug}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, slug: e.target.value.toLowerCase().replace(/[^a-z0-9-]+/g, '-').replace(/-+/g, '-') }))
                  }
                  maxLength={180}
                  placeholder={form.title.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'your-product'}
                />
              </div>
            </div>
            <div className="space-y-1.5">
              <div className="flex items-baseline justify-between">
                <Label htmlFor="p-meta-title">Meta title</Label>
                <span className="text-[11px] text-muted-foreground">{form.metaTitle.length}/150</span>
              </div>
              <Input
                id="p-meta-title"
                value={form.metaTitle}
                onChange={set('metaTitle')}
                maxLength={150}
                placeholder={form.title || 'Browser tab + search result title'}
              />
            </div>
            <div className="space-y-1.5">
              <div className="flex items-baseline justify-between">
                <Label htmlFor="p-meta-desc">Meta description</Label>
                <span className={cn('text-[11px]', form.metaDescription.length > 160 ? 'font-bold text-destructive' : 'text-muted-foreground')}>
                  {form.metaDescription.length}/320
                </span>
              </div>
              <Textarea
                id="p-meta-desc"
                value={form.metaDescription}
                onChange={set('metaDescription')}
                maxLength={320}
                placeholder="A short summary for search engines and link previews…"
                className="min-h-20"
              />
            </div>
            <div className="rounded-xl border bg-muted/30 p-4">
              <p className="mb-2 text-xs font-semibold text-muted-foreground">Search preview</p>
              <div className="space-y-1">
                <p className="truncate text-xs text-muted-foreground">vendora.com/p/{slugPreview}</p>
                <p className="line-clamp-1 text-sm font-medium text-primary">
                  {form.metaTitle.trim() || form.title.trim() || 'Product title'}
                </p>
                <p className="line-clamp-2 text-xs leading-relaxed text-muted-foreground">
                  {form.metaDescription.trim() || form.description.trim().slice(0, 160) || 'Product description appears here…'}
                </p>
              </div>
            </div>
          </TabsContent>
        </Tabs>

        <DialogFooter className="gap-2 pt-2">
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            type="button"
            variant="secondary"
            disabled={saving !== 'idle'}
            onClick={() => submit('DRAFT')}
          >
            {saving === 'draft' && <Loader2 size={14} className="mr-1.5 animate-spin" />}
            Save as draft
          </Button>
          <Button type="button" disabled={saving !== 'idle'} className="min-w-32" onClick={() => submit('ACTIVE')}>
            {saving === 'publish' && <Loader2 size={14} className="mr-1.5 animate-spin" />}
            {editing ? (editingDraft ? 'Save & publish' : 'Save changes') : 'Publish product'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
