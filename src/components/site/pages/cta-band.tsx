import Link from 'next/link'
import { ArrowRight } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Icon, Reveal, SectionContainer } from '@/components/site/kit'

/**
 * Shared navy CTA band that closes the tier-2 pages (mirrors the funding
 * FinalCta layer): navy gradient + gold glows + solar grid, gold primary CTA
 * and a white/25 outline secondary. Copy comes in via props — pages own words.
 */
export function CtaBand({
  eyebrow,
  title,
  sub,
  primary,
  secondary,
  icon = 'Sun',
}: {
  eyebrow: string
  title: string
  sub?: string
  primary: { label: string; href: string }
  secondary?: { label: string; href: string }
  icon?: string
}) {
  return (
    <section className="relative overflow-hidden bg-gradient-to-br from-[#052e56] via-[#06396c] to-[#0a4a8c] py-16 text-white sm:py-20">
      {/* gold glow + solar grid art */}
      <div aria-hidden className="pointer-events-none absolute inset-0">
        <div className="absolute -left-24 top-0 h-72 w-72 rounded-full bg-bh-gold/20 blur-[110px]" />
        <div className="absolute -right-16 bottom-0 h-72 w-72 rounded-full bg-bh-gold/10 blur-[100px]" />
        <div
          className="absolute inset-0 opacity-[0.12]"
          style={{
            backgroundImage:
              'linear-gradient(rgba(211,175,60,0.14) 1px, transparent 1px), linear-gradient(90deg, rgba(211,175,60,0.14) 1px, transparent 1px)',
            backgroundSize: '44px 44px',
            maskImage: 'radial-gradient(ellipse 80% 80% at 50% 50%, black, transparent)',
          }}
        />
      </div>
      <SectionContainer className="relative">
        <div className="mx-auto flex max-w-2xl flex-col items-center text-center">
          <Reveal>
            <span className="inline-flex items-center gap-1.5 rounded-full border border-bh-gold/30 bg-bh-gold/15 px-3 py-1 text-[11px] font-bold uppercase tracking-[0.12em] text-bh-gold">
              <Icon name={icon} className="h-3.5 w-3.5" />
              {eyebrow}
            </span>
          </Reveal>
          <Reveal delay={1}>
            <h2 className="mt-5 text-balance text-2xl font-bold leading-tight tracking-tight text-white sm:text-3xl lg:text-4xl">
              {title}
            </h2>
          </Reveal>
          {sub && (
            <Reveal delay={2}>
              <p className="mt-4 text-pretty text-base leading-relaxed text-white/75">{sub}</p>
            </Reveal>
          )}
          <Reveal delay={3}>
            <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
              <Button
                asChild
                size="lg"
                className="h-12 rounded-full border-0 bg-bh-gold px-6 text-base font-bold text-bh-navy-deep hover:bg-bh-gold-light"
              >
                <Link href={primary.href}>
                  {primary.label}
                  <ArrowRight className="ml-1.5 h-4 w-4" aria-hidden />
                </Link>
              </Button>
              {secondary && (
                <Button
                  asChild
                  size="lg"
                  variant="outline"
                  className="h-12 rounded-full border-white/25 bg-transparent px-6 text-base text-white hover:bg-white/10 hover:text-white"
                >
                  <Link href={secondary.href}>{secondary.label}</Link>
                </Button>
              )}
            </div>
          </Reveal>
        </div>
      </SectionContainer>
    </section>
  )
}
