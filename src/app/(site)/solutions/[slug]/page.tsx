import type { Metadata } from 'next'
import Image from 'next/image'
import Link from 'next/link'
import { headers } from 'next/headers'
import { notFound } from 'next/navigation'
import { ArrowRight, BadgeCheck, ChevronRight } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { db } from '@/lib/db'
import { getFundingPrograms, getSolutions, type PublicSolution } from '@/lib/site-content'
import {
  GlowCard,
  IconTile,
  PROGRAM_CATEGORIES,
  RATE_LABELS,
  RevealGroup,
  RevealItem,
  Section,
  SectionContainer,
  SectionHead,
} from '@/components/site/kit'
import { Breadcrumbs } from '@/components/site/breadcrumbs'
import { CtaBand } from '@/components/site/pages/cta-band'
import { firstImage, moneyRangeLabel } from '@/components/site/pages/format'

type Props = { params: Promise<{ slug: string }> }

/** Audience chip labels + which funding-program categories match each audience. */
const AUDIENCE_LABELS: Record<string, string> = {
  HOME: 'For homes',
  FARM: 'For farms',
  BUSINESS: 'For business',
}
const RELEVANT_PROGRAM_CATEGORIES: Record<string, string[]> = {
  HOME: ['HOME'],
  FARM: ['AGRICULTURE'],
  BUSINESS: ['SME', 'WORKING_CAPITAL'],
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params
  const solution = (await getSolutions(slug))[0]
  if (!solution) return { title: 'Solution — Vendora' }
  return {
    title: `${solution.title} — Vendora`,
    description: solution.description ?? solution.tagline ?? `Explore ${solution.title} on Vendora.`,
  }
}

/** Curated products for the solution's category — best sellers first. */
async function getCuratedProducts(solution: PublicSolution) {
  try {
    return await db.product.findMany({
      where: {
        status: 'ACTIVE',
        category: { slug: solution.categorySlug ?? '__none__' },
        seller: { status: 'ACTIVE' },
      },
      select: { id: true, title: true, price: true, images: true },
      take: 4,
      orderBy: { soldCount: 'desc' },
    })
  } catch {
    return []
  }
}

export default async function SolutionDetailPage({ params }: Props) {
  const { slug } = await params
  const solution = (await getSolutions(slug))[0]
  if (!solution) notFound()

  const [products, programs] = await Promise.all([getCuratedProducts(solution), getFundingPrograms()])
  const relevantCategories = RELEVANT_PROGRAM_CATEGORIES[solution.audience] ?? []
  const relevantPrograms = programs.filter((p) => relevantCategories.includes(p.category)).slice(0, 3)
  const accent = solution.accentColor ?? '#d3af3c'

  // Absolute URLs for JSON-LD (sandbox host aware)
  const h = await headers()
  const host = h.get('host') ?? 'localhost:3000'
  const proto = h.get('x-forwarded-proto') ?? 'http'
  const base = `${proto}://${host}`
  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [
      { '@type': 'ListItem', position: 1, name: 'Home', item: base },
      { '@type': 'ListItem', position: 2, name: 'Solutions', item: `${base}/solutions` },
      { '@type': 'ListItem', position: 3, name: solution.title, item: `${base}/solutions/${solution.slug}` },
    ],
  }

  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
      <Breadcrumbs items={[{ label: 'Solutions', href: '/solutions' }, { label: solution.title }]} />

      {/* Hero — full-bleed image band with navy gradient overlay */}
      <section className="relative isolate overflow-hidden bg-[#052e56] text-white">
        <div className="absolute inset-0" aria-hidden>
          {solution.imageUrl ? (
            <Image src={solution.imageUrl} alt="" fill priority sizes="100vw" className="object-cover opacity-60" />
          ) : (
            <span className="absolute inset-0 bg-bh-navy-deep" />
          )}
          <div className="absolute inset-0 bg-gradient-to-t from-[#052e56] via-[#052e56]/85 to-[#052e56]/40" />
        </div>
        <SectionContainer className="relative pb-14 pt-12 sm:pb-20 sm:pt-16">
          <nav aria-label="Breadcrumb" className="mb-6 flex items-center gap-2 text-xs text-white/60">
            <Link href="/" className="rounded px-1 py-0.5 transition-colors hover:text-bh-gold">
              Home
            </Link>
            <ChevronRight className="h-3.5 w-3.5 opacity-60" aria-hidden />
            <Link href="/solutions" className="rounded px-1 py-0.5 transition-colors hover:text-bh-gold">
              Solutions
            </Link>
            <ChevronRight className="h-3.5 w-3.5 opacity-60" aria-hidden />
            <span aria-current="page" className="px-1 py-0.5 font-semibold text-bh-gold">
              {solution.title}
            </span>
          </nav>

          <div className="max-w-3xl">
            <span
              className="inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.14em]"
              style={{ borderColor: `${accent}66`, backgroundColor: `${accent}26`, color: '#d3af3c' }}
            >
              {AUDIENCE_LABELS[solution.audience] ?? solution.audience}
            </span>
            <h1 className="mt-5 text-balance text-3xl font-bold leading-tight tracking-tight text-white sm:text-4xl lg:text-5xl">
              {solution.title}
            </h1>
            {solution.tagline && (
              <p className="mt-4 text-pretty text-lg font-medium text-bh-gold">{solution.tagline}</p>
            )}
            {solution.description && (
              <p className="mt-4 max-w-2xl text-pretty text-base leading-relaxed text-white/70">{solution.description}</p>
            )}
            <div className="mt-7 flex flex-wrap items-center gap-3">
              <Button
                asChild
                size="lg"
                className="h-12 rounded-full border-0 bg-bh-gold px-6 text-base font-bold text-bh-navy-deep hover:bg-bh-gold-light"
              >
                <Link href={solution.categorySlug ? `/market?category=${solution.categorySlug}` : '/market'}>
                  Shop the system
                  <ArrowRight className="ml-1.5 h-4 w-4" aria-hidden />
                </Link>
              </Button>
              <Button
                asChild
                size="lg"
                variant="outline"
                className="h-12 rounded-full border-white/25 bg-transparent px-6 text-base text-white hover:bg-white/10 hover:text-white"
              >
                <Link href="/funding">Finance it</Link>
              </Button>
            </div>
          </div>
        </SectionContainer>
      </section>

      {/* Features bento */}
      {solution.features.length > 0 && (
        <Section tone="light" className="py-14 sm:py-16">
          <SectionContainer>
            <SectionHead
              eyebrow="What’s inside"
              eyebrowIcon="Package"
              title={`Built around ${solution.title.toLowerCase()}`}
              sub="The capabilities this path is engineered around — every listing in the market is sized against them."
            />
            <RevealGroup className="mt-10 grid gap-5 sm:grid-cols-2" stagger={0.09}>
              {solution.features.map((f, i) => (
                <RevealItem key={f.id} className={i === 0 ? 'sm:col-span-2' : undefined}>
                  <GlowCard accent={accent} className="flex h-full flex-col gap-4 sm:flex-row sm:items-start">
                    <IconTile name={f.icon} accent={accent} size={i === 0 ? 'lg' : 'md'} />
                    <div className="min-w-0">
                      <h3 className="font-bold tracking-tight">{f.title}</h3>
                      {f.body && <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">{f.body}</p>}
                    </div>
                  </GlowCard>
                </RevealItem>
              ))}
            </RevealGroup>
          </SectionContainer>
        </Section>
      )}

      {/* Curated products */}
      <Section tone="muted" className="py-14 sm:py-16">
        <SectionContainer>
          <SectionHead
            eyebrow="Curated from the market"
            eyebrowIcon="ShoppingCart"
            title="Best sellers for this system"
            sub="Live from the market — top-selling gear in this category, ranked by what buyers actually order."
            action={
              <Button asChild variant="outline" className="h-11 rounded-full">
                <Link href={solution.categorySlug ? `/market?view=catalog&category=${solution.categorySlug}` : '/market'}>
                  Shop this category
                  <ArrowRight className="ml-1.5 h-4 w-4" aria-hidden />
                </Link>
              </Button>
            }
          />
          {products.length === 0 ? (
            <p className="mt-8 rounded-2xl border border-dashed border-bh-border-dark bg-background/60 p-8 text-center text-sm text-bh-muted">
              Curated picks for this system are on their way — browse the full market in the meantime.
            </p>
          ) : (
            <div className="mt-8 grid grid-flow-col auto-cols-[75%] gap-4 overflow-x-auto pb-2 sm:auto-cols-[45%] sm:grid-flow-row sm:grid-cols-2 sm:overflow-visible lg:grid-cols-4">
              {products.map((p) => {
                const img = firstImage(p.images)
                return (
                  <Link
                    key={p.id}
                    href={`/market?view=product&id=${p.id}`}
                    className="group flex flex-col overflow-hidden rounded-2xl border border-bh-border bg-bh-card shadow-card transition-all duration-300 hover:-translate-y-1 hover:border-bh-gold/40 hover:shadow-hover focus-visible:outline-2 focus-visible:outline-offset-2"
                  >
                    <span className="relative block aspect-square overflow-hidden bg-bh-soft-blue">
                      {img ? (
                        <Image
                          src={img}
                          alt=""
                          fill
                          sizes="(max-width: 640px) 75vw, (max-width: 1024px) 45vw, 25vw"
                          className="object-cover transition-transform duration-500 group-hover:scale-[1.05]"
                        />
                      ) : null}
                    </span>
                    <span className="flex flex-1 flex-col gap-1 p-4">
                      <span className="line-clamp-2 text-sm font-semibold leading-snug text-bh-navy transition-colors group-hover:text-bh-action">{p.title}</span>
                      <span className="mt-auto pt-1 text-sm font-bold text-bh-navy">
                        {new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(p.price)}
                      </span>
                    </span>
                  </Link>
                )
              })}
            </div>
          )}
        </SectionContainer>
      </Section>

      {/* Relevant funding programs */}
      {relevantPrograms.length > 0 && (
        <Section tone="glass" className="py-14 sm:py-16">
          <SectionContainer>
            <SectionHead
              eyebrow="Finance it"
              eyebrowIcon="Landmark"
              title="Funding programs that fit this system"
              sub="Verified entities with programs sized for this kind of project — apply once, compare real offers."
              action={
                <Button asChild variant="ghost" className="group h-11 gap-1.5">
                  <Link href="/funding#programs">
                    All programs
                    <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" aria-hidden />
                  </Link>
                </Button>
              }
            />
            <RevealGroup className="mt-8 grid gap-5 md:grid-cols-3" stagger={0.09}>
              {relevantPrograms.map((p) => (
                <RevealItem key={p.id} className="h-full">
                  <Link
                    href={`/funding/programs/${p.id}`}
                    className="group flex h-full flex-col gap-3 rounded-2xl border border-bh-border bg-bh-card p-5 shadow-card transition-all duration-300 hover:-translate-y-1 hover:border-bh-gold/40 hover:shadow-hover focus-visible:outline-2 focus-visible:outline-offset-2"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <span className="rounded-full bg-bh-soft-blue px-2.5 py-1 text-[11px] font-bold uppercase tracking-wide text-bh-action">
                        {PROGRAM_CATEGORIES[p.category]?.label ?? p.category}
                      </span>
                      {p.shariaCompliant && (
                        <span className="inline-flex items-center gap-1 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2 py-0.5 text-[11px] font-semibold text-emerald-600 dark:text-emerald-400">
                          <BadgeCheck className="h-3 w-3" aria-hidden /> Sharia
                        </span>
                      )}
                    </div>
                    <h3 className="text-base font-bold leading-snug tracking-tight text-bh-navy transition-colors group-hover:text-bh-action">{p.name}</h3>
                    <p className="text-xs font-medium uppercase tracking-wide text-bh-muted">{p.entity.name}</p>
                    <div className="mt-auto flex flex-wrap gap-2 pt-1 text-xs text-bh-muted">
                      {moneyRangeLabel(p.amountMin, p.amountMax, p.currency) && (
                        <span className="rounded-full border border-bh-border-dark bg-bh-page px-2.5 py-1 font-semibold text-bh-navy">
                          {moneyRangeLabel(p.amountMin, p.amountMax, p.currency)}
                        </span>
                      )}
                      {p.rateMax != null && (
                        <span className="rounded-full border border-bh-border-dark bg-bh-page px-2.5 py-1">
                          {RATE_LABELS[p.rateType ?? ''] ?? 'Rate'} · up to {p.rateMax}%
                        </span>
                      )}
                    </div>
                  </Link>
                </RevealItem>
              ))}
            </RevealGroup>
          </SectionContainer>
        </Section>
      )}

      {/* Bottom CTA */}
      <CtaBand
        eyebrow="Ready when you are"
        title={`Ready to build your ${solution.title.toLowerCase()}?`}
        sub="Shop the category now, or check what a funding entity would charge before you commit."
        primary={{ label: 'Shop the system', href: solution.categorySlug ? `/market?category=${solution.categorySlug}` : '/market' }}
        secondary={{ label: 'Finance it', href: '/funding' }}
        icon="Package"
      />
    </>
  )
}
