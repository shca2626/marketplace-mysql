import Link from 'next/link'
import { ArrowRight, ClipboardCheck, FileSignature, Landmark, Search } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { getFundingEntities } from '@/lib/site-content'
import { FundingPreviewCards, type PreviewEntity } from '@/components/site/pages/funding-preview-cards'
import { initialsOf } from '@/components/site/pages/format'

/**
 * S4 — Funding preview (pagedesign.md §5.1): mirrors the /funding page's
 * entity cards + a mini 3-step process. Server component: entity rows come
 * live from the DB (getFundingEntities); motion lives in the client child.
 * Cards deep-link to each entity’s profile page, steps link to the funding
 * playbook anchor.
 */

/** Accent per entity type — fixed UI styling, content stays DB-driven. */
const TYPE_ACCENT: Record<string, string> = {
  BANK: '#d97706',
  MFI: '#059669',
  EWALLET: '#b45309',
}

const STEPS = [
  { icon: ClipboardCheck, title: 'Submit your request', text: 'Tell the entities what you are funding' },
  { icon: Search, title: 'Review & offers', text: 'Verified entities respond with offers' },
  { icon: FileSignature, title: 'Sign & get funded', text: 'Accept an offer and close the agreement' },
]

/** First sentence of the entity about-blurb, trimmed for a card. */
function toNote(about: string): string {
  const sentence = about.split(/(?<=[.!?])\s+/)[0] ?? about
  if (sentence.length <= 130) return sentence
  return `${sentence.slice(0, 127).trimEnd()}…`
}

export async function FundingPreview() {
  const entities: PreviewEntity[] = (await getFundingEntities())
    .slice(0, 3)
    .map((e) => ({
      id: e.id,
      name: e.name,
      typeLabel: e.typeLabel,
      note: toNote(e.about),
      monogram: initialsOf(e.name),
      accent: TYPE_ACCENT[e.orgType] ?? '#d97706',
    }))

  return (
    <section className="mx-auto max-w-7xl px-4 py-12 sm:py-14" aria-labelledby="funding-heading">
      <div className="mb-6 flex items-end justify-between gap-4">
        <div>
          <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-primary/80">Funding</p>
          <h2 id="funding-heading" className="mt-1 text-2xl font-bold tracking-tight sm:text-3xl">
            Meet the funding entities
          </h2>
          <p className="mt-1 text-sm text-muted-foreground sm:text-base">
            Finance the project — not just the hardware — with verified institutions.
          </p>
        </div>
        <Button variant="ghost" className="group hidden shrink-0 rounded-full text-primary sm:flex" asChild>
          <Link href="/funding">
            See how funding works <ArrowRight size={15} className="ml-1 transition-transform duration-200 group-hover:translate-x-0.5" />
          </Link>
        </Button>
      </div>

      {/* Entity cards — deep-link to each entity profile */}
      {entities.length > 0 ? (
        <FundingPreviewCards entities={entities} />
      ) : (
        <p className="rounded-2xl border border-dashed p-8 text-center text-sm text-muted-foreground">
          Funding entities are being verified — see the funding hub for the current directory.
        </p>
      )}

      {/* Mini process + CTA — each step links into the funding playbook */}
      <div className="mt-6 grid gap-4 rounded-2xl border bg-gradient-to-br from-orange-50 via-amber-50/60 to-rose-50 p-6 dark:from-orange-950/30 dark:via-amber-950/15 dark:to-rose-950/20 md:grid-cols-[1fr_auto] md:items-center sm:p-7">
        <ol className="grid gap-5 sm:grid-cols-3">
          {STEPS.map((s, i) => (
            <li key={s.title}>
              <Link
                href="/funding#how-it-works"
                className="group flex min-h-11 items-start gap-3 rounded-xl p-1 transition-colors focus-visible:outline-2 focus-visible:outline-offset-2"
              >
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
                  <s.icon size={17} aria-hidden />
                </span>
                <div>
                  <p className="text-sm font-semibold">
                    <span className="mr-1 text-primary">{i + 1}.</span> {s.title}
                  </p>
                  <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">{s.text}</p>
                </div>
              </Link>
            </li>
          ))}
        </ol>
        <div className="flex flex-col gap-2 sm:flex-row md:flex-col">
          <Button className="rounded-full" asChild>
            <Link href="/market?view=financing">
              <Landmark size={15} className="mr-1.5" /> Apply now
            </Link>
          </Button>
          <Button variant="outline" className="rounded-full" asChild>
            <Link href="/funding">Learn more</Link>
          </Button>
        </div>
      </div>
    </section>
  )
}
