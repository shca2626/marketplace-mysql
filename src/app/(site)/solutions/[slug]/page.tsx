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
  const accent = solution.accentColor ?? '#d97706'

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

      {/* Hero — full-bleed image band with gradient overlay */}
      <section className="relative isolate overflow-hidden bg-zinc-950 text-zinc-100">
        <div className="absolute inset-0" aria-hidden>
          {solution.imageUrl ? (
            <Image src={solution.imageUrl} alt="" fill priority sizes="100vw" className="object-cover opacity-60" />
          ) : (
            <span className="absolute inset-0 bg-zinc-900" />
          )}
          <div className="absolute inset-0 bg-gradient-to-t from-zinc-950 via-zinc-950/80 to-zinc-950/30" />
        </div>
        <SectionContainer className="relative pb-14 pt-12 sm:pb-20 sm:pt-16">
          <nav aria-label="Breadcrumb" className="mb-6 flex items-center gap-1 text-xs text-zinc-400">
            <Link href="/" className="rounded px-1 py-0.5 transition-colors hover:text-amber-300">
              Home
            </Link>
            <ChevronRight className="h-3.5 w-3.5 opacity-60" aria-hidden />
            <Link href="/solutions" className="rounded px-1 py-0.5 transition-colors hover:text-amber-300">
              Solutions
            </Link>
            <ChevronRight className="h-3.5 w-3.5 opacity-60" aria-hidden />
            <span aria-current="page" className="px-1 py-0.5 font-medium text-amber-300">
              {solution.title}
            </span>
          </nav>

          <div className="max-w-3xl">
            <span
              className="inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.14em]"
              style={{ borderColor: `${accent}66`, backgroundColor: `${accent}1f`, color: '#fbbf24' }}
            >
              {AUDIENCE_LABELS[solution.audience] ?? solution.audience}
            </span>
            <h1 className="mt-5 text-balance text-3xl font-bold leading-tight tracking-tight text-zinc-50 sm:text-4xl lg:text-5xl">
              {solution.title}
            </h1>
            {solution.tagline && (
              <p className="mt-4 text-pretty text-lg font-medium text-amber-200/90">{solution.tagline}</p>
            )}
            {solution.description && (
              <p className="mt-4 max-w-2xl text-pretty text-base leading-relaxed text-zinc-400">{solution.description}</p>
            )}
            <div className="mt-7 flex flex-wrap items-center gap-3">
              <Button asChild size="lg" className="h-12 rounded-full px-6 text-base">
                <Link href={solution.categorySlug ? `/market?category=${solution.categorySlug}` : '/market'}>
                  Shop the system
                  <ArrowRight className="ml-1.5 h-4 w-4" aria-hidden />
                </Link>
              </Button>
              <Button
                asChild
                size="lg"
                variant="outline"
                className="h-12 rounded-full border-amber-400/40 bg-amber-400/5 px-6 text-base text-amber-200 hover:bg-amber-400/15 hover:text-amber-100"
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
            <p className="mt-8 rounded-2xl border border-dashed bg-background/60 p-8 text-center text-sm text-muted-foreground">
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
                    className="group flex flex-col overflow-hidden rounded-2xl border bg-card transition-all duration-300 hover:-translate-y-1 hover:border-primary/40 hover:shadow-lg focus-visible:outline-2 focus-visible:outline-offset-2"
                  >
                    <span className="relative block aspect-square overflow-hidden bg-muted">
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
                      <span className="line-clamp-2 text-sm font-semibold leading-snug transition-colors group-hover:text-primary">{p.title}</span>
                      <span className="mt-auto pt-1 text-sm font-bold text-foreground">
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
                    className="group flex h-full flex-col gap-3 rounded-2xl border bg-card p-5 transition-all duration-300 hover:-translate-y-1 hover:border-primary/40 hover:shadow-lg focus-visible:outline-2 focus-visible:outline-offset-2"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <span className="rounded-full bg-primary/10 px-2.5 py-1 text-[11px] font-bold uppercase tracking-wide text-primary">
                        {PROGRAM_CATEGORIES[p.category]?.label ?? p.category}
                      </span>
                      {p.shariaCompliant && (
                        <span className="inline-flex items-center gap-1 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2 py-0.5 text-[11px] font-semibold text-emerald-600 dark:text-emerald-400">
                          <BadgeCheck className="h-3 w-3" aria-hidden /> Sharia
                        </span>
                      )}
                    </div>
                    <h3 className="text-base font-bold leading-snug tracking-tight transition-colors group-hover:text-primary">{p.name}</h3>
                    <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{p.entity.name}</p>
                    <div className="mt-auto flex flex-wrap gap-2 pt-1 text-xs text-muted-foreground">
                      {moneyRangeLabel(p.amountMin, p.amountMax, p.currency) && (
                        <span className="rounded-full border bg-muted px-2.5 py-1 font-semibold text-foreground">
                          {moneyRangeLabel(p.amountMin, p.amountMax, p.currency)}
                        </span>
                      )}
                      {p.rateMax != null && (
                        <span className="rounded-full border bg-muted px-2.5 py-1">
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
      <Section tone="dark" className="py-14">
        <SectionContainer>
          <div className="flex flex-col items-start justify-between gap-6 sm:flex-row sm:items-center">
            <div>
              <h2 className="text-xl font-bold tracking-tight text-zinc-50 sm:text-2xl">
                Ready to build your {solution.title.toLowerCase()}?
              </h2>
              <p className="mt-2 max-w-xl text-sm leading-relaxed text-zinc-400 sm:text-base">
                Shop the category now, or check what a funding entity would charge before you commit.
              </p>
            </div>
            <div className="flex flex-wrap gap-3">
              <Button asChild size="lg" className="h-12 rounded-full px-6">
                <Link href={solution.categorySlug ? `/market?category=${solution.categorySlug}` : '/market'}>
                  Shop the system
                  <ArrowRight className="ml-1.5 h-4 w-4" aria-hidden />
                </Link>
              </Button>
              <Button
                asChild
                size="lg"
                variant="outline"
                className="h-12 rounded-full border-amber-400/40 bg-amber-400/5 px-6 text-amber-200 hover:bg-amber-400/15 hover:text-amber-100"
              >
                <Link href="/funding">Finance it</Link>
              </Button>
            </div>
          </div>
        </SectionContainer>
      </Section>
    </>
  )
}
