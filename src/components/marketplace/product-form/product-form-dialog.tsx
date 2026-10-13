'use client'

import { useEffect, useMemo, useState } from 'react'
import {
  BadgeCheck,
  Boxes,
  FileText,
  ImagePlus,
  Loader2,
  Package,
  Plus,
  Search,
  Tag,
  Truck,
  X,
} from 'lucide-react'
import { toast } from '@/hooks/use-toast'
import { useMarketplace } from '@/store/marketplace'
import type { AttributeValue } from '@/lib/catalog/definitions'
import { attributesForCategory, CONDITIONS } from '@/lib/catalog/definitions'
import type { CategoryDTO, ProductDTO, ProductVariantDTO } from '@/lib/types'
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
import { AttributeFields } from './attribute-fields'
import { MediaTab } from './media-tab'
import { VariantEditor, type VariantDraft } from './variant-editor'

interface VariantGroupDraft {
  name: string
  values: string[]
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

interface FormState {
  title: string
  description: string
  categoryId: string
  brand: string
  condition: string
  tags: string[]
  price: string
  compareAtPrice: string
  stock: string
  sku: string
  barcode: string
  minOrderQty: string
  maxPerOrder: string
  status: string
  images: string[]
  videoUrl: string
  variants: VariantDraft[]
  variantGroups: VariantGroupDraft[]
  freeShipping: boolean
  shippingNote: string
  handlingDays: string
  weightKg: string
  lengthCm: string
  widthCm: string
  heightCm: string
  warrantyMonths: string
  slug: string
  metaTitle: string
  metaDescription: string
}

const emptyForm: FormState = {
  title: '',
  description: '',
  categoryId: '',
  brand: '',
  condition: 'NEW',
  tags: [],
  price: '',
  compareAtPrice: '',
  stock: '10',
  sku: '',
  barcode: '',
  minOrderQty: '1',
  maxPerOrder: '',
  status: 'ACTIVE',
  images: [],
  videoUrl: '',
  variants: [],
  variantGroups: [],
  freeShipping: false,
  shippingNote: '',
  handlingDays: '2',
  weightKg: '',
  lengthCm: '',
  widthCm: '',
  heightCm: '',
  warrantyMonths: '',
  slug: '',
  metaTitle: '',
  metaDescription: '',
}

function fromProduct(p: ProductDTO): FormState {
  return {
    title: p.title,
    description: p.description,
    categoryId: p.categoryId,
    brand: p.brand?.name ?? '',
    condition: p.condition || 'NEW',
    tags: [...(p.tags ?? [])],
    price: String(p.price),
    compareAtPrice: p.compareAtPrice ? String(p.compareAtPrice) : '',
    stock: String(p.stock),
    sku: p.sku ?? '',
    barcode: p.barcode ?? '',
    minOrderQty: String(p.minOrderQty ?? 1),
    maxPerOrder: p.maxPerOrder ? String(p.maxPerOrder) : '',
    status: p.status,
    images: [...p.images],
    videoUrl: p.videoUrl ?? '',
    variants: (p.variants ?? []).map((v) => ({
      id: v.id,
      options: v.options,
      stock: v.stock,
      priceDelta: (v as ProductVariantDTO & { priceDelta?: number }).priceDelta ?? 0,
      sku: v.sku ?? '',
    })),
    variantGroups: groupsFromVariants(p.variants ?? []),
    freeShipping: p.freeShipping ?? false,
    shippingNote: p.shippingNote ?? '',
    handlingDays: String(p.handlingDays ?? 2),
    weightKg: p.weightKg != null ? String(p.weightKg) : '',
    lengthCm: p.lengthCm != null ? String(p.lengthCm) : '',
    widthCm: p.widthCm != null ? String(p.widthCm) : '',
    heightCm: p.heightCm != null ? String(p.heightCm) : '',
    warrantyMonths: p.warrantyMonths != null ? String(p.warrantyMonths) : '',
    slug: p.slug ?? '',
    metaTitle: p.metaTitle ?? '',
    metaDescription: p.metaDescription ?? '',
  }
}

const num = (s: string): number | null => (s.trim() === '' ? null : Number(s))
const numOr = (s: string, d: number): number => {
  const n = Number(s)
  return Number.isFinite(n) && s.trim() !== '' ? n : d
}

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
  const [form, setForm] = useState<FormState>(emptyForm)
  const [attributes, setAttributes] = useState<Record<string, AttributeValue | undefined>>({})
  const [tagDraft, setTagDraft] = useState('')
  const [saving, setSaving] = useState(false)
  const [tab, setTab] = useState('basics')

  const selectedCategory = useMemo(
    () => categories.find((c) => c.id === form.categoryId),
    [categories, form.categoryId]
  )
  const attrDefs = useMemo(
    () => (selectedCategory ? attributesForCategory(selectedCategory.slug) : []),
    [selectedCategory]
  )

  useEffect(() => {
    if (open) {
      setForm(editing ? fromProduct(editing) : emptyForm)
      setAttributes(
        editing
          ? Object.fromEntries(
              Object.entries(editing.attributes ?? {}).filter(([, v]) => v !== null && v !== undefined)
            )
          : {}
      )
      setTagDraft('')
      setTab('basics')
    }
  }, [open, editing])

  const set = <K extends keyof FormState>(key: K, value: FormState[K]) =>
    setForm((f) => ({ ...f, [key]: value }))

  const addTag = (raw: string) => {
    const t = raw.trim().toLowerCase().replace(/\s+/g, '-')
    if (!t || form.tags.includes(t) || form.tags.length >= 15) return
    set('tags', [...form.tags, t])
  }

  const validate = (): string | null => {
    if (form.title.trim().length < 3) return 'Title must be at least 3 characters'
    if (form.description.trim().length < 10) return 'Write at least 10 characters of description'
    const price = num(form.price)
    if (!price || price <= 0) return 'Enter a valid price'
    if (!form.categoryId) return 'Pick a category'
    if (form.images.length === 0) return 'Add at least one image (upload, library, URL or sample)'
    if (form.variants.length > 0 && form.variants.some((v) => v.stock <= 0))
      return 'Every variant needs stock greater than 0 (or remove it)'
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
      const payload = {
        title: form.title.trim(),
        description: form.description.trim(),
        price: num(form.price)!,
        compareAtPrice: num(form.compareAtPrice),
        categoryId: form.categoryId,
        stock: Math.max(0, parseInt(form.stock || '0', 10) || 0),
        images: form.images,
        brand: form.brand.trim() || null,
        sku: form.sku.trim() || null,
        barcode: form.barcode.trim() || null,
        condition: form.condition,
        tags: form.tags,
        videoUrl: form.videoUrl.trim() || null,
        freeShipping: form.freeShipping,
        shippingNote: form.shippingNote.trim() || null,
        handlingDays: numOr(form.handlingDays, 2),
        weightKg: num(form.weightKg),
        lengthCm: num(form.lengthCm),
        widthCm: num(form.widthCm),
        heightCm: num(form.heightCm),
        minOrderQty: Math.max(1, numOr(form.minOrderQty, 1)),
        maxPerOrder: num(form.maxPerOrder),
        warrantyMonths: num(form.warrantyMonths),
        slug: form.slug.trim() || null,
        metaTitle: form.metaTitle.trim() || null,
        metaDescription: form.metaDescription.trim() || null,
        status: effectiveStatus,
        attributes: Object.fromEntries(
          Object.entries(attributes).filter(([, v]) => v !== undefined && v !== '')
        ),
        variants: form.variants.map((v) => ({
          name: Object.values(v.options).join(' / '),
          options: v.options,
          priceDelta: v.priceDelta,
          sku: v.sku.trim() || null,
          stock: v.stock,
          image: null,
          ...(v.id ? { id: v.id } : {}),
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
        title: editing ? 'Product updated' : effectiveStatus === 'DRAFT' ? 'Draft saved' : 'Product published',
        description: form.title,
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
    details: Object.values(attributes).filter((v) => v !== undefined && v !== '' && !(Array.isArray(v) && v.length === 0)).length,
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92vh] overflow-y-auto scrollbar-thin sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>{editing ? 'Edit product' : 'Add new product'}</DialogTitle>
          <DialogDescription>
            {editing
              ? 'Update your listing — all sections save together.'
              : 'Fill in the details section by section, then publish or save as draft.'}
          </DialogDescription>
        </DialogHeader>

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
              {tabCount.details > 0 && (
                <Badge variant="secondary" className="ml-0.5 rounded-full px-1.5 text-[10px]">
                  {tabCount.details}
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
              <Label htmlFor="p-title">Title</Label>
              <Input
                id="p-title"
                value={form.title}
                onChange={(e) => set('title', e.target.value)}
                placeholder="e.g. Handmade Ceramic Mug"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="p-desc">Description</Label>
              <Textarea
                id="p-desc"
                value={form.description}
                onChange={(e) => set('description', e.target.value)}
                placeholder="Describe materials, dimensions, what makes it special…"
                className="min-h-24"
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
                  <p className="text-[11px] text-muted-foreground">
                    The Details tab adapts to this category.
                  </p>
                )}
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="p-brand">Brand</Label>
                <Input
                  id="p-brand"
                  value={form.brand}
                  onChange={(e) => set('brand', e.target.value)}
                  placeholder="e.g. Wildbloom Home"
                />
              </div>
              <div className="space-y-1.5">
                <Label>Condition</Label>
                <Select value={form.condition} onValueChange={(v) => set('condition', v)}>
                  <SelectTrigger aria-label="Condition">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {CONDITIONS.map((c) => (
                      <SelectItem key={c.value} value={c.value}>
                        {c.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="p-tags">Tags</Label>
              <div className="flex gap-2">
                <Input
                  id="p-tags"
                  value={tagDraft}
                  onChange={(e) => setTagDraft(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault()
                      addTag(tagDraft)
                      setTagDraft('')
                    }
                  }}
                  placeholder="Type a tag and press Enter (e.g. ceramic, gift)"
                />
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => {
                    addTag(tagDraft)
                    setTagDraft('')
                  }}
                >
                  <Plus size={14} />
                </Button>
              </div>
              {form.tags.length > 0 && (
                <div className="flex flex-wrap gap-1.5 pt-1">
                  {form.tags.map((t) => (
                    <span
                      key={t}
                      className="inline-flex items-center gap-1 rounded-full bg-muted px-2.5 py-1 text-xs"
                    >
                      <Tag size={10} className="text-primary/70" />
                      {t}
                      <button
                        type="button"
                        onClick={() => set('tags', form.tags.filter((x) => x !== t))}
                        className="text-muted-foreground transition-colors hover:text-destructive"
                        aria-label={`Remove tag ${t}`}
                      >
                        <X size={11} />
                      </button>
                    </span>
                  ))}
                </div>
              )}
            </div>
          </TabsContent>

          {/* ── Pricing & stock ── */}
          <TabsContent value="pricing" className="space-y-4">
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
              <div className="space-y-1.5">
                <Label htmlFor="p-price">Price ($)</Label>
                <Input
                  id="p-price"
                  type="number"
                  min="0.01"
                  step="0.01"
                  value={form.price}
                  onChange={(e) => set('price', e.target.value)}
                  placeholder="29.99"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="p-compare">
                  Compare at <span className="text-xs text-muted-foreground">(opt.)</span>
                </Label>
                <Input
                  id="p-compare"
                  type="number"
                  min="0"
                  step="0.01"
                  value={form.compareAtPrice}
                  onChange={(e) => set('compareAtPrice', e.target.value)}
                  placeholder="39.99"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="p-stock">Stock</Label>
                <Input
                  id="p-stock"
                  type="number"
                  min="0"
                  value={form.stock}
                  onChange={(e) => set('stock', e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="p-sku">SKU</Label>
                <Input id="p-sku" value={form.sku} onChange={(e) => set('sku', e.target.value)} placeholder="VN-ELC-001" />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="p-barcode">Barcode / EAN</Label>
                <Input
                  id="p-barcode"
                  value={form.barcode}
                  onChange={(e) => set('barcode', e.target.value)}
                  placeholder="5901234123457"
                />
              </div>
              <div className="space-y-1.5">
                <Label>Status</Label>
                <Select value={form.status} onValueChange={(v) => set('status', v)}>
                  <SelectTrigger aria-label="Listing status">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="ACTIVE">Active — visible to buyers</SelectItem>
                    <SelectItem value="DRAFT">Draft — hidden</SelectItem>
                    <SelectItem value="ARCHIVED">Archived</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label htmlFor="p-min">Min per order</Label>
                <Input
                  id="p-min"
                  type="number"
                  min="1"
                  value={form.minOrderQty}
                  onChange={(e) => set('minOrderQty', e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="p-max">
                  Max per order <span className="text-xs text-muted-foreground">(opt.)</span>
                </Label>
                <Input
                  id="p-max"
                  type="number"
                  min="1"
                  value={form.maxPerOrder}
                  onChange={(e) => set('maxPerOrder', e.target.value)}
                  placeholder="No limit"
                />
              </div>
            </div>
          </TabsContent>

          {/* ── Media (forceMount: keeps upload queue + library alive across tab switches) ── */}
          <TabsContent value="media" forceMount className="hidden space-y-4 data-[state=active]:block">
            <MediaTab images={form.images} onChange={(images) => set('images', images)} />
            <div className="space-y-1.5">
              <Label htmlFor="p-video">
                Video URL <span className="text-xs text-muted-foreground">(optional)</span>
              </Label>
              <Input
                id="p-video"
                value={form.videoUrl}
                onChange={(e) => set('videoUrl', e.target.value)}
                placeholder="https://…"
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

          {/* ── Details (dynamic per category) ── */}
          <TabsContent value="details">
            {selectedCategory ? (
              <div className="space-y-3">
                <p className="text-xs text-muted-foreground">
                  {selectedCategory.name}-specific details. These appear as a spec sheet on your
                  listing.
                </p>
                <AttributeFields
                  defs={attrDefs}
                  values={attributes}
                  onChange={(key, value) =>
                    setAttributes((a) => {
                      const next = { ...a }
                      if (value === undefined) delete next[key]
                      else next[key] = value
                      return next
                    })
                  }
                />
              </div>
            ) : (
              <p className="rounded-xl border border-dashed p-6 text-center text-sm text-muted-foreground">
                Pick a category in Basics first — its detail fields appear here.
              </p>
            )}
          </TabsContent>

          {/* ── Shipping ── */}
          <TabsContent value="shipping" className="space-y-4">
            <div className="flex items-center justify-between rounded-xl border p-3">
              <div>
                <Label htmlFor="p-free" className="text-sm">
                  Free shipping
                </Label>
                <p className="text-[11px] text-muted-foreground">
                  Buyers see a “Free shipping” badge on the listing.
                </p>
              </div>
              <Switch id="p-free" checked={form.freeShipping} onCheckedChange={(v) => set('freeShipping', v)} />
            </div>
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
              <div className="space-y-1.5">
                <Label htmlFor="p-handling">Handling days</Label>
                <Input
                  id="p-handling"
                  type="number"
                  min="0"
                  max="60"
                  value={form.handlingDays}
                  onChange={(e) => set('handlingDays', e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="p-weight">Weight (kg)</Label>
                <Input
                  id="p-weight"
                  type="number"
                  min="0"
                  step="0.1"
                  value={form.weightKg}
                  onChange={(e) => set('weightKg', e.target.value)}
                  placeholder="—"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="p-warranty">Warranty (mo)</Label>
                <Input
                  id="p-warranty"
                  type="number"
                  min="0"
                  max="120"
                  value={form.warrantyMonths}
                  onChange={(e) => set('warrantyMonths', e.target.value)}
                  placeholder="—"
                />
              </div>
            </div>
            <div className="grid grid-cols-3 gap-4">
              <div className="space-y-1.5">
                <Label htmlFor="p-l">Length (cm)</Label>
                <Input id="p-l" type="number" min="0" step="0.1" value={form.lengthCm} onChange={(e) => set('lengthCm', e.target.value)} placeholder="—" />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="p-w">Width (cm)</Label>
                <Input id="p-w" type="number" min="0" step="0.1" value={form.widthCm} onChange={(e) => set('widthCm', e.target.value)} placeholder="—" />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="p-h">Height (cm)</Label>
                <Input id="p-h" type="number" min="0" step="0.1" value={form.heightCm} onChange={(e) => set('heightCm', e.target.value)} placeholder="—" />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="p-shipnote">
                Shipping note <span className="text-xs text-muted-foreground">(optional)</span>
              </Label>
              <Input
                id="p-shipnote"
                value={form.shippingNote}
                onChange={(e) => set('shippingNote', e.target.value)}
                placeholder="e.g. Ships in eco-friendly packaging"
              />
            </div>
          </TabsContent>

          {/* ── SEO ── */}
          <TabsContent value="seo" className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="p-slug">
                URL slug <span className="text-xs text-muted-foreground">(auto from title when empty)</span>
              </Label>
              <Input
                id="p-slug"
                value={form.slug}
                onChange={(e) => set('slug', e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, '-'))}
                placeholder="handmade-ceramic-mug"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="p-mtitle">
                Meta title <span className="text-xs text-muted-foreground">({form.metaTitle.length}/60)</span>
              </Label>
              <Input
                id="p-mtitle"
                value={form.metaTitle}
                onChange={(e) => set('metaTitle', e.target.value)}
                placeholder="Overrides the title for search engines & shares"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="p-mdesc">
                Meta description <span className="text-xs text-muted-foreground">({form.metaDescription.length}/155)</span>
              </Label>
              <Textarea
                id="p-mdesc"
                value={form.metaDescription}
                onChange={(e) => set('metaDescription', e.target.value)}
                className="min-h-16"
                placeholder="A short summary shown under the title in search results"
              />
            </div>
          </TabsContent>
        </Tabs>

        <DialogFooter className="gap-2 border-t pt-4">
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          {!editing && (
            <Button type="button" variant="ghost" disabled={saving} onClick={() => submit('DRAFT')}>
              Save as draft
            </Button>
          )}
          <Button
            type="button"
            disabled={saving}
            className="min-w-32"
            onClick={() => submit(editing ? undefined : 'ACTIVE')}
          >
            {saving && <Loader2 size={14} className="mr-1.5 animate-spin" />}
            {editing ? 'Save changes' : 'Publish product'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
