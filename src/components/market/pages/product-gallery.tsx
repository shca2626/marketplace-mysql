'use client'

import { useState } from 'react'
import { motion } from 'framer-motion'
import { ZoomIn } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog'

/**
 * Product gallery island for the real /market/product/[id] page
 * (pagedesign.md Phase 2). Ports the SPA gallery (product-view.tsx):
 * main image with fade transition, thumbnail strip, zoom lightbox.
 * Discount badge kept server-side by the page — this island only swaps
 * images.
 */
export function ProductGallery({ images, title, badge }: { images: string[]; title: string; badge?: React.ReactNode }) {
  const [activeImage, setActiveImage] = useState(0)
  const [lightboxOpen, setLightboxOpen] = useState(false)
  const count = images.length
  const safeIndex = Math.min(activeImage, Math.max(0, count - 1))

  return (
    <div>
      <div className="group relative overflow-hidden rounded-2xl border border-bh-border bg-bh-soft-blue/40">
        {count > 0 ? (
          <button
            type="button"
            className="block w-full cursor-zoom-in"
            onClick={() => setLightboxOpen(true)}
            aria-label="Enlarge image"
          >
            <motion.img
              key={safeIndex}
              initial={{ opacity: 0.4, scale: 0.99 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ duration: 0.25 }}
              src={images[safeIndex]}
              alt={`${title} — image ${safeIndex + 1} of ${count}`}
              className="aspect-square w-full object-cover transition-transform duration-500 group-hover:scale-[1.03] dark:brightness-[0.96]"
            />
          </button>
        ) : (
          <div className="flex aspect-square items-center justify-center text-sm text-bh-muted">No image</div>
        )}
        {badge}
        {count > 0 && (
          <span
            aria-hidden
            className="pointer-events-none absolute right-3 top-3 flex h-9 w-9 items-center justify-center rounded-full bg-background/80 text-foreground opacity-0 shadow-sm backdrop-blur transition-opacity duration-200 group-hover:opacity-100"
          >
            <ZoomIn size={16} />
          </span>
        )}
      </div>

      {count > 1 && (
        <div className="mt-3 flex gap-2.5 overflow-x-auto pb-1">
          {images.map((img, i) => (
            <button
              key={`${img}-${i}`}
              type="button"
              onClick={() => setActiveImage(i)}
              className={cn(
                'h-20 w-20 shrink-0 overflow-hidden rounded-xl border-2 transition-all',
                i === safeIndex
                  ? 'border-primary'
                  : 'border-transparent opacity-60 hover:opacity-100'
              )}
              aria-label={`Show image ${i + 1}`}
              aria-pressed={i === safeIndex}
            >
              <img src={img} alt="" className="h-full w-full object-cover" loading="lazy" />
            </button>
          ))}
        </div>
      )}

      {/* Zoom lightbox */}
      <Dialog open={lightboxOpen} onOpenChange={setLightboxOpen}>
        <DialogContent className="max-w-3xl overflow-hidden p-0 sm:rounded-2xl">
          <DialogTitle className="sr-only">{title} — full image</DialogTitle>
          {count > 0 && (
            <img
              src={images[safeIndex]}
              alt={`${title} — enlarged image`}
              className="max-h-[80vh] w-full bg-bh-soft-blue/40 object-contain"
            />
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}
