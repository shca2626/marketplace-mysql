import type { Metadata } from 'next'
import Image from 'next/image'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { ArrowRight, Clock, User } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { getInsightBody, getInsights } from '@/lib/site-content'
import { Reveal, Section, SectionContainer, SectionHead } from '@/components/site/kit'
import { Markdown } from '@/components/site/markdown'
import { Breadcrumbs } from '@/components/site/breadcrumbs'
import { CtaBand } from '@/components/site/pages/cta-band'
import { formatDate } from '@/components/site/pages/format'

type Props = { params: Promise<{ slug: string }> }

const TOPIC_LABELS: Record<string, string> = {
  GUIDE: 'Guide',
  FUNDING: 'Funding',
  MARKET: 'Market note',
  PRODUCT: 'Product',
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params
  const post = (await getInsights({ slug }))[0]
  if (!post) return { title: 'Insight — Vendora' }
  return {
    title: `${post.title} — Vendora`,
    description: post.excerpt,
  }
}

export default async function InsightArticlePage({ params }: Props) {
  const { slug } = await params
  const post = (await getInsights({ slug }))[0]
  if (!post) notFound()

  const [body, others] = await Promise.all([
    getInsightBody(slug),
    getInsights({ take: 6 }),
  ])
  const more = others.filter((p) => p.slug !== slug).slice(0, 3)

  return (
    <>
      <Breadcrumbs items={[{ label: 'Insights', href: '/insights' }, { label: post.title }]} />

      {/* Article */}
      <Section tone="light" className="pb-14 pt-4 sm:pb-16">
        <SectionContainer>
          <article className="mx-auto max-w-3xl">
            <Reveal>
              <div className="flex flex-wrap items-center gap-3">
                <span className="rounded-full bg-bh-bg-gold px-3 py-1 text-[11px] font-bold uppercase tracking-[0.14em] text-bh-gold-dark">
                  {TOPIC_LABELS[post.topic] ?? post.topic}
                </span>
                <span className="inline-flex items-center gap-1 text-xs text-bh-muted">
                  <Clock className="h-3.5 w-3.5" aria-hidden />
                  {post.readMinutes} min read
                </span>
              </div>
            </Reveal>
            <Reveal delay={1}>
              <h1 className="mt-4 text-balance text-3xl font-bold leading-tight tracking-tight text-bh-navy sm:text-4xl">{post.title}</h1>
            </Reveal>
            <Reveal delay={2}>
              <div className="mt-5 flex flex-wrap items-center gap-x-3 gap-y-2 border-y border-bh-border py-4 text-sm text-bh-muted">
                <span className="inline-flex items-center gap-2 font-medium text-bh-navy">
                  <span className="flex h-9 w-9 items-center justify-center rounded-full bg-bh-bg-gold text-bh-gold-dark" aria-hidden>
                    <User className="h-4 w-4" />
                  </span>
                  {post.authorName ?? 'Vendora Newsroom'}
                </span>
                {post.authorTitle && <span className="text-bh-faded">{post.authorTitle}</span>}
                <span aria-hidden>·</span>
                <time dateTime={post.publishedAt.toISOString()}>{formatDate(post.publishedAt)}</time>
              </div>
            </Reveal>
            <Reveal delay={3}>
              <div className="relative mt-8 aspect-[16/8] overflow-hidden rounded-2xl border border-bh-border bg-bh-soft-blue">
                {post.coverUrl ? (
                  <Image
                    src={post.coverUrl}
                    alt=""
                    fill
                    priority
                    sizes="(max-width: 768px) 100vw, 768px"
                    className="object-cover"
                  />
                ) : null}
              </div>
            </Reveal>
            <Reveal delay={4}>
              <div className="mt-8">
                {body ? (
                  <Markdown body={body} />
                ) : (
                  <p className="rounded-2xl border border-dashed border-bh-border-dark p-8 text-center text-sm text-bh-muted">
                    This article’s body is being edited — check back shortly.
                  </p>
                )}
              </div>
            </Reveal>
          </article>
        </SectionContainer>
      </Section>

      {/* More insights */}
      {more.length > 0 && (
        <Section tone="muted" className="py-12 sm:py-14">
          <SectionContainer>
            <SectionHead
              eyebrow="Keep reading"
              eyebrowIcon="LineChart"
              title="More insights"
              action={
                <Button asChild variant="ghost" className="group h-11 gap-1.5">
                  <Link href="/insights">
                    All insights
                    <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" aria-hidden />
                  </Link>
                </Button>
              }
            />
            <div className="mt-8 grid gap-5 sm:grid-cols-3">
              {more.map((p, i) => (
                <Reveal key={p.id} delay={i}>
                  <Link
                    href={`/insights/${p.slug}`}
                    className="group flex h-full flex-col overflow-hidden rounded-2xl border border-bh-border bg-bh-card shadow-card transition-all duration-300 hover:-translate-y-1 hover:border-bh-gold/40 hover:shadow-hover focus-visible:outline-2 focus-visible:outline-offset-2"
                  >
                    <span className="relative block aspect-[16/9] overflow-hidden bg-bh-soft-blue">
                      {p.coverUrl ? (
                        <Image
                          src={p.coverUrl}
                          alt=""
                          fill
                          sizes="(max-width: 640px) 100vw, 33vw"
                          className="object-cover transition-transform duration-500 group-hover:scale-[1.04]"
                        />
                      ) : null}
                    </span>
                    <span className="flex flex-1 flex-col p-4">
                      <span className="text-[11px] font-bold uppercase tracking-wider text-bh-gold-dark">
                        {TOPIC_LABELS[p.topic] ?? p.topic}
                      </span>
                      <span className="mt-1.5 line-clamp-2 text-sm font-bold leading-snug tracking-tight text-bh-navy transition-colors group-hover:text-bh-action">
                        {p.title}
                      </span>
                      <span className="mt-auto pt-3 text-xs text-bh-muted">
                        {formatDate(p.publishedAt)} · {p.readMinutes} min
                      </span>
                    </span>
                  </Link>
                </Reveal>
              ))}
            </div>
          </SectionContainer>
        </Section>
      )}

      <CtaBand
        eyebrow="From reading to doing"
        title="Put this guide to work"
        sub="Browse the engineer-reviewed market or check what a verified funding entity would charge for your project."
        primary={{ label: 'Apply for funding', href: '/funding' }}
        secondary={{ label: 'Browse the market', href: '/market' }}
        icon="FileText"
      />
    </>
  )
}
