'use client'

import { useMemo, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { FaqAccordion } from '@/components/site/kit'
import { cn } from '@/lib/utils'

/**
 * /faq — topic tabs (ALL + every topic present in the data). When ALL is
 * selected, questions are grouped by topic with featured items first.
 */

export type BrowserFaq = { id: string; topic: string; question: string; answer: string; featured: boolean }

const TOPIC_LABELS: Record<string, string> = {
  GENERAL: 'General',
  FUNDING: 'Funding',
  MARKET: 'Market & orders',
  SELL: 'Selling',
  ACCOUNT: 'Account',
}

const TOPIC_ORDER = ['GENERAL', 'FUNDING', 'MARKET', 'SELL', 'ACCOUNT']

function byFeaturedFirst(a: BrowserFaq, b: BrowserFaq) {
  if (a.featured !== b.featured) return a.featured ? -1 : 1
  return a.question.localeCompare(b.question)
}

export function FaqBrowser({ faqs }: { faqs: BrowserFaq[] }) {
  const topics = useMemo(() => {
    const present = [...new Set(faqs.map((f) => f.topic))]
    present.sort((a, b) => {
      const ia = TOPIC_ORDER.indexOf(a)
      const ib = TOPIC_ORDER.indexOf(b)
      return (ia === -1 ? 99 : ia) - (ib === -1 ? 99 : ib)
    })
    return present
  }, [faqs])

  const [active, setActive] = useState<string>('ALL')
  const selected = active === 'ALL' ? null : active
  const groups = useMemo(() => {
    const pool = selected ? faqs.filter((f) => f.topic === selected) : faqs
    const byTopic = new Map<string, BrowserFaq[]>()
    for (const f of [...pool].sort(byFeaturedFirst)) {
      const list = byTopic.get(f.topic) ?? []
      list.push(f)
      byTopic.set(f.topic, list)
    }
    return [...byTopic.entries()].sort(([a], [b]) => {
      const ia = TOPIC_ORDER.indexOf(a)
      const ib = TOPIC_ORDER.indexOf(b)
      return (ia === -1 ? 99 : ia) - (ib === -1 ? 99 : ib)
    })
  }, [faqs, selected])

  return (
    <div>
      {/* Topic tabs */}
      <div role="tablist" aria-label="FAQ topics" className="flex flex-wrap items-center gap-2">
        {['ALL', ...topics].map((topic) => {
          const isActive = active === topic
          const count = topic === 'ALL' ? faqs.length : faqs.filter((f) => f.topic === topic).length
          return (
            <button
              key={topic}
              type="button"
              role="tab"
              aria-selected={isActive}
              onClick={() => setActive(topic)}
              className={cn(
                'inline-flex min-h-11 items-center gap-2 rounded-full border px-4 py-2 text-sm font-semibold transition-all duration-200 focus-visible:outline-2 focus-visible:outline-offset-2',
                isActive
                  ? 'border-primary bg-primary text-primary-foreground shadow-sm'
                  : 'border-border bg-card text-muted-foreground hover:border-primary/40 hover:text-foreground',
              )}
            >
              {topic === 'ALL' ? 'All questions' : (TOPIC_LABELS[topic] ?? topic)}
              <span className={cn('rounded-full px-1.5 text-[11px] tabular-nums', isActive ? 'bg-primary-foreground/20' : 'bg-muted')}>{count}</span>
            </button>
          )
        })}
      </div>

      {/* Answer groups */}
      <AnimatePresence mode="wait">
        <motion.div
          key={active}
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -8 }}
          transition={{ duration: 0.26, ease: [0.22, 1, 0.36, 1] }}
          className="mt-8 grid gap-8"
        >
          {groups.map(([topic, items]) => (
            <section key={topic} aria-labelledby={`faq-group-${topic}`} className="rounded-3xl border bg-card p-5 sm:p-7">
              <div className="mb-3 flex items-center gap-3">
                <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10 text-xs font-bold text-primary" aria-hidden>
                  {TOPIC_LABELS[topic]?.slice(0, 2).toUpperCase() ?? topic.slice(0, 2)}
                </span>
                <h2 id={`faq-group-${topic}`} className="text-lg font-bold tracking-tight text-foreground">
                  {TOPIC_LABELS[topic] ?? topic}
                </h2>
                <span className="text-xs font-medium text-muted-foreground">{items.length} answered</span>
              </div>
              <FaqAccordion items={items} defaultOpen={false} />
            </section>
          ))}
          {groups.length === 0 && (
            <p className="rounded-2xl border border-dashed p-8 text-center text-sm text-muted-foreground">
              Nothing here yet — ask us directly from the contact page.
            </p>
          )}
        </motion.div>
      </AnimatePresence>
    </div>
  )
}
