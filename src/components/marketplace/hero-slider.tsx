'use client'

// Hero banner slider — the admin-controlled storefront hero.
// ─────────────────────────────────────────────────────────────────────────────
// Content (slides) and behavior (orientation, autoplay, arrows, dots, height)
// come entirely from platform settings + the BannerSlide table — nothing here
// is hardcoded. Two orientations are supported and switchable from the admin
// panel at runtime:
//   • horizontal — slides travel left/right, side arrows, bottom-center dots
//   • vertical   — slides travel up/down, stacked edge arrows, side dot rail
// Motion is reduced-motion aware; the slider pauses on hover/focus and can
// be driven by keyboard (← → / ↑ ↓) and touch swipe.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { AnimatePresence, motion, type Variants } from 'framer-motion'
import { ArrowDown, ArrowLeft, ArrowRight, ArrowUp } from 'lucide-react'
import { useMarketplace } from '@/store/marketplace'
import type { BannerSlideDTO } from '@/lib/settings/schema'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'

const HEIGHTS = {
  short: 'h-[16rem] sm:h-[20rem] lg:h-[22rem]',
  medium: 'h-[18rem] sm:h-[24rem] lg:h-[27rem]',
  tall: 'h-[21rem] sm:h-[29rem] lg:h-[34rem]',
} as const

type Dir = 1 | -1

export function HeroSlider() {
  const slides = useMarketplace((s) => s.slides)
  const config = useMarketplace((s) => s.settings.slider)
  const navigate = useMarketplace((s) => s.navigate)

  const [index, setIndex] = useState(0)
  const [dir, setDir] = useState<Dir>(1)
  const [paused, setPaused] = useState(false)
  const regionRef = useRef<HTMLDivElement>(null)

  const visible = useMemo(() => slides.filter((s) => s.active), [slides])
  const count = visible.length

  const go = useCallback(
    (next: number, direction: Dir) => {
      if (count === 0) return
      setDir(direction)
      setIndex(((next % count) + count) % count)
    },
    [count]
  )
  const next = useCallback(() => go(index + 1, 1), [go, index])
  const prev = useCallback(() => go(index - 1, -1), [go, index])

  // autoplay (pauses on hover/focus of the slider region)
  useEffect(() => {
    if (!config.autoplay || paused || count <= 1) return
    const t = setInterval(next, config.intervalSec * 1000)
    return () => clearInterval(t)
  }, [config.autoplay, config.intervalSec, next, paused, count])

  // keyboard control while the region has focus
  const onKeyDown = (e: React.KeyboardEvent) => {
    if (config.orientation === 'horizontal') {
      if (e.key === 'ArrowRight') { e.preventDefault(); next() }
      if (e.key === 'ArrowLeft') { e.preventDefault(); prev() }
    } else {
      if (e.key === 'ArrowDown') { e.preventDefault(); next() }
      if (e.key === 'ArrowUp') { e.preventDefault(); prev() }
    }
  }

  // touch swipe — dominant axis picks the travel direction
  const swipe = (e: MouseEvent | TouchEvent | PointerEvent, info: { offset: { x: number; y: number } }) => {
    const { x, y } = info.offset
    if (config.orientation === 'horizontal') {
      if (Math.abs(x) > 48) go(index + (x < 0 ? 1 : -1), x < 0 ? 1 : -1)
    } else if (Math.abs(y) > 48) {
      go(index + (y < 0 ? 1 : -1), y < 0 ? 1 : -1)
    }
  }

  if (!config.enabled || count === 0) return null

  const vertical = config.orientation === 'vertical'
  const slide = visible[index]

  // direction-aware slide variants
  const variants: Variants = vertical
    ? {
        enter: (d: Dir) => ({ y: d > 0 ? '100%' : '-100%', opacity: 0.6 }),
        center: { y: 0, opacity: 1 },
        exit: (d: Dir) => ({ y: d > 0 ? '-100%' : '100%', opacity: 0.6 }),
      }
    : {
        enter: (d: Dir) => ({ x: d > 0 ? '100%' : '-100%', opacity: 0.6 }),
        center: { x: 0, opacity: 1 },
        exit: (d: Dir) => ({ x: d > 0 ? '-100%' : '100%', opacity: 0.6 }),
      }

  return (
    <section aria-label="Featured promotions" aria-roledescription="carousel">
      <div
        ref={regionRef}
        role="region"
        aria-roledescription={vertical ? 'vertical carousel' : 'carousel'}
        tabIndex={0}
        onKeyDown={onKeyDown}
        onMouseEnter={() => setPaused(true)}
        onMouseLeave={() => setPaused(false)}
        onFocus={() => setPaused(true)}
        onBlur={() => setPaused(false)}
        className={cn(
          'group/slider relative w-full touch-pan-y overflow-hidden bg-bh-navy-deep outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
          HEIGHTS[config.height]
        )}
      >
        {/* ── slides ── */}
        <div className="absolute inset-0">
          <AnimatePresence initial={false} custom={dir} mode="popLayout">
            <motion.div
              key={slide.id}
              custom={dir}
              variants={variants}
              initial="enter"
              animate="center"
              exit="exit"
              transition={{ duration: 0.55, ease: [0.32, 0.72, 0, 1] }}
              drag={vertical ? 'y' : 'x'}
              dragConstraints={{ left: 0, right: 0, top: 0, bottom: 0 }}
              dragElastic={0.16}
              onDragEnd={swipe}
              className="absolute inset-0 cursor-grab active:cursor-grabbing"
            >
              {/* image + navy duotone overlay — text stays readable on any photo */}
              <img
                src={slide.image}
                alt={slide.title ?? 'Promotion'}
                className="h-full w-full select-none object-cover"
                draggable={false}
                onError={(e) => { (e.target as HTMLImageElement).style.opacity = '0' }}
              />
              <div
                aria-hidden
                className={cn(
                  'absolute inset-0',
                  vertical
                    ? 'bg-gradient-to-t from-[#052e56]/90 via-[#052e56]/40 to-transparent'
                    : 'bg-gradient-to-r from-[#052e56]/90 via-[#052e56]/45 to-transparent'
                )}
              />

              {/* content */}
              <div className="absolute inset-0 flex items-center">
                <div className="mx-auto w-full max-w-7xl px-4 sm:px-6">
                <div className={cn('max-w-xl', vertical ? 'pb-14 sm:pb-16' : '')}>
                  <AnimatePresence mode="wait">
                    <motion.div
                      key={`text-${slide.id}`}
                      initial={{ opacity: 0, y: 18 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -12 }}
                      transition={{ duration: 0.4, delay: 0.12 }}
                    >
                      {slide.eyebrow && (
                        <p className="mb-3 inline-flex items-center gap-2 rounded-full border border-bh-gold/30 bg-bh-gold/15 px-3 py-1 text-[11px] font-bold uppercase tracking-[0.14em] text-bh-gold backdrop-blur-sm">
                          <span className="h-1.5 w-1.5 rounded-full bg-bh-gold" aria-hidden />
                          {slide.eyebrow}
                        </p>
                      )}
                      {slide.title && (
                        <h1 className="text-3xl font-extrabold leading-[1.05] tracking-tight text-white drop-shadow-sm sm:text-4xl lg:text-5xl">
                          {slide.title}
                        </h1>
                      )}
                      {slide.subtitle && (
                        <p className="mt-3 max-w-md text-sm leading-relaxed text-white/85 sm:text-base">
                          {slide.subtitle}
                        </p>
                      )}
                      {slide.ctaLabel && (
                        <Button
                          size="lg"
                          className="mt-5 rounded-xl bg-bh-gold px-6 font-bold text-bh-navy-deep hover:bg-bh-gold-light"
                          onClick={() =>
                            navigate(
                              (slide.ctaView as 'catalog' | 'seller' | 'home' | 'favorites' | 'orders' | 'account') ?? 'catalog',
                              slide.ctaCategory ? { category: slide.ctaCategory } : {}
                            )
                          }
                        >
                          {slide.ctaLabel}
                        </Button>
                      )}
                    </motion.div>
                  </AnimatePresence>
                </div>
                </div>
              </div>
            </motion.div>
          </AnimatePresence>
        </div>

        {/* ── arrows ── */}
        {config.showArrows && count > 1 && vertical ? (
          // vertical: stacked at the right edge
          <div className="absolute right-4 top-1/2 z-10 flex -translate-y-1/2 flex-col gap-2 sm:right-6">
            <ArrowButton label="Previous slide" onClick={prev}>
              <ArrowUp size={17} />
            </ArrowButton>
            <ArrowButton label="Next slide" onClick={next}>
              <ArrowDown size={17} />
            </ArrowButton>
          </div>
        ) : config.showArrows && count > 1 ? (
          // horizontal: flanking edges, revealed on hover/focus
          <>
            <ArrowButton
              label="Previous slide"
              onClick={prev}
              className="left-3 sm:left-5"
              hideUntilInteraction
            >
              <ArrowLeft size={18} />
            </ArrowButton>
            <ArrowButton
              label="Next slide"
              onClick={next}
              className="right-3 sm:right-5"
              hideUntilInteraction
            >
              <ArrowRight size={18} />
            </ArrowButton>
          </>
        ) : null}

        {/* ── progress dots / rail ── */}
        {config.showDots && count > 1 && (
          <nav
            aria-label="Slide navigation"
            className={cn(
              'z-10 flex items-center gap-1.5',
              vertical
                ? 'absolute right-4 top-4 flex-col sm:right-6'
                : 'absolute bottom-3 left-1/2 -translate-x-1/2'
            )}
          >
            {visible.map((s, i) => (
              <button
                key={s.id}
                onClick={() => go(i, i > index ? 1 : -1)}
                aria-label={`Go to slide ${i + 1}: ${s.title ?? 'promotion'}`}
                aria-current={i === index}
                className={cn(
                  'rounded-full bg-white/40 backdrop-blur-sm transition-all duration-300 hover:bg-white/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white',
                  vertical
                    ? i === index
                      ? 'h-6 w-1.5 bg-white'
                      : 'h-2.5 w-1.5'
                    : i === index
                      ? 'h-1.5 w-7 bg-white'
                      : 'h-1.5 w-1.5'
                )}
              />
            ))}
          </nav>
        )}

        {/* ── slide counter (vertical flavor) ── */}
        {vertical && count > 1 && (
          <p className="absolute bottom-3 left-4 z-10 font-mono text-[11px] tracking-[0.2em] text-white/75 sm:left-6">
            {String(index + 1).padStart(2, '0')} / {String(count).padStart(2, '0')}
          </p>
        )}

        {/* autoplay progress edge — subtle life signal for the current slide */}
        {config.autoplay && !paused && count > 1 && (
          <motion.div
            key={`progress-${slide.id}-${config.intervalSec}`}
            aria-hidden
            className="absolute bottom-0 left-0 z-10 h-0.5 w-full origin-left bg-white/80"
            initial={{ scaleX: 0 }}
            animate={{ scaleX: 1 }}
            transition={{ duration: config.intervalSec, ease: 'linear' }}
          />
        )}
      </div>
    </section>
  )
}

function ArrowButton({
  label,
  onClick,
  className,
  hideUntilInteraction,
  children,
}: {
  label: string
  onClick: () => void
  className?: string
  hideUntilInteraction?: boolean
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      aria-label={label}
      onClick={onClick}
      className={cn(
        'flex h-10 w-10 items-center justify-center rounded-full border border-white/20 bg-[#052e56]/45 text-white backdrop-blur-md transition-all duration-200 hover:bg-[#052e56]/75 hover:scale-105 active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white disabled:pointer-events-none disabled:opacity-0',
        hideUntilInteraction &&
          'opacity-0 group-hover/slider:opacity-100 focus-visible:opacity-100 max-md:opacity-100',
        className
      )}
    >
      {children}
    </button>
  )
}
