'use client'

// ─────────────────────────────────────────────────────────────────────────────
// ADMIN CONSOLE → CATALOG LISTINGS (Phase 4).
// Platform-curated products owned by the "Vendora Catalog" system account —
// the "what it is" layer sellers attach offers to. Create curated listings,
// clone any listing into a curated draft, or bulk-import a CSV.
// ─────────────────────────────────────────────────────────────────────────────

import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  CheckCircle2,
  Copy,
  FileSpreadsheet,
  Layers,
  Loader2,
  Plus,
  ShieldAlert,
} from 'lucide-react'
import { toast } from '@/hooks/use-toast'
import { formatUSD } from '@/lib/format'
import type { ProductDTO } from '@/lib/types'
import { Badge } from '@/components/ui/badge'
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Skeleton } from '@/components/ui/skeleton'
import { Textarea } from '@/components/ui/textarea'
import { cn } from '@/lib/utils'
import { AdminEmptyState, apiRequest, toastApiError } from '../shared'

interface CategoryRow {
  id: string
  name: string
}

interface BrandRow {
  id: string
  name: string
}

const STATUS_CHIP: Record<string, string> = {
  ACTIVE: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300',
  DRAFT: 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300',
  PENDING_REVIEW: 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300',
  REJECTED: 'bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-300',
  ARCHIVED: 'bg-neutral-200 text-neutral-600 dark:bg-neutral-800 dark:text-neutral-400',
}

const CSV_COLUMNS = 'title, category, brand, price, stock, moq, sku, gtin, mpn, description, imageUrl'

interface ImportRow {
  row: number
  status: 'created' | 'failed'
  id?: string
  error?: string
}

// ── New curated listing dialog ────────────────────────────────────────────────

function CuratedProductDialog({ open, onOpenChange, onSaved }: { open: boolean; onOpenChange: (o: boolean) => void; onSaved: () => void }) {
  const [categories, setCategories] = useState<CategoryRow[]>([])
  const [brands, setBrands] = useState<BrandRow[]>([])

  const [title, setTitle] = useState('')
  const [categoryId, setCategoryId] = useState('')
  const [brandMode, setBrandMode] = useState<'none' | 'existing' | 'new'>('none')
  const [brandId, setBrandId] = useState('')
  const [brandName, setBrandName] = useState('')
  const [price, setPrice] = useState('')
  const [compareAtPrice, setCompareAtPrice] = useState('')
  const [stock, setStock] = useState('')
  const [moq, setMoq] = useState('')
  const [sku, setSku] = useState('')
  const [gtin, setGtin] = useState('')
  const [mpn, setMpn] = useState('')
  const [description, setDescription] = useState('')
  const [imagesText, setImagesText] = useState('')
  const [status, setStatus] = useState<'DRAFT' | 'ACTIVE'>('DRAFT')
  const [popularRank, setPopularRank] = useState('')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (!open) return
    void (async () => {
      const [catRes, brandRes] = await Promise.all([
        apiRequest<{ categories: CategoryRow[] }>('/api/admin/categories'),
        apiRequest<{ brands: BrandRow[] }>('/api/admin/catalog/brands'),
      ])
      if (catRes.ok && catRes.data) setCategories(catRes.data.categories)
      if (brandRes.ok && brandRes.data) setBrands(brandRes.data.brands)
    })()
  }, [open])

  const save = async () => {
    const images = imagesText.split('\n').map((l) => l.trim()).filter(Boolean).slice(0, 6)
    if (title.trim().length < 3) return toast({ title: 'Title too short', description: 'Give the listing a title (3–120 characters)', variant: 'destructive' })
    if (!categoryId) return toast({ title: 'Pick a category', description: 'Curated listings always belong to a category', variant: 'destructive' })
    if (description.trim().length < 10) return toast({ title: 'Description too short', description: 'At least 10 characters — buyers read this', variant: 'destructive' })
    const priceNum = Number(price)
    if (!Number.isFinite(priceNum) || priceNum <= 0) return toast({ title: 'Invalid price', description: 'Price must be a positive number', variant: 'destructive' })
    if (status === 'ACTIVE' && images.length === 0)
      return toast({ title: 'Image required to publish', description: 'Add at least one image URL — or save as a draft instead', variant: 'destructive' })
    if (brandMode === 'existing' && !brandId) return toast({ title: 'Pick a brand', description: 'Choose an existing brand or switch to “new brand”', variant: 'destructive' })
    if (brandMode === 'new' && brandName.trim().length < 2)
      return toast({ title: 'Brand name too short', description: 'New brand names need at least 2 characters', variant: 'destructive' })

    const body: Record<string, unknown> = {
      title: title.trim(),
      description: description.trim(),
      price: priceNum,
      images,
      categoryId,
      status,
      stock: stock ? Math.max(0, parseInt(stock, 10) || 0) : undefined,
      compareAtPrice: compareAtPrice ? Number(compareAtPrice) : null,
      moq: moq ? Math.max(1, parseInt(moq, 10) || 1) : null,
      sku: sku.trim() || null,
      gtin: gtin.trim() || null,
      mpn: mpn.trim() || null,
      popularRank: popularRank ? Math.max(1, parseInt(popularRank, 10) || 1) : null,
      ...(brandMode === 'existing' ? { brandId } : brandMode === 'new' ? { brandName: brandName.trim() } : {}),
    }

    setSaving(true)
    const res = await apiRequest<{ product: ProductDTO }>('/api/admin/catalog/products', {
      method: 'POST',
      body: JSON.stringify(body),
    })
    setSaving(false)
    if (!res.ok) {
      toastApiError(res.error, 'Could not create the listing')
      return
    }
    toast({
      title: 'Curated listing created',
      description: `${res.data?.product.title ?? title.trim()} — owned by the Vendora Catalog account.`,
    })
    onOpenChange(false)
    onSaved()
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[88vh] overflow-y-auto scrollbar-thin sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>New curated listing</DialogTitle>
          <DialogDescription>
            Platform-owned product — sellers attach their offers to it (the multi-vendor model). Owned by the
            Vendora Catalog system account.
          </DialogDescription>
        </DialogHeader>
        {open && (
          <div className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="cp-title">Title *</Label>
                <Input id="cp-title" value={title} onChange={(e) => setTitle(e.target.value)} maxLength={120} placeholder="e.g. Trina Solar Vertex 550W Panel" />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="cp-category">Category *</Label>
                <Select value={categoryId} onValueChange={setCategoryId}>
                  <SelectTrigger id="cp-category" aria-label="Category">
                    <SelectValue placeholder="Pick a category" />
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
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label>Brand</Label>
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
                    <Input value={brandName} onChange={(e) => setBrandName(e.target.value)} maxLength={80} placeholder="e.g. Trina Solar" className="min-w-0 flex-1" />
                  ) : (
                    <Input value="No brand linkage" disabled aria-readonly className="min-w-0 flex-1" />
                  )}
                </div>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="cp-status">Status</Label>
                <Select value={status} onValueChange={(v) => setStatus(v as 'DRAFT' | 'ACTIVE')}>
                  <SelectTrigger id="cp-status" aria-label="Status">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="DRAFT">Draft — hidden until published</SelectItem>
                    <SelectItem value="ACTIVE">Active — live immediately</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-3">
              <div className="space-y-1.5">
                <Label htmlFor="cp-price">Price (USD) *</Label>
                <Input id="cp-price" type="number" min="0" step="0.01" value={price} onChange={(e) => setPrice(e.target.value)} placeholder="199.00" />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="cp-compare">
                  Compare at <span className="text-xs text-muted-foreground">(opt.)</span>
                </Label>
                <Input id="cp-compare" type="number" min="0" step="0.01" value={compareAtPrice} onChange={(e) => setCompareAtPrice(e.target.value)} placeholder="249.00" />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="cp-stock">
                  Stock <span className="text-xs text-muted-foreground">(opt.)</span>
                </Label>
                <Input id="cp-stock" type="number" min="0" value={stock} onChange={(e) => setStock(e.target.value)} placeholder="0" />
              </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-3">
              <div className="space-y-1.5">
                <Label htmlFor="cp-moq">
                  MOQ <span className="text-xs text-muted-foreground">(opt.)</span>
                </Label>
                <Input id="cp-moq" type="number" min="1" value={moq} onChange={(e) => setMoq(e.target.value)} placeholder="e.g. 10" />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="cp-sku">
                  SKU <span className="text-xs text-muted-foreground">(opt.)</span>
                </Label>
                <Input id="cp-sku" value={sku} onChange={(e) => setSku(e.target.value)} maxLength={64} placeholder="VS-550W-TSM" />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="cp-rank">
                  Popular rank <span className="text-xs text-muted-foreground">(opt.)</span>
                </Label>
                <Input id="cp-rank" type="number" min="1" max="999" value={popularRank} onChange={(e) => setPopularRank(e.target.value)} placeholder="1–999" />
              </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="cp-gtin">
                  GTIN <span className="text-xs text-muted-foreground">(EAN/UPC — dedup key)</span>
                </Label>
                <Input id="cp-gtin" value={gtin} onChange={(e) => setGtin(e.target.value)} maxLength={20} className="font-mono text-xs" placeholder="6901234567890" />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="cp-mpn">
                  MPN <span className="text-xs text-muted-foreground">(manufacturer part no.)</span>
                </Label>
                <Input id="cp-mpn" value={mpn} onChange={(e) => setMpn(e.target.value)} maxLength={64} className="font-mono text-xs" placeholder="TSM-DE19" />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="cp-description">Description *</Label>
              <Textarea id="cp-description" value={description} onChange={(e) => setDescription(e.target.value)} rows={4} maxLength={4000} placeholder="What it is, key specifications, what's in the box…" />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="cp-images">
                Image URLs <span className="text-xs text-muted-foreground">(one per line, max 6 — required to publish)</span>
              </Label>
              <Textarea id="cp-images" value={imagesText} onChange={(e) => setImagesText(e.target.value)} rows={3} className="font-mono text-xs" placeholder={'https://example.com/panel-front.jpg\nhttps://example.com/panel-back.jpg'} />
            </div>

            <DialogFooter className="gap-2 pt-1">
              <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
                Cancel
              </Button>
              <Button type="button" onClick={() => void save()} disabled={saving} className="min-w-28">
                {saving && <Loader2 size={14} className="mr-1.5 animate-spin" />}
                <Plus size={14} className="mr-1.5" /> Create listing
              </Button>
            </DialogFooter>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}

// ── CSV import dialog ─────────────────────────────────────────────────────────

function ImportCsvDialog({ open, onOpenChange, onSaved }: { open: boolean; onOpenChange: (o: boolean) => void; onSaved: () => void }) {
  const [csv, setCsv] = useState('')
  const [busy, setBusy] = useState(false)
  const [results, setResults] = useState<{ rows: ImportRow[]; created: number; failed: number } | null>(null)

  const run = async () => {
    if (!csv.trim()) return
    setBusy(true)
    const res = await apiRequest<{ results: ImportRow[]; created: number; failed: number }>('/api/admin/catalog/import', {
      method: 'POST',
      body: JSON.stringify({ csv }),
    })
    setBusy(false)
    if (!res.ok || !res.data) {
      toastApiError(res.error, 'Import failed')
      return
    }
    setResults({ rows: res.data.results, created: res.data.created, failed: res.data.failed })
    onSaved()
    if (res.data.failed === 0) toast({ title: `Imported ${res.data.created} listing(s)` })
    else toast({ title: `Import finished — ${res.data.created} created, ${res.data.failed} failed`, variant: 'destructive' })
  }

  const close = () => {
    onOpenChange(false)
    // Reset on close so the next open starts clean
    setTimeout(() => {
      setCsv('')
      setResults(null)
    }, 200)
  }

  return (
    <Dialog open={open} onOpenChange={(o) => (o ? undefined : close())}>
      <DialogContent className="max-h-[88vh] overflow-y-auto scrollbar-thin sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>Import curated listings (CSV)</DialogTitle>
          <DialogDescription>
            Paste comma-separated rows. Quoted cells with doubled <span className="font-mono">&quot;&quot;</span> escapes are supported. Rows import
            one-by-one — failures don&apos;t block the rest.
          </DialogDescription>
        </DialogHeader>
        {open && (
          <div className="space-y-4">
            <div className="rounded-xl border bg-muted/40 px-3 py-2.5 text-xs leading-relaxed">
              <p className="mb-1 font-semibold">Header columns</p>
              <p className="font-mono text-[11px] text-muted-foreground">{CSV_COLUMNS}</p>
              <p className="mt-1.5 text-muted-foreground">
                <span className="font-semibold text-foreground">title, category, price</span> are required · category matches by name or
                slug · rows with an imageUrl publish ACTIVE, others save as DRAFT
              </p>
            </div>
            {!results ? (
              <>
                <div className="space-y-1.5">
                  <Label htmlFor="cp-csv">CSV content</Label>
                  <Textarea
                    id="cp-csv"
                    value={csv}
                    onChange={(e) => setCsv(e.target.value)}
                    rows={8}
                    className="font-mono text-xs"
                    placeholder={`${CSV_COLUMNS}\n"Long Panel Name",solar-panels,Trina Solar,199,50,10,VS-550,6901234567890,TSM-DE19,"550W monocrystalline",https://example.com/img.jpg`}
                  />
                </div>
                <DialogFooter className="gap-2">
                  <Button variant="outline" onClick={close} disabled={busy}>
                    Cancel
                  </Button>
                  <Button type="button" onClick={() => void run()} disabled={busy || !csv.trim()} className="min-w-28">
                    {busy && <Loader2 size={14} className="mr-1.5 animate-spin" />}
                    <FileSpreadsheet size={14} className="mr-1.5" /> Import rows
                  </Button>
                </DialogFooter>
              </>
            ) : (
              <div className="space-y-3">
                <div className="flex items-center gap-3 text-sm">
                  <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-100 px-3 py-1 text-xs font-semibold text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300">
                    <CheckCircle2 size={12} /> {results.created} created
                  </span>
                  {results.failed > 0 && (
                    <span className="inline-flex items-center gap-1.5 rounded-full bg-rose-100 px-3 py-1 text-xs font-semibold text-rose-800 dark:bg-rose-950 dark:text-rose-300">
                      <ShieldAlert size={12} /> {results.failed} failed
                    </span>
                  )}
                </div>
                <div className="max-h-80 space-y-1.5 overflow-y-auto scrollbar-thin rounded-xl border p-2">
                  {results.rows.map((r) => (
                    <div
                      key={r.row}
                      className={cn(
                        'flex items-start gap-2 rounded-lg px-2.5 py-2 text-xs',
                        r.status === 'created' ? 'bg-emerald-50 dark:bg-emerald-950/40' : 'bg-rose-50 dark:bg-rose-950/40'
                      )}
                    >
                      {r.status === 'created' ? (
                        <CheckCircle2 size={13} className="mt-0.5 shrink-0 text-emerald-600" />
                      ) : (
                        <ShieldAlert size={13} className="mt-0.5 shrink-0 text-rose-600" />
                      )}
                      <span className="min-w-0 flex-1">
                        <span className="font-semibold">Row {r.row}</span>{' '}
                        {r.status === 'created' ? (
                          <span className="text-muted-foreground">created{r.id ? ` · ${r.id}` : ''}</span>
                        ) : (
                          <span className="text-rose-700 dark:text-rose-300">{r.error}</span>
                        )}
                      </span>
                    </div>
                  ))}
                </div>
                <DialogFooter className="gap-2">
                  <Button
                    variant="outline"
                    onClick={() => {
                      setCsv('')
                      setResults(null)
                    }}
                    disabled={busy}
                  >
                    Import more
                  </Button>
                  <Button onClick={close}>Done</Button>
                </DialogFooter>
              </div>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}

// ── The tab ───────────────────────────────────────────────────────────────────

export function CatalogProductsTab() {
  const [products, setProducts] = useState<ProductDTO[]>([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [cloningId, setCloningId] = useState<string | null>(null)
  const [createOpen, setCreateOpen] = useState(false)
  const [importOpen, setImportOpen] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    setLoadError(null)
    try {
      const res = await apiRequest<{ products: ProductDTO[] }>('/api/admin/catalog/products')
      if (!res.ok || !res.data) {
        setLoadError(res.error ?? 'Failed to load curated listings')
        setProducts([])
      } else {
        setProducts(res.data.products)
      }
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  const clone = async (p: ProductDTO) => {
    setCloningId(p.id)
    const res = await apiRequest<{ product: { id: string; title: string }; message?: string }>(
      `/api/admin/catalog/products/${p.id}/clone`,
      { method: 'POST' }
    )
    setCloningId(null)
    if (!res.ok) {
      toastApiError(res.error, 'Could not clone the listing')
      return
    }
    toast({ title: 'Cloned into draft', description: `${p.title} → curated draft${res.data?.message ? ` — ${res.data.message}` : ''}.` })
    void load()
  }

  const rows = useMemo(() => products, [products])

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <p className="max-w-xl text-sm text-muted-foreground">
          Platform-curated listings owned by the <span className="font-semibold text-foreground">Vendora Catalog</span> account —
          sellers attach their offers to them from the product page.
        </p>
        <div className="flex shrink-0 flex-wrap gap-2">
          <Button variant="outline" className="rounded-xl" onClick={() => setImportOpen(true)}>
            <FileSpreadsheet size={15} className="mr-1.5" /> Import CSV
          </Button>
          <Button className="rounded-xl" onClick={() => setCreateOpen(true)}>
            <Plus size={15} className="mr-1.5" /> New curated listing
          </Button>
        </div>
      </div>

      {loading && (
        <div className="space-y-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-14 w-full rounded-xl" />
          ))}
        </div>
      )}

      {!loading && loadError && (
        <AdminEmptyState icon={ShieldAlert} title="Couldn't load the curated catalog" description={loadError}>
          <Button variant="outline" className="rounded-xl" onClick={() => void load()}>
            Try again
          </Button>
        </AdminEmptyState>
      )}

      {!loading && !loadError && rows.length === 0 && (
        <AdminEmptyState
          icon={Layers}
          title="No curated listings yet"
          description="Create the first platform-owned product, import a CSV, or clone an existing seller listing into the curated layer."
        />
      )}

      {/* Desktop table */}
      {!loading && !loadError && rows.length > 0 && (
        <div className="hidden overflow-hidden rounded-2xl border md:block">
          <div className="max-h-[70vh] overflow-y-auto scrollbar-thin">
            <table className="w-full text-sm">
              <thead className="sticky top-0 z-10 bg-muted/95 backdrop-blur">
                <tr className="border-b text-left text-xs uppercase tracking-wide text-muted-foreground">
                  <th scope="col" className="px-4 py-3 font-medium">Listing</th>
                  <th scope="col" className="px-4 py-3 font-medium">Brand</th>
                  <th scope="col" className="px-4 py-3 font-medium">Price</th>
                  <th scope="col" className="px-4 py-3 font-medium">Stock</th>
                  <th scope="col" className="px-4 py-3 font-medium">Offers</th>
                  <th scope="col" className="px-4 py-3 font-medium">Status</th>
                  <th scope="col" className="px-4 py-3 text-right font-medium"><span className="sr-only">Actions</span></th>
                </tr>
              </thead>
              <tbody>
                {rows.map((p) => (
                  <tr key={p.id} className="border-b transition-colors last:border-0 hover:bg-accent/50">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-3">
                        <span className="h-9 w-9 shrink-0 overflow-hidden rounded-lg border bg-muted">
                          {p.images?.[0] ? (
                            <img src={p.images[0]} alt="" className="h-full w-full object-cover" loading="lazy" />
                          ) : (
                            <Layers size={15} className="m-auto block text-muted-foreground" />
                          )}
                        </span>
                        <div className="min-w-0">
                          <p className="truncate font-medium">{p.title}</p>
                          <p className="truncate text-xs text-muted-foreground">
                            {p.category?.name}
                            {p.popularRank ? ` · Popular #${p.popularRank}` : ''}
                          </p>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">{p.brand?.name ?? '—'}</td>
                    <td className="px-4 py-3 tabular-nums">
                      {formatUSD(p.price)}
                      {p.compareAtPrice ? <span className="ml-1 text-xs text-muted-foreground line-through">{formatUSD(p.compareAtPrice)}</span> : null}
                    </td>
                    <td className="px-4 py-3 tabular-nums text-muted-foreground">{p.stock}</td>
                    <td className="px-4 py-3">
                      {(p.offerCount ?? 0) > 0 ? (
                        <Badge className="rounded-full border-0 bg-teal-100 text-[11px] font-semibold text-teal-800 dark:bg-teal-950 dark:text-teal-300">
                          {p.offerCount} seller offer{p.offerCount === 1 ? '' : 's'}
                        </Badge>
                      ) : (
                        <span className="text-xs text-muted-foreground">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <Badge className={cn('rounded-full border-0 text-[11px] font-semibold', STATUS_CHIP[p.status] ?? 'bg-muted text-muted-foreground')}>
                        {p.status.charAt(0) + p.status.slice(1).toLowerCase().replace('_', ' ')}
                      </Badge>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <Button
                        variant="outline"
                        size="sm"
                        className="h-8 rounded-lg"
                        disabled={cloningId === p.id}
                        onClick={() => void clone(p)}
                        aria-label={`Clone ${p.title} into a curated draft`}
                      >
                        {cloningId === p.id ? <Loader2 size={13} className="mr-1.5 animate-spin" /> : <Copy size={13} className="mr-1.5" />}
                        Clone
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Mobile stacked cards */}
      {!loading && !loadError && rows.length > 0 && (
        <div className="space-y-3 md:hidden">
          {rows.map((p) => (
            <div key={p.id} className="rounded-2xl border p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="flex min-w-0 items-center gap-3">
                  <span className="h-10 w-10 shrink-0 overflow-hidden rounded-lg border bg-muted">
                    {p.images?.[0] ? (
                      <img src={p.images[0]} alt="" className="h-full w-full object-cover" loading="lazy" />
                    ) : (
                      <Layers size={16} className="m-auto block text-muted-foreground" />
                    )}
                  </span>
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold">{p.title}</p>
                    <p className="truncate text-xs text-muted-foreground">
                      {p.category?.name}
                      {p.brand?.name ? ` · ${p.brand.name}` : ''}
                    </p>
                  </div>
                </div>
                <Badge className={cn('shrink-0 rounded-full border-0 text-[11px] font-semibold', STATUS_CHIP[p.status] ?? 'bg-muted text-muted-foreground')}>
                  {p.status.charAt(0) + p.status.slice(1).toLowerCase().replace('_', ' ')}
                </Badge>
              </div>
              <div className="mt-3 flex items-center justify-between gap-3 text-xs text-muted-foreground">
                <span>
                  {formatUSD(p.price)} · stock {p.stock}
                  {(p.offerCount ?? 0) > 0 ? ` · ${p.offerCount} offer${p.offerCount === 1 ? '' : 's'}` : ''}
                  {p.popularRank ? ` · #${p.popularRank}` : ''}
                </span>
                <Button
                  variant="outline"
                  size="sm"
                  className="h-8 rounded-lg"
                  disabled={cloningId === p.id}
                  onClick={() => void clone(p)}
                  aria-label={`Clone ${p.title}`}
                >
                  {cloningId === p.id ? <Loader2 size={13} className="mr-1.5 animate-spin" /> : <Copy size={13} className="mr-1.5" />}
                  Clone
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}

      <CuratedProductDialog open={createOpen} onOpenChange={setCreateOpen} onSaved={() => void load()} />
      <ImportCsvDialog open={importOpen} onOpenChange={setImportOpen} onSaved={() => void load()} />
    </div>
  )
}
