import Link from 'next/link'
import { ArrowRight } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Reveal, Section, SectionContainer, Eyebrow } from '@/components/site/kit'

/**
 * Shared dark CTA band (zinc-950 editorial layer with curved top edge) used
 * to close the tier-2 pages. Copy comes in via props — pages own the words.
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
    <Section tone="dark" curve="up" className="pb-16 pt-14 sm:pb-20 sm:pt-20">
      <SectionContainer className="relative">
        <div className="mx-auto flex max-w-2xl flex-col items-center text-center">
          <Reveal>
            <Eyebrow tone="dark" icon={icon}>
              {eyebrow}
            </Eyebrow>
          </Reveal>
          <Reveal delay={1}>
            <h2 className="mt-5 text-balance text-2xl font-bold leading-tight tracking-tight text-zinc-50 sm:text-3xl lg:text-4xl">
              {title}
            </h2>
          </Reveal>
          {sub && (
            <Reveal delay={2}>
              <p className="mt-4 text-pretty text-base leading-relaxed text-zinc-400">{sub}</p>
            </Reveal>
          )}
          <Reveal delay={3}>
            <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
              <Button asChild size="lg" className="h-12 rounded-full px-6 text-base">
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
                  className="h-12 rounded-full border-amber-400/40 bg-amber-400/5 px-6 text-base text-amber-200 hover:bg-amber-400/15 hover:text-amber-100"
                >
                  <Link href={secondary.href}>{secondary.label}</Link>
                </Button>
              )}
            </div>
          </Reveal>
        </div>
      </SectionContainer>
    </Section>
  )
}
