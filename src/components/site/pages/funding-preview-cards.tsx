'use client'

import Link from 'next/link'
import { motion } from 'framer-motion'
import { ArrowRight, BadgeCheck } from 'lucide-react'

/**
 * Homepage S4 — animated entity cards for the funding preview.
 * Client child of the (server) FundingPreview: receives entity rows fetched
 * from the DB and links each card to its entity profile page.
 */

export type PreviewEntity = {
  id: string
  name: string
  typeLabel: string
  note: string
  monogram: string
  accent: string
}

export function FundingPreviewCards({ entities }: { entities: PreviewEntity[] }) {
  if (entities.length === 0) return null
  return (
    <div className="grid gap-5 lg:grid-cols-3">
      {entities.map((e, i) => (
        <motion.div
          key={e.id}
          initial={{ opacity: 0, y: 16 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ delay: i * 0.08, duration: 0.35 }}
        >
          <Link
            href={`/funding/entities/${e.id}`}
            className="group flex h-full items-start gap-4 rounded-2xl border bg-card p-5 transition-all duration-200 hover:-translate-y-1 hover:shadow-lg hover:shadow-primary/10 focus-visible:outline-2 focus-visible:outline-offset-2"
            style={{ borderColor: undefined }}
          >
            <span
              className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl font-extrabold"
              aria-hidden
              style={{ backgroundColor: `${e.accent}14`, color: e.accent, border: `1px solid ${e.accent}45` }}
            >
              {e.monogram}
            </span>
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <h3 className="truncate text-base font-bold tracking-tight group-hover:text-primary">{e.name}</h3>
                <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2 py-0.5 text-[11px] font-semibold text-emerald-700 dark:bg-emerald-950 dark:text-emerald-400">
                  <BadgeCheck size={12} aria-hidden /> Verified
                </span>
              </div>
              <p className="mt-0.5 text-xs font-medium uppercase tracking-wide text-muted-foreground">{e.typeLabel}</p>
              <p className="mt-2 line-clamp-2 text-sm leading-relaxed text-muted-foreground">{e.note}</p>
              <span className="mt-2 inline-flex items-center gap-1 text-xs font-semibold text-primary">
                View entity profile
                <ArrowRight size={13} className="transition-transform duration-200 group-hover:translate-x-0.5" aria-hidden />
              </span>
            </div>
          </Link>
        </motion.div>
      ))}
    </div>
  )
}
