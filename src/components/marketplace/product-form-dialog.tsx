'use client'

import { useEffect, useState } from 'react'
import { ImagePlus, Loader2, Trash2, UploadCloud } from 'lucide-react'
import { toast } from '@/hooks/use-toast'
import { useMarketplace } from '@/store/marketplace'
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
import { cn } from '@/lib/utils'

interface ProductFormValues {
  title: string
  description: string
  price: string
  compareAtPrice: string
  categoryId: string
  stock: string
  images: string[]
}

const emptyForm: ProductFormValues = {
  title: '',
  description: '',
  price: '',
  compareAtPrice: '',
  categoryId: '',
  stock: '10',
  images: [],
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
  const [form, setForm] = useState<ProductFormValues>(emptyForm)
  const [imageUrl, setImageUrl] = useState('')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (open) {
      if (editing) {
        setForm({
          title: editing.title,
          description: editing.description,
          price: String(editing.price),
          compareAtPrice: editing.compareAtPrice ? String(editing.compareAtPrice) : '',
          categoryId: editing.categoryId,
          stock: String(editing.stock),
          images: [...editing.images],
        })
      } else {
        setForm(emptyForm)
      }
      setImageUrl('')
    }
  }, [open, editing])

  const set = (key: keyof ProductFormValues) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    setForm((f) => ({ ...f, [key]: e.target.value }))

  const addImage = (url: string) => {
    const clean = url.trim()
    if (!clean) return
    if (!/^https?:\/\//.test(clean)) {
      toast({ title: 'Invalid image URL', description: 'Please paste a valid http(s) URL', variant: 'destructive' })
      return
    }
    if (form.images.includes(clean) || form.images.length >= 6) return
    setForm((f) => ({ ...f, images: [...f.images, clean] }))
    setImageUrl('')
  }

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!form.title || form.title.length < 3) {
      toast({ title: 'Title too short', variant: 'destructive' })
      return
    }
    if (form.description.length < 10) {
      toast({ title: 'Description too short', description: 'Write at least 10 characters', variant: 'destructive' })
      return
    }
    const price = parseFloat(form.price)
    if (!price || price <= 0) {
      toast({ title: 'Invalid price', variant: 'destructive' })
      return
    }
    if (!form.categoryId) {
      toast({ title: 'Pick a category', variant: 'destructive' })
      return
    }
    if (form.images.length === 0) {
      toast({ title: 'Add at least one image', description: 'Paste a URL or pick a sample below', variant: 'destructive' })
      return
    }
    setSaving(true)
    try {
      const payload = {
        title: form.title.trim(),
        description: form.description.trim(),
        price,
        compareAtPrice: form.compareAtPrice ? parseFloat(form.compareAtPrice) : null,
        categoryId: form.categoryId,
        stock: parseInt(form.stock || '0', 10) || 0,
        images: form.images,
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
        title: editing ? 'Product updated' : 'Product published',
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

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto scrollbar-thin sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{editing ? 'Edit product' : 'Add new product'}</DialogTitle>
          <DialogDescription>
            {editing ? 'Update your listing details.' : 'Fill in the details to publish a new listing.'}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={submit} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="p-title">Title</Label>
            <Input id="p-title" value={form.title} onChange={set('title')} placeholder="e.g. Handmade Ceramic Mug" />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="p-desc">Description</Label>
            <Textarea
              id="p-desc"
              value={form.description}
              onChange={set('description')}
              placeholder="Describe materials, dimensions, what makes it special…"
              className="min-h-24"
            />
          </div>

          <div className="grid grid-cols-3 gap-3">
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
              <Input id="p-stock" type="number" min="0" value={form.stock} onChange={set('stock')} />
            </div>
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

          {/* Images */}
          <div className="space-y-2.5">
            <Label>Images ({form.images.length}/6)</Label>
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
              <Button type="button" variant="outline" onClick={() => addImage(imageUrl)}>
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
                  </div>
                ))}
              </div>
            )}
            <div>
              <p className="mb-1.5 flex items-center gap-1 text-xs text-muted-foreground">
                <UploadCloud size={12} /> Or quick-pick a sample image:
              </p>
              <div className="flex flex-wrap gap-1.5">
                {SAMPLE_PRODUCT_IMAGES.filter((u) => !form.images.includes(u))
                  .slice(0, 8)
                  .map((u) => (
                    <button
                      key={u}
                      type="button"
                      onClick={() => addImage(u)}
                      className={cn(
                        'h-11 w-11 overflow-hidden rounded-lg border-2 border-transparent transition hover:border-primary'
                      )}
                    >
                      <img src={u} alt="Sample" className="h-full w-full object-cover" />
                    </button>
                  ))}
              </div>
            </div>
          </div>

          <DialogFooter className="gap-2 pt-2">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={saving} className="min-w-32">
              {saving && <Loader2 size={14} className="mr-1.5 animate-spin" />}
              {editing ? 'Save changes' : 'Publish product'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
