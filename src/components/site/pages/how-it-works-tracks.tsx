'use client'

import Link from 'next/link'
import { useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { ArrowRight } from 'lucide-react'
import { Icon, StepFlow, type StepItem } from '@/components/site/kit'
import { cn } from '@/lib/utils'

/**
 * /how-it-works — interactive track switcher (pagedesign.md Phase 4).
 * Three pillar cards (Shop / Buy as a business / Fund your project); picking
 * one animates the matching StepFlow in via framer-motion AnimatePresence.
 * Step content is 100% DB-driven (getSiteSteps); only the pillar chrome is UI.
 */

export type TrackKey = 'SHOP' | 'PROCURE' | 'FUND'
export type TrackSteps = Record<TrackKey, StepItem[]>

const TRACKS: {
  key: TrackKey
  icon: string
  label: string
  pitch: [string, string]
  starts: string
  startsLabel: string
  accent: string
}[] = [
  {
    key: 'SHOP',
    icon: 'ShoppingCart',
    label: 'Shop',
    pitch: ['Engineer-reviewed gear from vetted, independent stores.', 'Cart, checkout and delivery you can track.'],
    starts: '/market',
    startsLabel: 'Starts in the market',
    accent: '#d97706',
  },
  {
    key: 'PROCURE',
    icon: 'Building2',
    label: 'Buy as a business',
    pitch: ['One RFQ reaches every qualified seller at once.', 'Quotes, approvals and recurring cycles.'],
    starts: '/market?view=rfqs',
    startsLabel: 'Starts in the B2B console',
    accent: '#059669',
  },
  {
    key: 'FUND',
    icon: 'Landmark',
    label: 'Fund your project',
    pitch: ['Verified entities compete with binding offers.', 'E-sign the agreement and get funded.'],
    starts: '/funding',
    startsLabel: 'Starts at the funding hub',
    accent: '#b45309',
  },
]

export function HowItWorksTracks({ tracks }: { tracks: TrackSteps }) {
  const [active, setActive] = useState<TrackKey>('SHOP')
  const activeTrack = TRACKS.find((t) => t.key === active)!
  const steps = tracks[activeTrack.key] ?? []

  return (
    <div>
      {/* Pillar cards */}
      <div role="tablist" aria-label="Choose your path" className="grid gap-4 md:grid-cols-3">
        {TRACKS.map((t) => {
          const selected = t.key === active
          const stepCount = (tracks[t.key] ?? []).length
          return (
            <div
              key={t.key}
              className={cn(
                'group relative overflow-hidden rounded-2xl border p-6 transition-all duration-300',
                selected ? 'shadow-lg' : 'hover:-translate-y-0.5 hover:shadow-md',
              )}
              style={{
                borderColor: selected ? t.accent : undefined,
                boxShadow: selected ? `0 12px 32px -12px ${t.accent}55` : undefined,
                backgroundColor: selected ? `${t.accent}0d` : undefined,
              }}
            >
              {/* selection button — stretched under the content */}
              <button
                type="button"
                role="tab"
                id={`track-tab-${t.key}`}
                aria-selected={selected}
                aria-controls="track-panel"
                onClick={() => setActive(t.key)}
                className="absolute inset-0 z-0 cursor-pointer rounded-2xl focus-visible:outline-2 focus-visible:outline-offset-[-4px]"
                style={{ outlineColor: t.accent }}
              >
                <span className="sr-only">{`Show the “${t.label}” path`}</span>
              </button>

              <div className="pointer-events-none relative z-10 flex h-full flex-col gap-4">
                <div className="flex items-start justify-between gap-3">
                  <span
                    className="inline-flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl border"
                    style={{ backgroundColor: `${t.accent}14`, borderColor: `${t.accent}45`, color: t.accent }}
                  >
                    <Icon name={t.icon} className="h-7 w-7" />
                  </span>
                  {selected && (
                    <span
                      className="mt-1 inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-bold uppercase tracking-wider"
                      style={{ backgroundColor: `${t.accent}1a`, color: t.accent }}
                    >
                      <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: t.accent }} aria-hidden />
                      Selected
                    </span>
                  )}
                </div>
                <div>
                  <h3 className="text-lg font-bold tracking-tight text-foreground">{t.label}</h3>
                  <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">
                    {t.pitch[0]}
                    <br />
                    {t.pitch[1]}
                  </p>
                </div>
                <div className="mt-auto flex items-center justify-between gap-2 pt-1">
                  <span className="text-xs font-medium text-muted-foreground">
                    {stepCount > 0 ? `${stepCount} steps` : ''}
                  </span>
                  <Link
                    href={t.starts}
                    className="pointer-events-auto inline-flex min-h-11 items-center gap-1.5 rounded-xl px-3 text-sm font-semibold transition-colors focus-visible:outline-2"
                    style={{ color: t.accent }}
                  >
                    {t.startsLabel}
                    <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" aria-hidden />
                  </Link>
                </div>
              </div>
            </div>
          )
        })}
      </div>

      {/* Animated step flow for the selected track */}
      <div
        role="tabpanel"
        id="track-panel"
        aria-labelledby={`track-tab-${active}`}
        className="mt-8 rounded-3xl border bg-muted/30 p-5 sm:p-8"
      >
        <AnimatePresence mode="wait">
          <motion.div
            key={active}
            initial={{ opacity: 0, x: 28 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -20 }}
            transition={{ duration: 0.32, ease: [0.22, 1, 0.36, 1] }}
          >
            <div className="mb-6 flex flex-wrap items-center gap-3">
              <span
                className="inline-flex h-9 w-9 items-center justify-center rounded-xl"
                style={{ backgroundColor: `${activeTrack.accent}14`, color: activeTrack.accent }}
              >
                <Icon name={activeTrack.icon} className="h-5 w-5" />
              </span>
              <div>
                <p className="text-sm font-bold text-foreground">
                  {activeTrack.label === 'Shop' ? 'Shopping for your home' : activeTrack.label === 'Fund your project' ? 'Funding your project' : 'Procuring as a business'}
                </p>
                <p className="text-xs text-muted-foreground">Step by step, from first click to power on.</p>
              </div>
            </div>
            {steps.length > 0 ? (
              <StepFlow steps={steps} columns={4} />
            ) : (
              <p className="py-8 text-center text-sm text-muted-foreground">Steps for this path are being prepared.</p>
            )}
          </motion.div>
        </AnimatePresence>
      </div>
    </div>
  )
}
