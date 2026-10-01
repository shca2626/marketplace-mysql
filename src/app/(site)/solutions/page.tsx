import type { Metadata } from 'next'
import Image from 'next/image'
import Link from 'next/link'
import { ArrowRight } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { getFundingPrograms, getSolutions } from '@/lib/site-content'
import {
  GlowCard,
  Icon,
  IconTile,
  PageHero,
  RevealGroup,
  RevealItem,
  Section,
  SectionContainer,
  SectionHead,
} from '@/components/site/kit'

export const metadata: Metadata = {
  title: 'Solutions — Vendora',
  description:
    'Solar solutions for every scale: home systems, farm and irrigation, and business or institutional installs — each with curated products and matching funding programs.',
}

/** Audience chip labels (UI labels — the audience keys come from the DB). */
const AUDIENCE_LABELS: Record<string, string> = {
  HOME: 'For homes',
  FARM: 'For farms',
  BUSINESS: 'For business',
}

export default async function SolutionsPage() {
  const [solutions, programs] = await Promise.all([getSolutions(), getFundingPrograms()])
  const totalFeatures = solutions.reduce((s, x) => s + x.features.length, 0)

  return (
    <>
      <PageHero
        eyebrow="Solutions"
        title="Solutions for every scale"
        sub="From a rooftop that runs a family fridge to an irrigation pump that carries a whole farm — start from the outcome you need and let the platform assemble the rest."
        stats={[
          { label: 'Tailored solutions', value: solutions.length, icon: 'Sprout' },
          { label: 'Capabilities mapped', value: totalFeatures, icon: 'BadgeCheck' },
          { label: 'Funding programs to match', value: programs.length, icon: 'Landmark' },
        ]}
      />

      <Section tone="light" className="py-14 sm:py-16">
        <SectionContainer>
          <SectionHead
            eyebrow="Browse by outcome"
            eyebrowIcon="Search"
            title="Pick the system you are building"
            sub="Every solution page curates the market to what actually fits, and links funding programs that finance it."
          />

          {solutions.length === 0 ? (
            <p className="mt-10 rounded-2xl border border-dashed border-bh-border-dark p-8 text-center text-sm text-bh-muted">
              Solutions are being prepared — in the meantime, browse the market directly.
            </p>
          ) : (
            <RevealGroup className="mt-10 grid gap-6 md:grid-cols-2 lg:grid-cols-3">
              {solutions.map((s) => (
                <RevealItem key={s.id} className="h-full">
                  <GlowCard accent={s.accentColor} className="flex h-full flex-col gap-5 p-0">
                    {/* Cover */}
                    <Link
                      href={`/solutions/${s.slug}`}
                      className="relative block aspect-video overflow-hidden rounded-t-2xl focus-visible:outline-2 focus-visible:outline-offset-[-4px]"
                    >
                      {s.imageUrl ? (
                        <Image
                          src={s.imageUrl}
                          alt=""
                          fill
                          sizes="(max-width: 768px) 100vw, (max-width: 1024px) 50vw, 33vw"
                          className="object-cover transition-transform duration-500 hover:scale-[1.04]"
                        />
                      ) : (
                        <span className="absolute inset-0 bg-bh-soft-blue" />
                      )}
                      <span className="absolute inset-0 bg-gradient-to-t from-[#052e56]/55 to-transparent" aria-hidden />
                      <span
                        className="absolute left-3 top-3 rounded-full px-2.5 py-1 text-[11px] font-bold uppercase tracking-wider text-white backdrop-blur-sm"
                        style={{ backgroundColor: `${s.accentColor ?? '#d3af3c'}cc` }}
                      >
                        {AUDIENCE_LABELS[s.audience] ?? s.audience}
                      </span>
                    </Link>

                    {/* Body */}
                    <div className="flex flex-1 flex-col gap-4 px-6 pb-6">
                      <div className="flex items-start gap-3">
                        <IconTile name={s.icon} accent={s.accentColor} />
                        <div className="min-w-0">
                          <h3 className="text-lg font-bold leading-snug tracking-tight">
                            <Link href={`/solutions/${s.slug}`} className="text-bh-navy transition-colors hover:text-bh-action">
                              {s.title}
                            </Link>
                          </h3>
                          {s.tagline && <p className="mt-1 text-sm leading-relaxed text-bh-muted">{s.tagline}</p>}
                        </div>
                      </div>

                      {/* Feature icons row */}
                      {s.features.length > 0 && (
                        <ul className="flex flex-wrap items-center gap-2" aria-label="Included capabilities">
                          {s.features.slice(0, 4).map((f) => (
                            <li key={f.id} title={f.title}>
                              <IconTile name={f.icon} accent={s.accentColor} size="sm" />
                            </li>
                          ))}
                        </ul>
                      )}

                      <div className="mt-auto pt-1">
                        <Button asChild variant="ghost" className="group h-11 gap-1.5 px-3" style={{ color: s.accentColor ?? undefined }}>
                          <Link href={`/solutions/${s.slug}`}>
                            Explore
                            <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" aria-hidden />
                          </Link>
                        </Button>
                      </div>
                    </div>
                  </GlowCard>
                </RevealItem>
              ))}
            </RevealGroup>
          )}
        </SectionContainer>
      </Section>

      <Section tone="glass" className="py-12">
        <SectionContainer>
          <div className="flex flex-col items-center gap-4 text-center">
            <span className="inline-flex h-12 w-12 items-center justify-center rounded-2xl border border-bh-gold/30 bg-bh-bg-gold text-bh-gold">
              <Icon name="Coins" className="h-6 w-6" />
            </span>
            <h2 className="text-xl font-bold tracking-tight text-bh-navy sm:text-2xl">Not sure which way to go?</h2>
            <p className="max-w-xl text-sm leading-relaxed text-bh-muted sm:text-base">
              Walk the three platform paths first — shop, procure, or fund — then come back and pick the system that matches.
            </p>
            <Button asChild className="mt-1 h-12 rounded-full px-6">
              <Link href="/how-it-works">
                See how it works
                <ArrowRight className="ml-1.5 h-4 w-4" aria-hidden />
              </Link>
            </Button>
          </div>
        </SectionContainer>
      </Section>
    </>
  )
}
