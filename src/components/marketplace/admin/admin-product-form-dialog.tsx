'use client'

import { useEffect, useMemo, useState } from 'react'
import {
  BadgeCheck,
  Boxes,
  FileText,
  ImagePlus,
  Info,
  Loader2,
  Package,
  Pencil,
  Plus,
  Search,
  ShieldCheck,
  Trash2,
  Truck,
  X,
} from 'lucide-react'
import { toast } from '@/hooks/use-toast'
import type { AttributeValue } from '@/lib/catalog/definitions'
import { attributesForCategory } from '@/lib/catalog/definitions'
import type { CategoryDTO, ProductDTO } from '@/lib/types'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
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
import { Switch } from '@/components/ui/switch'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { cn } from '@/lib/utils'
import { apiRequest, toastApiError } from './shared'
import { AttributeFields } from '../product-form/attribute-fields'
import { MediaTab } from '../product-form/media-tab'
import { VariantEditor, type VariantDraft } from '../product-form/variant-editor'

// ─────────────────────────────────────────────────────────────────────────────
// ADMIN PRODUCT FORM (Phase 9.2/9.3) — the platform-owner's full-field editor.
//
// Reuses the modern seller form's tab sub-components (media-tab, variant-editor,
// attribute-fields) with admin semantics:
//   • CREATE → a CURATED Vendora catalog record (sellerId null, purchasable
//     only via vendor offers) — the banner says so up front.
//   • EDIT   → any listing, seller-owned included: no publication agreement,
//     no seller-owner restriction. A reason (≥10 chars) is MANDATORY — the
//     field-level diff is audit-logged and the seller is notified.
//   • Admin-only fields visible: GTIN / MPN / brand linkage / featured /
//     popular rank / status incl. ARCHIVED.
// ─────────────────────────────────────────────────────────────────────────────

interface BrandRow {
  id: string
  name: string
}

interface SpecRow {
  id: string
  label: string
  value: string
}

interface TierRow {
  id: string
  from: string
  to: string
  price: string
}

interface VariantGroupDraft {
  name: string
  values: string[]
}

interface FormState {
  title: string
  description: string
  categoryId: string
  price: string
  compareAtPrice: string
  stock: string
  sku: string
  barcode: string
  moq: string
  status: string
  featured: boolean
  popularRank: string
  gtin: string
  mpn: string
  images: string[]
  videoUrl: string
  variants: VariantDraft[]
  variantGroups: VariantGroupDraft[]
  freeShipping: boolean
  shippingFee: string
  shippingPolicy: string
  materials: string
  care: string
  weightGrams: string
  lengthCm: string
  widthCm: string
  heightCm: string
  processingDays: string
  slug: string
  metaTitle: string
  metaDescription: string
}

const emptyForm: FormState = {
  title: '',
  description: '',
  categoryId: '',
  price: '',
  compareAtPrice: '',
  stock: '0',
  sku: '',
  barcode: '',
  moq: '',
  status: 'ACTIVE',
  featured: false,
  popularRank: '',
  gtin: '',
  mpn: '',
  images: [],
  videoUrl: '',
  variants: [],
  variantGroups: [],
  freeShipping: false,
  shippingFee: '',
  shippingPolicy: '',
  materials: '',
  care: '',
  weightGrams: '',
  lengthCm: '',
  widthCm: '',
  heightCm: '',
  processingDays: '',
  slug: '',
  metaTitle: '',
  metaDescription: '',
}

function groupsFromVariants(variants: { options: Record<string, string> }[]): VariantGroupDraft[] {
  const map = new Map<string, Set<string>>()
  for (const v of variants) {
    for (const [name, value] of Object.entries(v.options)) {
      if (!map.has(name)) map.set(name, new Set())
      map.get(name)!.add(value)
    }
  }
  return [...map.entries()].map(([name, values]) => ({ name, values: [...values] }))
}

const uid = () => Math.random().toString(36).slice(2, 10)
const num = (s: string): number | null => (s.trim() === '' ? null : Number(s))
const numOr = (s: string, d: number): number => {
  const n = Number(s)
  return Number.isFinite(n) && s.trim() !== '' ? n : d
}

function fromProduct(p: ProductDTO): { form: FormState; highlights: string[]; specs: SpecRow[]; tiers: TierRow[] } {
  return {
    form: {
      title: p.title,
      description: p.description,
      categoryId: p.categoryId,
      price: String(p.price),
      compareAtPrice: p.compareAtPrice != null ? String(p.compareAtPrice) : '',
      stock: String(p.stock ?? 0),
      sku: p.sku ?? '',
      barcode: p.barcode ?? '',
      moq: p.moq != null ? String(p.moq) : '',
      status: p.status,
      featured: p.featured,
      popularRank: p.popularRank != null ? String(p.popularRank) : '',
      gtin: p.gtin ?? '',
      mpn: p.mpn ?? '',
      images: [...p.images],
      videoUrl: p.videoUrl ?? '',
      variants: (p.variants ?? []).map((v) => ({
        id: v.id,
        options: v.options,
        stock: v.stock,
        // VariantEditor works in ± deltas around the base price
        priceDelta: v.price != null ? v.price - p.price : 0,
        sku: v.sku ?? '',
      })),
      variantGroups: groupsFromVariants(p.variants ?? []),
      freeShipping: p.freeShipping ?? false,
      shippingFee: p.shippingFee != null ? String(p.shippingFee) : '',
      shippingPolicy: p.shippingPolicy ?? '',
      materials: p.materials ?? '',
      care: p.care ?? '',
      weightGrams: p.weightGrams != null ? String(p.weightGrams) : '',
      lengthCm: p.lengthCm != null ? String(p.lengthCm) : '',
      widthCm: p.widthCm != null ? String(p.widthCm) : '',
      heightCm: p.heightCm != null ? String(p.heightCm) : '',
      processingDays: p.processingDays != null ? String(p.processingDays) : '',
      slug: p.slug ?? '',
      metaTitle: p.metaTitle ?? '',
      metaDescription: p.metaDescription ?? '',
    },
    highlights: [...(p.highlights ?? [])],
    specs: (p.specs ?? []).map((s) => ({ id: uid(), label: s.label, value: s.value })),
    tiers: (p.priceTiers ?? []).map((t) => ({ id: uid(), from: String(t.from), to: t.to != null ? String(t.to) : '', price: String(t.price) })),
  }
}

const attrLabel = (label: string, unit?: string | null) => label + (unit ? ` (${unit})` : '')

export function AdminProductFormDialog({
  open,
  onOpenChange,
  editing,
  onSaved,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** null = create a curated record; set = full-field edit of any listing */
  editing: ProductDTO | null
  onSaved: () => void
}) {
  const [form, setForm] = useState<FormState>(emptyForm)
  const [highlights, setHighlights] = useState<string[]>([])
  const [highlightDraft, setHighlightDraft] = useState('')
  const [specs, setSpecs] = useState<SpecRow[]>([])
  const [tiers, setTiers] = useState<TierRow[]>([])
  const [reason, setReason] = useState('')
  const [saving, setSaving] = useState(false)
  const [tab, setTab] = useState('basics')

  const [categories, setCategories] = useState<CategoryDTO[]>([])
  const [brands, setBrands] = useState<BrandRow[]>([])
  const [brandMode, setBrandMode] = useState<'none' | 'existing' | 'new'>('none')
  const [brandId, setBrandId] = useState('')
  const [brandName, setBrandName] = useState('')

  const selectedCategory = useMemo(
    () => categories.find((c) => c.id === form.categoryId),
    [categories, form.categoryId]
  )
  const attrDefs = useMemo(
    () => (selectedCategory ? attributesForCategory(selectedCategory.slug) : []),
    [selectedCategory]
  )

  // ── Load lookups (categories + brands) when the dialog opens ──
  useEffect(() => {
    if (!open) return
    let alive = true
    void (async () => {
      const [catRes, brandRes] = await Promise.all([
        apiRequest<{ categories: CategoryDTO[] }>('/api/categories'),
        apiRequest<{ brands: BrandRow[] }>('/api/admin/catalog/brands'),
      ])
      if (!alive) return
      if (catRes.ok && catRes.data) setCategories(catRes.data.categories)
      if (brandRes.ok && brandRes.data) setBrands(brandRes.data.brands)
    })()
    return () => {
      alive = false
    }
  }, [open])

  // ── Hydrate from the edited product (or reset for create) ──
  useEffect(() => {
    if (!open) return
    if (editing) {
      const loaded = fromProduct(editing)
      setForm(loaded.form)
      setHighlights(loaded.highlights)
      setSpecs(loaded.specs)
      setTiers(loaded.tiers)
      if (editing.brand) {
        setBrandMode('existing')
        setBrandId(editing.brand.id)
      } else {
        setBrandMode('none')
        setBrandId('')
      }
      setBrandName('')
    } else {
      setForm(emptyForm)
      setHighlights([])
      setSpecs([])
      setTiers([])
      setBrandMode('none')
      setBrandId('')
      setBrandName('')
    }
    setHighlightDraft('')
    setReason('')
    setTab('basics')
  }, [open, editing])

  const set = <K extends keyof FormState>(key: K, value: FormState[K]) =>
    setForm((f) => ({ ...f, [key]: value }))

  // ── Structured specs (category dictionary) read/write into the shared rows ──
  const attrValue = (label: string, unit?: string | null): string => {
    const l = attrLabel(label, unit)
    return specs.find((r) => r.label.trim() === label || r.label.trim() === l)?.value ?? ''
  }
  const setAttrValue = (label: string, unit: string | null | undefined, raw: string) => {
    const value = raw.trim()
    const l = attrLabel(label, unit)
    setSpecs((rows) => {
      const kept = rows.filter((r) => r.label.trim() !== label && r.label.trim() !== l)
      return value ? [...kept, { id: uid(), label: l, value }] : kept
    })
  }
  /** Saved spec rows that don't belong to any dictionary attribute (custom rows). */
  const customSpecRows = useMemo(
    () =>
      specs.filter(
        (r) => !attrDefs.some((d) => r.label.trim() === d.label || r.label.trim() === attrLabel(d.label, d.unit))
      ),
    [specs, attrDefs]
  )

  const addHighlight = () => {
    const t = highlightDraft.trim()
    if (!t) return
    if (highlights.length >= 10) {
      toast({ title: 'Too many highlights', description: 'Up to 10 bullet points', variant: 'destructive' })
      return
    }
    setHighlights([...highlights, t.slice(0, 160)])
    setHighlightDraft('')
  }

  const validate = (): string | null => {
    if (form.title.trim().length < 3) return 'Title must be at least 3 characters'
    if (form.description.trim().length < 10) return 'Write at least 10 characters of description'
    const price = num(form.price)
    if (!price || price <= 0) return 'Enter a valid price'
    if (!form.categoryId) return 'Pick a category'
    if (form.status === 'ACTIVE' && form.images.length === 0)
      return 'Add at least one image to publish (or save as a draft)'
    if (form.variants.length > 0 && form.variants.some((v) => v.stock <= 0))
      return 'Every variant needs stock greater than 0 (or remove it)'
    if (editing && reason.trim().length < 10)
      return 'A reason of at least 10 characters is required — it is audit-logged and shown to the seller'
    if (brandMode === 'existing' && !brandId) return 'Pick a brand (or set brand linkage to none)'
    if (brandMode === 'new' && brandName.trim().length < 2) return 'New brand names need at least 2 characters'
    return null
  }

  const submit = async (statusOverride?: string) => {
    const effectiveStatus = statusOverride ?? form.status
    const problem = validate()
    if (problem) {
      toast({ title: 'Check the form', description: problem, variant: 'destructive' })
      return
    }
    setSaving(true)
    try {
      const basePrice = num(form.price)!
      const origVariants = new Map((editing?.variants ?? []).map((v) => [v.id, v]))
      const product = {
        title: form.title.trim(),
        description: form.description.trim(),
        price: basePrice,
        compareAtPrice: num(form.compareAtPrice),
        categoryId: form.categoryId,
        stock: Math.max(0, parseInt(form.stock || '0', 10) || 0),
        images: form.images,
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
        lengthCm: num(form.lengthCm),
        widthCm: num(form.widthCm),
        heightCm: num(form.heightCm),
        processingDays: form.processingDays ? parseInt(form.processingDays, 10) : null,
        freeShipping: form.freeShipping,
        shippingFee: form.freeShipping ? null : num(form.shippingFee),
        shippingPolicy: form.shippingPolicy.trim() || null,
        slug: form.slug.trim() || null,
        metaTitle: form.metaTitle.trim() || null,
        metaDescription: form.metaDescription.trim() || null,
        moq: form.moq ? Math.max(1, parseInt(form.moq, 10) || 1) : null,
        priceTiers: tiers
          .filter((t) => t.from !== '' && t.price !== '')
          .map((t) => ({
            from: parseInt(t.from, 10),
            to: t.to === '' ? null : parseInt(t.to, 10),
            price: parseFloat(t.price),
          })),
        gtin: form.gtin.trim() || null,
        mpn: form.mpn.trim() || null,
        featured: form.featured,
        popularRank: form.popularRank ? Math.max(1, parseInt(form.popularRank, 10) || 1) : null,
        status: effectiveStatus,
        ...(brandMode === 'existing' ? { brandId } : brandMode === 'new' ? { brandName: brandName.trim() } : { brandId: null }),
        variants: form.variants.map((v) => {
          const absolute = Math.round((basePrice + v.priceDelta) * 100) / 100
          return {
            name: Object.values(v.options).join(' / ') || v.sku || 'Variant',
            options: v.options,
            price: absolute > 0 ? absolute : null,
            // preserve an untouched variant's compare-at (editor has no field for it)
            compareAtPrice: v.id ? origVariants.get(v.id)?.compareAtPrice ?? null : null,
            stock: v.stock,
            sku: v.sku.trim() || null,
            ...(v.id ? { id: v.id } : {}),
          }
        }),
      }

      const res = editing
        ? await apiRequest<{ product: ProductDTO }>(`/api/admin/products/${editing.id}`, {
            method: 'PUT',
            body: JSON.stringify({ reason: reason.trim(), product }),
          })
        : await apiRequest<{ product: ProductDTO }>('/api/admin/products', {
            method: 'POST',
            body: JSON.stringify(product),
          })

      if (!res.ok) {
        toastApiError(res.error, editing ? 'Update failed' : 'Create failed')
        return
      }
      toast({
        title: editing ? 'Listing updated' : effectiveStatus === 'DRAFT' ? 'Curated draft saved' : 'Curated record published',
        description: editing
          ? `"${form.title}" — changes audit-logged${editing.sellerId ? ' and the seller notified' : ''}.`
          : `"${form.title}" — a Vendora catalog record; vendors attach their offers to it.`,
      })
      onOpenChange(false)
      onSaved()
    } catch {
      toast({ title: 'Save failed', description: 'Network error', variant: 'destructive' })
    } finally {
      setSaving(false)
    }
  }

  const tabCount = {
    variants: form.variants.length,
    specs: specs.length,
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92vh] overflow-y-auto scrollbar-thin sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {editing ? (
              <>
                <Pencil size={16} className="text-primary" /> Admin edit — {editing.title}
              </>
            ) : (
              <>
                <Plus size={16} className="text-primary" /> New catalog record
              </>
            )}
          </DialogTitle>
          <DialogDescription>
            {editing
              ? 'Full-field platform override. Every change lands in the audit log with your reason.'
              : 'Create a curated Vendora catalog record — sellers attach their offers to it.'}
          </DialogDescription>
        </DialogHeader>

        {/* Admin-mode banners */}
        {!editing ? (
          <div className="flex items-start gap-2.5 rounded-xl border border-primary/30 bg-primary/10 px-3.5 py-2.5 text-xs leading-relaxed">
            <ShieldCheck size={15} className="mt-0.5 shrink-0 text-primary" />
            <p>
              <span className="font-semibold">Create as curated Vendora catalog record.</span> It is owned by the
              platform (no seller), is never directly purchasable, and goes live for buyers once a vendor attaches an
              ACTIVE offer to it.
            </p>
          </div>
        ) : editing.sellerId ? (
          <div className="flex items-start gap-2.5 rounded-xl border border-amber-300/60 bg-amber-50 px-3.5 py-2.5 text-xs leading-relaxed dark:border-amber-500/30 dark:bg-amber-950/40">
            <Info size={15} className="mt-0.5 shrink-0 text-amber-600 dark:text-amber-400" />
            <p>
              This listing belongs to{' '}
              <span className="font-semibold">
                {editing.seller?.storeName?.trim() || editing.seller?.name || 'a seller'}
              </span>
              . Your edits are recorded as a field-level diff and the seller is notified with your reason.
            </p>
          </div>
        ) : (
          <div className="flex items-start gap-2.5 rounded-xl border border-primary/30 bg-primary/10 px-3.5 py-2.5 text-xs leading-relaxed">
            <ShieldCheck size={15} className="mt-0.5 shrink-0 text-primary" />
            <p>
              Curated platform record (no seller of record). Vendors attach ACTIVE offers to make it purchasable.
            </p>
          </div>
        )}

        <Tabs value={tab} onValueChange={setTab} className="gap-4">
          <TabsList className="h-11 w-full justify-start gap-1 overflow-x-auto rounded-xl bg-muted/60 p-1">
            <TabsTrigger value="basics" className="gap-1.5 rounded-lg px-3 text-xs sm:text-sm">
              <FileText size={13} /> Basics
            </TabsTrigger>
            <TabsTrigger value="pricing" className="gap-1.5 rounded-lg px-3 text-xs sm:text-sm">
              <Package size={13} /> Pricing & stock
            </TabsTrigger>
            <TabsTrigger value="media" className="gap-1.5 rounded-lg px-3 text-xs sm:text-sm">
              <ImagePlus size={13} /> Media
            </TabsTrigger>
            <TabsTrigger value="variants" className="gap-1.5 rounded-lg px-3 text-xs sm:text-sm">
              <Boxes size={13} /> Variants
              {tabCount.variants > 0 && (
                <Badge variant="secondary" className="ml-0.5 rounded-full px-1.5 text-[10px]">
                  {tabCount.variants}
                </Badge>
              )}
            </TabsTrigger>
            <TabsTrigger value="details" className="gap-1.5 rounded-lg px-3 text-xs sm:text-sm">
              <BadgeCheck size={13} /> Details
              {tabCount.specs > 0 && (
                <Badge variant="secondary" className="ml-0.5 rounded-full px-1.5 text-[10px]">
                  {tabCount.specs}
                </Badge>
              )}
            </TabsTrigger>
            <TabsTrigger value="shipping" className="gap-1.5 rounded-lg px-3 text-xs sm:text-sm">
              <Truck size={13} /> Shipping
            </TabsTrigger>
            <TabsTrigger value="seo" className="gap-1.5 rounded-lg px-3 text-xs sm:text-sm">
              <Search size={13} /> SEO
            </TabsTrigger>
          </TabsList>

          {/* ── Basics ── */}
          <TabsContent value="basics" className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="ap-title">Title</Label>
              <Input
                id="ap-title"
                value={form.title}
                onChange={(e) => set('title', e.target.value)}
                placeholder="e.g. Trina Solar Vertex 550W Panel"
                maxLength={120}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="ap-desc">Description</Label>
              <Textarea
                id="ap-desc"
                value={form.description}
                onChange={(e) => set('description', e.target.value)}
                placeholder="Describe what it is, key specifications, what's in the box…"
                className="min-h-24"
                maxLength={4000}
              />
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label>Category</Label>
                <Select value={form.categoryId} onValueChange={(v) => set('categoryId', v)}>
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
                {selectedCategory && (
                  <p className="text-[11px] text-muted-foreground">The Details tab adapts to this category.</p>
                )}
              </div>
              <div className="space-y-1.5">
                <Label>Brand linkage</Label>
                <div className="flex gap-2">
                  <Select value={brandMode} onValueChange={(v) => setBrandMode(v as typeof brandMode)}>
                    <SelectTrigger className="w-32 shrink-0" aria-label="Brand mode">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">None</SelectItem>
                      <SelectItem value="existing">Existing</SelectItem>
                      <SelectItem value="new">Create new</SelectItem>
                    </SelectContent>
                  </Select>
                  {brandMode === 'existing' ? (
                    <Select value={brandId} onValueChange={setBrandId}>
                      <SelectTrigger className="min-w-0 flex-1" aria-label="Existing brand">
                        <SelectValue placeholder="Choose brand" />
                      </SelectTrigger>
                      <SelectContent>
                        {brands.map((b) => (
                          <SelectItem key={b.id} value={b.id}>
                            {b.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  ) : brandMode === 'new' ? (
                    <Input
                      value={brandName}
                      onChange={(e) => setBrandName(e.target.value)}
                      maxLength={80}
                      placeholder="e.g. Trina Solar"
                      className="min-w-0 flex-1"
                      aria-label="New brand name"
                    />
                  ) : (
                    <Input value="No brand linkage" disabled aria-readonly className="min-w-0 flex-1" />
                  )}
                </div>
              </div>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label>Status</Label>
                <Select value={form.status} onValueChange={(v) => set('status', v)}>
                  <SelectTrigger aria-label="Listing status">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="ACTIVE">Active — visible to buyers</SelectItem>
                    <SelectItem value="DRAFT">Draft — hidden</SelectItem>
                    <SelectItem value="ARCHIVED">Archived — hidden, preserved</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="ap-rank">
                  Popular rank <span className="text-xs text-muted-foreground">(homepage ordering, opt.)</span>
                </Label>
                <Input
                  id="ap-rank"
                  type="number"
                  min="1"
                  max="999"
                  value={form.popularRank}
                  onChange={(e) => set('popularRank', e.target.value)}
                  placeholder="1–999"
                />
              </div>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="ap-gtin">
                  GTIN <span className="text-xs text-muted-foreground">(EAN/UPC — dedup key)</span>
                </Label>
                <Input
                  id="ap-gtin"
                  value={form.gtin}
                  onChange={(e) => set('gtin', e.target.value)}
                  maxLength={20}
                  className="font-mono text-xs"
                  placeholder="6901234567890"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="ap-mpn">
                  MPN <span className="text-xs text-muted-foreground">(manufacturer part no.)</span>
                </Label>
                <Input
                  id="ap-mpn"
                  value={form.mpn}
                  onChange={(e) => set('mpn', e.target.value)}
                  maxLength={64}
                  className="font-mono text-xs"
                  placeholder="TSM-DE19"
                />
              </div>
            </div>
            <div className="flex items-center justify-between rounded-xl border p-3">
              <div>
                <Label htmlFor="ap-featured" className="text-sm">
                  Featured placement
                </Label>
                <p className="text-[11px] text-muted-foreground">Featured listings appear in storefront placements.</p>
              </div>
              <Switch
                id="ap-featured"
                checked={form.featured}
                onCheckedChange={(v) => set('featured', v)}
              />
            </div>
          </TabsContent>

          {/* ── Pricing & stock ── */}
          <TabsContent value="pricing" className="space-y-4">
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
              <div className="space-y-1.5">
                <Label htmlFor="ap-price">Price ($)</Label>
                <Input
                  id="ap-price"
                  type="number"
                  min="0.01"
                  step="0.01"
                  value={form.price}
                  onChange={(e) => set('price', e.target.value)}
                  placeholder="199.00"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="ap-compare">
                  Compare at <span className="text-xs text-muted-foreground">(opt.)</span>
                </Label>
                <Input
                  id="ap-compare"
                  type="number"
                  min="0"
                  step="0.01"
                  value={form.compareAtPrice}
                  onChange={(e) => set('compareAtPrice', e.target.value)}
                  placeholder="249.00"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="ap-stock">Stock</Label>
                <Input
                  id="ap-stock"
                  type="number"
                  min="0"
                  value={form.stock}
                  onChange={(e) => set('stock', e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="ap-sku">SKU</Label>
                <Input id="ap-sku" value={form.sku} onChange={(e) => set('sku', e.target.value)} maxLength={64} placeholder="VS-550W-TSM" />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="ap-barcode">Barcode / EAN</Label>
                <Input id="ap-barcode" value={form.barcode} onChange={(e) => set('barcode', e.target.value)} maxLength={64} placeholder="5901234123457" />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="ap-moq">
                  MOQ <span className="text-xs text-muted-foreground">(opt.)</span>
                </Label>
                <Input id="ap-moq" type="number" min="1" value={form.moq} onChange={(e) => set('moq', e.target.value)} placeholder="e.g. 10" />
              </div>
            </div>

            {/* Quantity-break price tiers */}
            <div className="space-y-2">
              <Label className="text-xs font-medium">
                Quantity-break price tiers <span className="font-normal text-muted-foreground">(applied in quotes)</span>
              </Label>
              {tiers.length > 0 && (
                <div className="overflow-hidden rounded-xl border">
                  <div className="grid grid-cols-[1fr_1fr_1fr_32px] items-center gap-2 bg-muted/60 px-3 py-2 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                    <span>From qty</span>
                    <span>To qty</span>
                    <span>Unit price</span>
                    <span />
                  </div>
                  <div className="divide-y">
                    {tiers.map((t) => (
                      <div key={t.id} className="grid grid-cols-[1fr_1fr_1fr_32px] items-center gap-2 px-3 py-2">
                        <Input
                          type="number"
                          min="1"
                          value={t.from}
                          onChange={(e) => setTiers((rows) => rows.map((r) => (r.id === t.id ? { ...r, from: e.target.value } : r)))}
                          className="h-8 px-2 text-xs"
                          aria-label="Tier from quantity"
                        />
                        <Input
                          type="number"
                          min="1"
                          value={t.to}
                          onChange={(e) => setTiers((rows) => rows.map((r) => (r.id === t.id ? { ...r, to: e.target.value } : r)))}
                          className="h-8 px-2 text-xs"
                          aria-label="Tier to quantity"
                        />
                        <Input
                          type="number"
                          min="0.01"
                          step="0.01"
                          value={t.price}
                          onChange={(e) => setTiers((rows) => rows.map((r) => (r.id === t.id ? { ...r, price: e.target.value } : r)))}
                          className="h-8 px-2 text-xs"
                          aria-label="Tier unit price"
                        />
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 text-muted-foreground hover:text-destructive"
                          onClick={() => setTiers((rows) => rows.filter((r) => r.id !== t.id))}
                          aria-label="Remove tier"
                        >
                          <X size={13} />
                        </Button>
                      </div>
                    ))}
                  </div>
                </div>
              )}
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-8 rounded-lg"
                onClick={() => setTiers((rows) => [...rows, { id: uid(), from: '', to: '', price: '' }])}
                disabled={tiers.length >= 20}
              >
                <Plus size={13} className="mr-1" /> Add tier
              </Button>
            </div>
          </TabsContent>

          {/* ── Media (forceMount keeps upload queue + library alive across tabs) ── */}
          <TabsContent value="media" forceMount className="hidden space-y-4 data-[state=active]:block">
            <MediaTab images={form.images} onChange={(images) => set('images', images)} />
            <div className="space-y-1.5">
              <Label htmlFor="ap-video">
                Video URL <span className="text-xs text-muted-foreground">(optional)</span>
              </Label>
              <Input
                id="ap-video"
                value={form.videoUrl}
                onChange={(e) => set('videoUrl', e.target.value)}
                placeholder="https://…"
                maxLength={512}
              />
            </div>
          </TabsContent>

          {/* ── Variants ── */}
          <TabsContent value="variants">
            <VariantEditor
              groups={form.variantGroups}
              onGroupsChange={(g) => set('variantGroups', g)}
              variants={form.variants}
              onChange={(v) => set('variants', v)}
            />
          </TabsContent>

          {/* ── Details: highlights + structured/custom specs ── */}
          <TabsContent value="details" className="space-y-5">
            <div className="space-y-2">
              <Label className="text-xs font-medium">
                Highlights <span className="font-normal text-muted-foreground">(bullet points on the listing)</span>
              </Label>
              <div className="flex gap-2">
                <Input
                  value={highlightDraft}
                  onChange={(e) => setHighlightDraft(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault()
                      addHighlight()
                    }
                  }}
                  placeholder="e.g. 25-year performance warranty"
                  maxLength={160}
                  aria-label="New highlight"
                />
                <Button type="button" variant="outline" onClick={addHighlight} aria-label="Add highlight">
                  <Plus size={14} />
                </Button>
              </div>
              {highlights.length > 0 && (
                <div className="space-y-1.5">
                  {highlights.map((h, i) => (
                    <div
                      key={`${h}-${i}`}
                      className="flex items-center gap-2 rounded-xl border bg-muted/30 px-3 py-2 text-xs"
                    >
                      <span className="min-w-0 flex-1">{h}</span>
                      <button
                        type="button"
                        onClick={() => setHighlights((rows) => rows.filter((_, idx) => idx !== i))}
                        className="text-muted-foreground transition-colors hover:text-destructive"
                        aria-label={`Remove highlight ${i + 1}`}
                      >
                        <Trash2 size={13} />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {selectedCategory && attrDefs.length > 0 && (
              <div className="space-y-3">
                <div>
                  <Label className="text-xs font-medium">
                    {selectedCategory.name} specifications <span className="font-normal text-muted-foreground">(structured)</span>
                  </Label>
                  <p className="text-[11px] text-muted-foreground">
                    Saved as the specification sheet buyers see on the product page.
                  </p>
                </div>
                <AttributeFields
                  defs={attrDefs}
                  idPrefix="ap-attr"
                  values={Object.fromEntries(
                    attrDefs.map((d) => [d.key, (attrValue(d.label, d.unit) || undefined) as AttributeValue | undefined])
                  )}
                  onChange={(key, value) => {
                    const def = attrDefs.find((d) => d.key === key)
                    if (!def) return
                    setAttrValue(def.label, def.unit, value === undefined ? '' : String(value))
                  }}
                />
              </div>
            )}

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="ap-materials">
                  Materials <span className="text-xs text-muted-foreground">(opt.)</span>
                </Label>
                <Input
                  id="ap-materials"
                  value={form.materials}
                  onChange={(e) => set('materials', e.target.value)}
                  maxLength={500}
                  placeholder="e.g. Monocrystalline silicon, anodized aluminium frame"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="ap-care">
                  Care & handling <span className="text-xs text-muted-foreground">(opt.)</span>
                </Label>
                <Input
                  id="ap-care"
                  value={form.care}
                  onChange={(e) => set('care', e.target.value)}
                  maxLength={500}
                  placeholder="e.g. Keep terminals dry; yearly inspection"
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label className="text-xs font-medium">
                Custom specifications <span className="font-normal text-muted-foreground">(label → value)</span>
              </Label>
              {customSpecRows.length > 0 && (
                <div className="space-y-1.5">
                  {customSpecRows.map((s) => (
                    <div key={s.id} className="grid grid-cols-[1fr_1fr_32px] items-center gap-2">
                      <Input
                        value={s.label}
                        onChange={(e) => setSpecs((rows) => rows.map((r) => (r.id === s.id ? { ...r, label: e.target.value } : r)))}
                        placeholder="Label (e.g. Efficiency)"
                        className="h-9 text-xs"
                        aria-label="Spec label"
                        maxLength={60}
                      />
                      <Input
                        value={s.value}
                        onChange={(e) => setSpecs((rows) => rows.map((r) => (r.id === s.id ? { ...r, value: e.target.value } : r)))}
                        placeholder="Value (e.g. 21.2%)"
                        className="h-9 text-xs"
                        aria-label="Spec value"
                        maxLength={200}
                      />
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 text-muted-foreground hover:text-destructive"
                        onClick={() => setSpecs((rows) => rows.filter((r) => r.id !== s.id))}
                        aria-label="Remove spec"
                      >
                        <X size={13} />
                      </Button>
                    </div>
                  ))}
                </div>
              )}
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-8 rounded-lg"
                onClick={() => setSpecs((rows) => [...rows, { id: uid(), label: '', value: '' }])}
                disabled={specs.length >= 12}
              >
                <Plus size={13} className="mr-1" /> Add spec
              </Button>
            </div>
          </TabsContent>

          {/* ── Shipping ── */}
          <TabsContent value="shipping" className="space-y-4">
            <div className="flex items-center justify-between rounded-xl border p-3">
              <div>
                <Label htmlFor="ap-free" className="text-sm">
                  Free shipping
                </Label>
                <p className="text-[11px] text-muted-foreground">Reference shipping policy for the catalog record.</p>
              </div>
              <Switch id="ap-free" checked={form.freeShipping} onCheckedChange={(v) => set('freeShipping', v)} />
            </div>
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
              <div className="space-y-1.5">
                <Label htmlFor="ap-processing">Processing days</Label>
                <Input
                  id="ap-processing"
                  type="number"
                  min="1"
                  max="30"
                  value={form.processingDays}
                  onChange={(e) => set('processingDays', e.target.value)}
                  placeholder="—"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="ap-fee">
                  Shipping fee <span className="text-xs text-muted-foreground">(opt.)</span>
                </Label>
                <Input
                  id="ap-fee"
                  type="number"
                  min="0"
                  step="0.01"
                  value={form.shippingFee}
                  onChange={(e) => set('shippingFee', e.target.value)}
                  disabled={form.freeShipping}
                  placeholder="—"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="ap-weight">Weight (g)</Label>
                <Input
                  id="ap-weight"
                  type="number"
                  min="1"
                  value={form.weightGrams}
                  onChange={(e) => set('weightGrams', e.target.value)}
                  placeholder="e.g. 350"
                />
              </div>
            </div>
            <div className="grid grid-cols-3 gap-4">
              <div className="space-y-1.5">
                <Label htmlFor="ap-l">Length (cm)</Label>
                <Input id="ap-l" type="number" min="0" step="0.1" value={form.lengthCm} onChange={(e) => set('lengthCm', e.target.value)} placeholder="—" />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="ap-w">Width (cm)</Label>
                <Input id="ap-w" type="number" min="0" step="0.1" value={form.widthCm} onChange={(e) => set('widthCm', e.target.value)} placeholder="—" />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="ap-h">Height (cm)</Label>
                <Input id="ap-h" type="number" min="0" step="0.1" value={form.heightCm} onChange={(e) => set('heightCm', e.target.value)} placeholder="—" />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="ap-shipolicy">
                Shipping policy <span className="text-xs text-muted-foreground">(optional)</span>
              </Label>
              <Textarea
                id="ap-shipolicy"
                value={form.shippingPolicy}
                onChange={(e) => set('shippingPolicy', e.target.value)}
                className="min-h-16"
                maxLength={1000}
                placeholder="e.g. FOB Aden; container consolidation available…"
              />
            </div>
          </TabsContent>

          {/* ── SEO ── */}
          <TabsContent value="seo" className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="ap-slug">
                URL slug <span className="text-xs text-muted-foreground">(auto from title when empty)</span>
              </Label>
              <Input
                id="ap-slug"
                value={form.slug}
                onChange={(e) => set('slug', e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, '-'))}
                placeholder="trina-solar-vertex-550w"
                maxLength={180}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="ap-mtitle">
                Meta title <span className="text-xs text-muted-foreground">({form.metaTitle.length}/60)</span>
              </Label>
              <Input
                id="ap-mtitle"
                value={form.metaTitle}
                onChange={(e) => set('metaTitle', e.target.value)}
                maxLength={150}
                placeholder="Overrides the title for search engines & shares"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="ap-mdesc">
                Meta description <span className="text-xs text-muted-foreground">({form.metaDescription.length}/155)</span>
              </Label>
              <Textarea
                id="ap-mdesc"
                value={form.metaDescription}
                onChange={(e) => set('metaDescription', e.target.value)}
                className="min-h-16"
                maxLength={320}
                placeholder="A short summary shown under the title in search results"
              />
            </div>
          </TabsContent>
        </Tabs>

        {/* Mandatory reason on edit — audit + seller notification */}
        {editing && (
          <div className="space-y-1.5 rounded-xl border border-amber-300/60 bg-amber-50/60 p-3 dark:border-amber-500/30 dark:bg-amber-950/30">
            <Label htmlFor="ap-reason" className="text-xs font-semibold">
              Reason for this edit <span className="text-rose-600 dark:text-rose-400">*</span>
            </Label>
            <Textarea
              id="ap-reason"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              className="min-h-14 bg-background"
              maxLength={1000}
              placeholder="Why is the platform changing this listing? (min 10 characters — audit-logged, sent to the seller)"
            />
            <p className="text-[11px] text-muted-foreground">
              {reason.trim().length < 10
                ? `${reason.trim().length}/10 characters minimum`
                : `${reason.trim().length} characters`}
            </p>
          </div>
        )}

        <DialogFooter className="gap-2 border-t pt-4">
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          {!editing && (
            <Button type="button" variant="ghost" disabled={saving} onClick={() => submit('DRAFT')}>
              Save as draft
            </Button>
          )}
          <Button type="button" disabled={saving} className="min-w-32" onClick={() => submit(editing ? undefined : 'ACTIVE')}>
            {saving && <Loader2 size={14} className="mr-1.5 animate-spin" />}
            {editing ? 'Save changes' : 'Create catalog record'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
