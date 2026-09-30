import type { Metadata } from 'next'
import Image from 'next/image'
import Link from 'next/link'
import { ArrowRight, Clock, User } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { getInsights } from '@/lib/site-content'
import {
  Eyebrow,
  PageHero,
  Reveal,
  Section,
  SectionContainer,
  SectionHead,
} from '@/components/site/kit'
import { InsightsExplorer, type ExplorerPost } from '@/components/site/pages/insights-explorer'
import { NewsletterForm } from '@/components/site/newsletter-form'
import { formatDate } from '@/components/site/pages/format'

export const metadata: Metadata = {
  title: 'Insights — Vendora',
  description:
    'Guides, market notes and financing explainers from the Vendora team: sizing home systems, comparing Murabaha financing, buying batteries that last.',
}

const TOPIC_LABELS: Record<string, string> = {
  GUIDE: 'Guide',
  FUNDING: 'Funding',
  MARKET: 'Market note',
  PRODUCT: 'Product',
}

export default async function InsightsPage() {
  const posts = await getInsights()
  const featured = posts.find((p) => p.featured) ?? posts[0]
  const rest = featured ? posts.filter((p) => p.id !== featured.id) : []

  const serialized: ExplorerPost[] = rest.map((p) => ({
    slug: p.slug,
    title: p.title,
    excerpt: p.excerpt,
    coverUrl: p.coverUrl,
    authorName: p.authorName,
    topic: p.topic,
    readMinutes: p.readMinutes,
    publishedAt: p.publishedAt.toISOString(),
  }))

  return (
    <>
      <PageHero
        eyebrow="Insights"
        title="Guides, market notes and financing explainers"
        sub="Plain-language writing from the engineers and financing specialists who run the platform — read before you buy, quote or sign."
      />

      {/* Featured post — large split card */}
      {featured && (
        <Section tone="light" className="py-12 sm:py-14">
          <SectionContainer>
            <Reveal>
              <article className="group grid overflow-hidden rounded-3xl border bg-card shadow-sm transition-shadow duration-300 hover:shadow-lg hover:shadow-zinc-950/[0.06] lg:grid-cols-2">
                <Link
                  href={`/insights/${featured.slug}`}
                  className="relative block min-h-64 overflow-hidden bg-muted focus-visible:outline-2 focus-visible:outline-offset-[-4px]"
                >
                  {featured.coverUrl ? (
                    <Image
                      src={featured.coverUrl}
                      alt=""
                      fill
                      priority
                      sizes="(max-width: 1024px) 100vw, 50vw"
                      className="object-cover transition-transform duration-500 group-hover:scale-[1.03]"
                    />
                  ) : null}
                  <span className="absolute left-4 top-4 rounded-full bg-zinc-950/80 px-3 py-1 text-[11px] font-bold uppercase tracking-wider text-amber-300 backdrop-blur-sm">
                    {TOPIC_LABELS[featured.topic] ?? featured.topic}
                  </span>
                </Link>
                <div className="flex flex-col gap-4 p-6 sm:p-8 lg:justify-center">
                  <Eyebrow icon="Sun">Featured read</Eyebrow>
                  <h2 className="text-balance text-2xl font-bold leading-tight tracking-tight sm:text-3xl">
                    <Link href={`/insights/${featured.slug}`} className="transition-colors hover:text-primary">
                      {featured.title}
                    </Link>
                  </h2>
                  <p className="text-pretty text-sm leading-relaxed text-muted-foreground sm:text-base">{featured.excerpt}</p>
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                    <span className="inline-flex items-center gap-1.5 font-medium text-foreground">
                      <User className="h-3.5 w-3.5" aria-hidden />
                      {featured.authorName ?? 'Vendora Newsroom'}
                    </span>
                    <span aria-hidden>·</span>
                    <time dateTime={featured.publishedAt.toISOString()}>{formatDate(featured.publishedAt)}</time>
                    <span aria-hidden>·</span>
                    <span className="inline-flex items-center gap-1">
                      <Clock className="h-3.5 w-3.5" aria-hidden />
                      {featured.readMinutes} min read
                    </span>
                  </div>
                  <div>
                    <Button asChild className="mt-2 h-12 rounded-full px-6">
                      <Link href={`/insights/${featured.slug}`}>
                        Read the article
                        <ArrowRight className="ml-1.5 h-4 w-4" aria-hidden />
                      </Link>
                    </Button>
                  </div>
                </div>
              </article>
            </Reveal>
          </SectionContainer>
        </Section>
      )}

      {/* Filterable grid */}
      <Section tone="muted" className="py-12 sm:py-14">
        <SectionContainer>
          <SectionHead
            eyebrow="All insights"
            eyebrowIcon="LineChart"
            title="Everything we’ve published"
            sub="Filter by topic — sizing guides, market behaviour and how financing really works."
          />
          <div className="mt-8">
            <InsightsExplorer posts={serialized} />
          </div>
        </SectionContainer>
      </Section>

      {/* Newsletter */}
      <Section tone="dark" curve="up" className="py-14 sm:py-16">
        <SectionContainer>
          <div className="mx-auto flex max-w-2xl flex-col items-center text-center">
            <Reveal>
              <Eyebrow tone="dark" icon="Mail">
                Monthly, no spam
              </Eyebrow>
            </Reveal>
            <Reveal delay={1}>
              <h2 className="mt-5 text-balance text-2xl font-bold tracking-tight text-zinc-50 sm:text-3xl">
                New guides, programs and products — straight to your inbox
              </h2>
            </Reveal>
            <Reveal delay={2}>
              <p className="mt-3 max-w-xl text-pretty text-sm leading-relaxed text-zinc-400 sm:text-base">
                One email a month with the latest insights, funding programs and platform news. Unsubscribe anytime.
              </p>
            </Reveal>
            <Reveal delay={3} className="mt-7 w-full max-w-md">
              <NewsletterForm />
            </Reveal>
          </div>
        </SectionContainer>
      </Section>
    </>
  )
}
