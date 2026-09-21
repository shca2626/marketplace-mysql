'use client'

import { useEffect } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { GitCompareArrows, Trash2, X } from 'lucide-react'
import { useMarketplace } from '@/store/marketplace'
import { cardImage } from '@/lib/storage/url'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

// Compare tray — fixed bottom bar that appears once the shopper picks at
// least one product for comparison (from product cards or product pages).
// Stays out of the checkout flow so it never competes with payment UI.

const MAX_COMPARE = 4

export function CompareTray() {
  const view = useMarketplace((s) => s.view)
  const compareItems = useMarketplace((s) => s.compareItems)
  const setCompareOpen = useMarketplace((s) => s.setCompareOpen)
  const removeFromCompare = useMarketplace((s) => s.removeFromCompare)
  const clearCompare = useMarketplace((s) => s.clearCompare)

  // Never show the tray mid-checkout (or in the dialog itself is fine — the
  // dialog overlays). Seller/admin dashboards are seller tooling contexts.
  const hiddenViews = new Set(['checkout', 'seller', 'admin'])
  const visible = compareItems.length > 0 && !hiddenViews.has(view)

  // Reserve scroll space so the fixed tray never covers page content
  // (footer, buy-box buttons on product pages).
  useEffect(() => {
    if (typeof document === 'undefined') return
    document.body.style.paddingBottom = visible ? '6.5rem' : ''
    return () => {
      document.body.style.paddingBottom = ''
    }
  }, [visible])

  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          initial={{ y: 80, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: 80, opacity: 0 }}
          transition={{ type: 'spring', stiffness: 320, damping: 30 }}
          className="fixed inset-x-0 bottom-0 z-40 px-3 pb-[max(env(safe-area-inset-bottom),0.625rem)] sm:px-6 sm:pb-4"
          role="region"
          aria-label="Product comparison tray"
        >
          <div className="mx-auto flex max-w-3xl items-center gap-3 rounded-2xl border bg-card/95 px-3 py-2.5 shadow-xl shadow-black/10 backdrop-blur-md sm:px-4">
            <div
              className={cn(
                'flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary',
                compareItems.length >= 2 && 'bg-primary text-primary-foreground',
              )}
              aria-hidden
            >
              <GitCompareArrows size={16} />
            </div>

            <div className="min-w-0 flex-1">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                Compare ({compareItems.length}/{MAX_COMPARE})
                {compareItems.length === 1 && (
                  <span className="ml-1.5 font-normal normal-case tracking-normal">— pick one more</span>
                )}
              </p>
              <div className="mt-1.5 flex items-center gap-1.5">
                {compareItems.map((p) => (
                  <div key={p.id} className="group relative">
                    <button
                      onClick={() => removeFromCompare(p.id)}
                      className="block h-10 w-10 overflow-hidden rounded-lg border-2 border-border transition-colors hover:border-destructive"
                      title={`Remove ${p.title}`}
                      aria-label={`Remove ${p.title} from comparison`}
                    >
                      {p.images[0] ? (
                        <img src={cardImage(p.images)} alt="" className="h-full w-full object-cover" />
                      ) : (
                        <span className="flex h-full items-center justify-center text-[8px] text-muted-foreground">N/A</span>
                      )}
                    </button>
                    <span className="pointer-events-none absolute -right-1 -top-1 flex h-3.5 w-3.5 items-center justify-center rounded-full bg-destructive text-white opacity-0 transition-opacity group-hover:opacity-100">
                      <X size={9} />
                    </span>
                  </div>
                ))}
                {Array.from({ length: MAX_COMPARE - compareItems.length }).map((_, i) => (
                  <div
                    key={`empty-${i}`}
                    className="flex h-10 w-10 items-center justify-center rounded-lg border-2 border-dashed border-border/70 text-muted-foreground/50"
                    aria-hidden
                  >
                    <span className="text-sm leading-none">+</span>
                  </div>
                ))}
              </div>
            </div>

            <div className="flex shrink-0 flex-col gap-1.5 sm:flex-row sm:items-center">
              <Button
                variant="ghost"
                size="sm"
                className="h-8 rounded-full px-2.5 text-xs text-muted-foreground hover:text-foreground"
                onClick={clearCompare}
                aria-label="Clear comparison selection"
              >
                <Trash2 size={13} className="sm:mr-1" />
                <span className="hidden sm:inline">Clear</span>
              </Button>
              <Button
                size="sm"
                className="h-9 rounded-full px-4 text-xs font-semibold shadow-md"
                disabled={compareItems.length < 2}
                onClick={() => setCompareOpen(true)}
              >
                <GitCompareArrows size={14} className="mr-1.5" />
                Compare
                <span className="ml-1.5 tabular-nums">{compareItems.length}</span>
              </Button>
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
