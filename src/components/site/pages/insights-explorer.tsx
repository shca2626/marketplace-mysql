'use client'

import Image from 'next/image'
import Link from 'next/link'
import { useMemo, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { ArrowRight, Clock, User } from 'lucide-react'
import { cn } from '@/lib/utils'
import { formatDate } from './format'

/**
 * /insights — topic filter chips + animated post grid (AnimatePresence layout).
 * Receives already-serialized posts from the server page; filtering is pure
 * client-side so switching topics feels instant.
 */

export type ExplorerPost = {
  slug: string
  title: string
  excerpt: string
  coverUrl: string | null
  authorName: string | null
  topic: string
  readMinutes: number
  publishedAt: string
}

const TOPIC_LABELS: Record<string, string> = {
  GUIDE: 'Guides',
  FUNDING: 'Funding',
  MARKET: 'Market notes',
  PRODUCT: 'Product',
}

export function InsightsExplorer({ posts }: { posts: ExplorerPost[] }) {
  const topics = useMemo(() => {
    const seen: string[] = []
    for (const p of posts) if (!seen.includes(p.topic)) seen.push(p.topic)
    return seen
  }, [posts])
  const [active, setActive] = useState<string>('ALL')

  const filtered = active === 'ALL' ? posts : posts.filter((p) => p.topic === active)

  return (
    <div>
      {/* Topic chips */}
      <div role="tablist" aria-label="Filter insights by topic" className="flex flex-wrap items-center gap-2">
        {['ALL', ...topics].map((topic) => {
          const selected = active === topic
          const label = topic === 'ALL' ? `All posts` : (TOPIC_LABELS[topic] ?? topic)
          const count = topic === 'ALL' ? posts.length : posts.filter((p) => p.topic === topic).length
          return (
            <button
              key={topic}
              type="button"
              role="tab"
              aria-selected={selected}
              onClick={() => setActive(topic)}
              className={cn(
                'inline-flex min-h-11 items-center gap-2 rounded-full border px-4 py-2 text-sm font-semibold transition-all duration-200 focus-visible:outline-2 focus-visible:outline-offset-2',
                selected
                  ? 'border-primary bg-primary text-primary-foreground shadow-sm'
                  : 'border-border bg-card text-muted-foreground hover:border-primary/40 hover:text-foreground',
              )}
            >
              {label}
              <span className={cn('rounded-full px-1.5 text-[11px] tabular-nums', selected ? 'bg-primary-foreground/20' : 'bg-muted')}>
                {count}
              </span>
            </button>
          )
        })}
      </div>

      {/* Animated grid */}
      <motion.div layout className="mt-8 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
        <AnimatePresence mode="popLayout">
          {filtered.map((post) => (
            <motion.article
              key={post.slug}
              layout
              initial={{ opacity: 0, scale: 0.96 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.94 }}
              transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
              className="group relative flex flex-col overflow-hidden rounded-2xl border bg-card transition-shadow duration-300 hover:shadow-lg hover:shadow-zinc-950/[0.06]"
            >
              <Link href={`/insights/${post.slug}`} className="absolute inset-0 z-10 rounded-2xl focus-visible:outline-2 focus-visible:outline-offset-2">
                <span className="sr-only">{post.title}</span>
              </Link>
              <div className="relative aspect-[16/10] overflow-hidden bg-muted">
                {post.coverUrl ? (
                  <Image
                    src={post.coverUrl}
                    alt=""
                    fill
                    sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"
                    className="object-cover transition-transform duration-500 group-hover:scale-[1.04]"
                  />
                ) : null}
                <span className="absolute left-3 top-3 rounded-full bg-zinc-950/80 px-2.5 py-1 text-[11px] font-bold uppercase tracking-wider text-amber-300 backdrop-blur-sm">
                  {TOPIC_LABELS[post.topic] ?? post.topic}
                </span>
              </div>
              <div className="flex flex-1 flex-col p-5">
                <h3 className="line-clamp-2 text-base font-bold leading-snug tracking-tight text-foreground transition-colors group-hover:text-primary">
                  {post.title}
                </h3>
                <p className="mt-2 line-clamp-2 text-sm leading-relaxed text-muted-foreground">{post.excerpt}</p>
                <div className="mt-4 flex flex-wrap items-center gap-x-3 gap-y-1 border-t pt-4 text-xs text-muted-foreground">
                  <span className="inline-flex items-center gap-1.5 font-medium text-foreground">
                    <User className="h-3.5 w-3.5" aria-hidden />
                    {post.authorName ?? 'Vendora Newsroom'}
                  </span>
                  <span aria-hidden>·</span>
                  <time dateTime={post.publishedAt}>{formatDate(post.publishedAt)}</time>
                  <span aria-hidden>·</span>
                  <span className="inline-flex items-center gap-1">
                    <Clock className="h-3.5 w-3.5" aria-hidden />
                    {post.readMinutes} min read
                  </span>
                </div>
              </div>
              <span className="pointer-events-none absolute right-4 top-4 flex h-9 w-9 items-center justify-center rounded-full bg-zinc-950/80 text-amber-300 opacity-0 backdrop-blur-sm transition-all duration-300 group-hover:opacity-100">
                <ArrowRight className="h-4 w-4" aria-hidden />
              </span>
            </motion.article>
          ))}
        </AnimatePresence>
      </motion.div>

      {filtered.length === 0 && (
        <p className="mt-10 rounded-2xl border border-dashed p-8 text-center text-sm text-muted-foreground">
          No insights published under this topic yet — check back soon.
        </p>
      )}
    </div>
  )
}
