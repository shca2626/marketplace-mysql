'use client'

import { useRef, useState } from 'react'
import {
  Archive,
  CheckCircle2,
  FileJson,
  FileSpreadsheet,
  Loader2,
  TriangleAlert,
  Upload,
} from 'lucide-react'
import { toast } from '@/hooks/use-toast'
import type { CategoryDTO } from '@/lib/types'
import { parseCsvObjects } from '@/lib/csv'
import { csvRowToImport, type ImportRow } from '@/lib/product-io'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { cn } from '@/lib/utils'

interface ParsedRow {
  data: ImportRow
  errors: string[]
}

interface ImportResult {
  index: number
  title: string
  ok: boolean
  error?: string
}

/**
 * Bulk import dialog — two tabs:
 *  • CSV  — the seller-friendly path (template download, upload or paste,
 *           preview with per-row validation, then commit)
 *  • JSON — the archived admin/management format (full products incl.
 *           variants; same body shape the API accepts)
 */
export function BulkImportDialog({
  open,
  onOpenChange,
  categories,
  onImported,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  categories: CategoryDTO[]
  onImported: () => void
}) {
  const [tab, setTab] = useState('csv')
  const [csvText, setCsvText] = useState('')
  const [jsonText, setJsonText] = useState('')
  const [parsedRows, setParsedRows] = useState<ParsedRow[] | null>(null)
  const [importing, setImporting] = useState(false)
  const [results, setResults] = useState<ImportResult[] | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  const knownSlugs = new Set(categories.map((c) => c.slug))

  const reset = () => {
    setCsvText('')
    setJsonText('')
    setParsedRows(null)
    setResults(null)
    if (fileRef.current) fileRef.current.value = ''
  }

  const close = () => {
    onOpenChange(false)
    reset()
  }

  const parseCsvInput = (text: string) => {
    setResults(null)
    if (!text.trim()) {
      setParsedRows(null)
      return
    }
    const objects = parseCsvObjects(text)
    if (objects.length === 0) {
      setParsedRows([])
      return
    }
    const rows = objects.map((o) => {
      const r = csvRowToImport(o, knownSlugs)
      return r.ok ? { data: r.data, errors: [] } : { data: null as unknown as ImportRow, errors: r.errors }
    })
    setParsedRows(rows)
  }

  const parseJsonInput = (text: string) => {
    setResults(null)
    if (!text.trim()) {
      setParsedRows(null)
      return
    }
    try {
      const arr = JSON.parse(text)
      if (!Array.isArray(arr)) throw new Error('Expected a JSON array of products')
      const rows: ParsedRow[] = arr.map((raw: Record<string, unknown>, i) => {
        const errors: string[] = []
        const title = typeof raw.title === 'string' ? raw.title : `Item ${i + 1}`
        if (typeof raw.title !== 'string' || raw.title.length < 3) errors.push('title: required (3+ chars)')
        if (typeof raw.description !== 'string' || raw.description.length < 10)
          errors.push('description: required (10+ chars)')
        const price = Number(raw.price)
        if (!Number.isFinite(price) || price <= 0) errors.push('price: positive number required')
        const cat = String(raw.categorySlug ?? raw.categoryId ?? '')
        if (!cat) errors.push('category: categorySlug or categoryId required')
        const images = Array.isArray(raw.images) ? raw.images.filter((x) => typeof x === 'string') : []
        if (images.length === 0) errors.push('images: at least one URL required')
        const data = {
          title,
          description: String(raw.description ?? ''),
          price,
          categorySlug: cat,
          stock: Number(raw.stock) || 10,
          images,
          brand: (raw.brand as string) ?? null,
          sku: (raw.sku as string) ?? null,
          barcode: (raw.barcode as string) ?? null,
          condition: (raw.condition as string) ?? 'NEW',
          tags: Array.isArray(raw.tags) ? (raw.tags as string[]) : [],
          videoUrl: (raw.videoUrl as string) ?? null,
          freeShipping: Boolean(raw.freeShipping),
          shippingNote: (raw.shippingNote as string) ?? null,
          handlingDays: Number(raw.handlingDays) || 2,
          weightKg: raw.weightKg != null ? Number(raw.weightKg) : null,
          lengthCm: raw.lengthCm != null ? Number(raw.lengthCm) : null,
          widthCm: raw.widthCm != null ? Number(raw.widthCm) : null,
          heightCm: raw.heightCm != null ? Number(raw.heightCm) : null,
          minOrderQty: Number(raw.minOrderQty) || 1,
          maxPerOrder: raw.maxPerOrder != null ? Number(raw.maxPerOrder) : null,
          warrantyMonths: raw.warrantyMonths != null ? Number(raw.warrantyMonths) : null,
          metaTitle: (raw.metaTitle as string) ?? null,
          metaDescription: (raw.metaDescription as string) ?? null,
          status: (raw.status as string) ?? 'ACTIVE',
          attributes: (raw.attributes as ImportRow['attributes']) ?? {},
          variants: (raw.variants as ImportRow['variants']) ?? undefined,
        } as ImportRow
        return { data, errors }
      })
      setParsedRows(rows)
    } catch (err) {
      toast({
        title: 'Invalid JSON',
        description: err instanceof Error ? err.message : 'Could not parse',
        variant: 'destructive',
      })
      setParsedRows(null)
    }
  }

  const validRows = parsedRows?.filter((r) => r.errors.length === 0) ?? []
  const invalidRows = parsedRows?.filter((r) => r.errors.length > 0) ?? []

  const runImport = async () => {
    if (validRows.length === 0) return
    setImporting(true)
    try {
      const res = await fetch('/api/products/bulk', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'import',
          rows: validRows.map((r) => r.data),
        }),
      })
      const json = await res.json()
      if (!res.ok) {
        toast({ title: 'Import failed', description: json.error, variant: 'destructive' })
        return
      }
      setResults(json.results as ImportResult[])
      const created = json.summary?.created ?? 0
      const failed = json.summary?.failed ?? 0
      if (failed === 0) {
        toast({ title: `Imported ${created} product${created === 1 ? '' : 's'}` })
        onImported()
      } else {
        toast({
          title: `Imported ${created}, ${failed} failed`,
          description: 'Check the row results below.',
          variant: 'destructive',
        })
        onImported()
      }
    } catch {
      toast({ title: 'Import failed', description: 'Network error', variant: 'destructive' })
    } finally {
      setImporting(false)
    }
  }

  const downloadTemplate = () => {
    const header =
      'title,description,price,compareAtPrice,category,stock,images,brand,sku,barcode,condition,tags,videoUrl,freeShipping,shippingNote,handlingDays,weightKg,lengthCm,widthCm,heightCm,minOrderQty,maxPerOrder,warrantyMonths,metaTitle,metaDescription,status'
    const example =
      'Aurora Desk Lamp,Warm brass desk lamp with dimmable LED and USB-C port.,49.9,,home-living,12,https://images.unsplash.com/photo-1507473885765-e6ed057f782c?w=800|https://images.unsplash.com/photo-1513506003901-1e6a229e2d15?w=800,Nordform, VN-HOM-050,5901234123457,NEW,lighting|desk|brass,,true,Ships flat-packed,1,1.8,30,18,45,1,,24,,,ACTIVE'
    const blob = new Blob([`${header}\r\n${example}\r\n`], { type: 'text/csv;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'vendora-product-import-template.csv'
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
  }

  return (
    <Dialog open={open} onOpenChange={(o) => (o ? onOpenChange(o) : close())}>
      <DialogContent className="max-h-[90vh] overflow-y-auto scrollbar-thin sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Upload size={17} className="text-primary" /> Import products
          </DialogTitle>
          <DialogDescription>
            Add many listings at once — validate everything in a preview before anything is created.
          </DialogDescription>
        </DialogHeader>

        {results ? (
          <div className="space-y-3">
            <div className="flex items-center gap-2 rounded-xl border bg-muted/40 p-3 text-sm">
              <CheckCircle2 size={16} className="text-emerald-600" />
              <span>
                <b>{results.filter((r) => r.ok).length}</b> created ·{' '}
                <b>{results.filter((r) => !r.ok).length}</b> failed
              </span>
            </div>
            <div className="max-h-64 overflow-y-auto scrollbar-thin rounded-xl border">
              {results.map((r) => (
                <div
                  key={r.index}
                  className={cn(
                    'flex items-start gap-2 border-b px-3 py-2 text-xs last:border-0',
                    r.ok ? '' : 'bg-destructive/5'
                  )}
                >
                  {r.ok ? (
                    <CheckCircle2 size={13} className="mt-0.5 shrink-0 text-emerald-600" />
                  ) : (
                    <TriangleAlert size={13} className="mt-0.5 shrink-0 text-destructive" />
                  )}
                  <span className="min-w-0 flex-1">
                    <span className="font-medium">{r.title}</span>
                    {r.error && <span className="text-muted-foreground"> — {r.error}</span>}
                  </span>
                </div>
              ))}
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={reset}>
                Import more
              </Button>
              <Button onClick={close}>Done</Button>
            </DialogFooter>
          </div>
        ) : (
          <Tabs value={tab} onValueChange={setTab}>
            <TabsList className="h-11 w-full rounded-xl bg-muted/60 p-1">
              <TabsTrigger value="csv" className="flex-1 gap-1.5 rounded-lg text-sm">
                <FileSpreadsheet size={14} /> CSV
              </TabsTrigger>
              <TabsTrigger value="json" className="flex-1 gap-1.5 rounded-lg text-sm">
                <Archive size={14} /> JSON <span className="text-[10px] text-muted-foreground">(admin archive)</span>
              </TabsTrigger>
            </TabsList>

            {/* ── CSV tab ── */}
            <TabsContent value="csv" className="space-y-4 pt-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-xs text-muted-foreground">
                  Columns: title, description, price, category (slug), images (pipe-separated), attr.*
                </p>
                <Button type="button" variant="outline" size="sm" onClick={downloadTemplate}>
                  <FileSpreadsheet size={13} className="mr-1.5" /> Template
                </Button>
              </div>
              <input
                ref={fileRef}
                type="file"
                accept=".csv,text/csv"
                className="sr-only"
                onChange={(e) => {
                  const file = e.target.files?.[0]
                  if (!file) return
                  const reader = new FileReader()
                  reader.onload = () => {
                    const text = String(reader.result ?? '')
                    setCsvText(text)
                    parseCsvInput(text)
                  }
                  reader.readAsText(file)
                }}
                aria-label="Upload CSV file"
              />
              <Button type="button" variant="outline" className="w-full border-dashed" onClick={() => fileRef.current?.click()}>
                <Upload size={14} className="mr-1.5" /> Choose a .csv file
              </Button>
              <div className="space-y-1.5">
                <p className="text-xs font-medium text-muted-foreground">…or paste CSV text</p>
                <textarea
                  value={csvText}
                  onChange={(e) => {
                    setCsvText(e.target.value)
                    parseCsvInput(e.target.value)
                  }}
                  placeholder="title,description,price,category,stock,images…"
                  className="h-28 w-full rounded-lg border bg-background px-3 py-2 font-mono text-xs"
                  aria-label="Paste CSV"
                />
              </div>
            </TabsContent>

            {/* ── JSON tab ── */}
            <TabsContent value="json" className="space-y-3 pt-4">
              <div className="rounded-xl border bg-muted/30 p-3">
                <p className="flex items-center gap-1.5 text-xs font-semibold">
                  <FileJson size={13} className="text-primary" /> Archived interchange format
                </p>
                <p className="mt-1 text-[11px] leading-4 text-muted-foreground">
                  Full product objects — including <b>variants</b> — in the same shape the platform
                  API accepts. This is the format the admin/management platform will speak.
                </p>
              </div>
              <textarea
                value={jsonText}
                onChange={(e) => {
                  setJsonText(e.target.value)
                  parseJsonInput(e.target.value)
                }}
                placeholder='[ { "title": "…", "price": 29.99, "categorySlug": "electronics", "images": ["https://…"], "variants": [{ "name": "Black", "options": {"color":"Black"}, "stock": 5 }] } ]'
                className="h-36 w-full rounded-lg border bg-background px-3 py-2 font-mono text-xs"
                aria-label="Paste JSON"
              />
            </TabsContent>

            {/* preview + commit (shared) */}
            {parsedRows && parsedRows.length > 0 && (
              <div className="space-y-3 border-t pt-4">
                <div className="flex flex-wrap items-center gap-3 text-xs">
                  <span className="rounded-full bg-muted px-2.5 py-1">
                    {parsedRows.length} rows parsed
                  </span>
                  <span className="rounded-full bg-emerald-100 px-2.5 py-1 font-medium text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300">
                    {validRows.length} ready
                  </span>
                  {invalidRows.length > 0 && (
                    <span className="rounded-full bg-destructive/10 px-2.5 py-1 font-medium text-destructive">
                      {invalidRows.length} with errors
                    </span>
                  )}
                </div>
                <div className="max-h-56 overflow-y-auto scrollbar-thin rounded-xl border">
                  {parsedRows.map((r, i) => (
                    <div key={i} className="border-b px-3 py-2 text-xs last:border-0">
                      <div className="flex items-center gap-2">
                        {r.errors.length === 0 ? (
                          <CheckCircle2 size={13} className="shrink-0 text-emerald-600" />
                        ) : (
                          <TriangleAlert size={13} className="shrink-0 text-destructive" />
                        )}
                        <span className="min-w-0 flex-1 truncate font-medium">
                          {r.errors.length === 0 ? r.data.title : `Row ${i + 1}`}
                        </span>
                        <span className="shrink-0 text-muted-foreground">
                          {r.errors.length === 0
                            ? `${r.data.categorySlug} · ${r.data.price}`
                            : `${r.errors.length} issue${r.errors.length === 1 ? '' : 's'}`}
                        </span>
                      </div>
                      {r.errors.length > 0 && (
                        <ul className="mt-1 space-y-0.5 pl-5 text-[11px] text-muted-foreground">
                          {r.errors.slice(0, 4).map((e) => (
                            <li key={e}>• {e}</li>
                          ))}
                        </ul>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </Tabs>
        )}

        {!results && (
          <DialogFooter className="border-t pt-4">
            <Button variant="outline" onClick={close}>
              Cancel
            </Button>
            <Button onClick={runImport} disabled={importing || validRows.length === 0} className="min-w-28">
              {importing && <Loader2 size={14} className="mr-1.5 animate-spin" />}
              Import {validRows.length > 0 ? validRows.length : ''} product{validRows.length === 1 ? '' : 's'}
            </Button>
          </DialogFooter>
        )}
      </DialogContent>
    </Dialog>
  )
}
