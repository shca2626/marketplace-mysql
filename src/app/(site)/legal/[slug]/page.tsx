import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { ArrowRight, CalendarClock, FileText, Mail, ShieldCheck } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { getLegalDoc, getLegalDocList } from '@/lib/site-content'
import { Reveal, Section, SectionContainer } from '@/components/site/kit'
import { Markdown } from '@/components/site/markdown'
import { Breadcrumbs } from '@/components/site/breadcrumbs'
import { formatDate } from '@/components/site/pages/format'

type Props = { params: Promise<{ slug: string }> }

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params
  const doc = await getLegalDoc(slug)
  if (!doc) return { title: 'Legal — Vendora' }
  return {
    title: `${doc.title} — Vendora`,
    description: doc.summary ?? `${doc.title} for the Vendora platform.`,
  }
}

export default async function LegalDocPage({ params }: Props) {
  const { slug } = await params
  const [doc, docs] = await Promise.all([getLegalDoc(slug), getLegalDocList()])
  if (!doc) notFound()

  return (
    <>
      {/* No /legal index route exists — the “Legal” crumb is a plain label, not a dead link */}
      <Breadcrumbs items={[{ label: 'Legal' }, { label: doc.title }]} />

      <Section tone="light" className="pb-16 pt-4">
        <SectionContainer>
          <div className="grid gap-10 lg:grid-cols-[250px_1fr]">
            {/* Side nav (lg+) */}
            <aside className="hidden lg:block">
              <div className="sticky top-24 space-y-4">
                <nav aria-label="Legal documents">
                  <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-primary/80">Documents</p>
                  <ul className="mt-3 space-y-1.5">
                    {docs.map((d) => {
                      const active = d.slug === doc.slug
                      return (
                        <li key={d.slug}>
                          <Link
                            href={`/legal/${d.slug}`}
                            aria-current={active ? 'page' : undefined}
                            className={
                              'flex min-h-11 items-center gap-2.5 rounded-xl border px-3 py-2.5 text-sm font-medium transition-colors ' +
                              (active
                                ? 'border-primary/40 bg-primary/10 text-primary'
                                : 'border-transparent text-muted-foreground hover:border-border hover:bg-muted/50 hover:text-foreground')
                            }
                          >
                            <FileText className="h-4 w-4 shrink-0" aria-hidden />
                            <span className="truncate">{d.title}</span>
                          </Link>
                        </li>
                      )
                    })}
                  </ul>
                </nav>
                <div className="rounded-2xl border border-primary/25 bg-primary/[0.05] p-4">
                  <p className="flex items-center gap-2 text-sm font-bold">
                    <Mail className="h-4 w-4 text-primary" aria-hidden />
                    Need help?
                  </p>
                  <p className="mt-1.5 text-xs leading-relaxed text-muted-foreground">
                    Questions about this document? Our team answers within one business day.
                  </p>
                  <Button asChild size="sm" className="mt-3 h-10 rounded-full px-4 text-xs">
                    <Link href="/contact">
                      Contact us
                      <ArrowRight className="ml-1 h-3.5 w-3.5" aria-hidden />
                    </Link>
                  </Button>
                </div>
              </div>
            </aside>

            {/* Mobile chips */}
            <div className="lg:hidden">
              <div className="flex gap-2 overflow-x-auto pb-1" role="tablist" aria-label="Legal documents">
                {docs.map((d) => {
                  const active = d.slug === doc.slug
                  return (
                    <Link
                      key={d.slug}
                      href={`/legal/${d.slug}`}
                      aria-current={active ? 'page' : undefined}
                      className={
                        'inline-flex min-h-11 shrink-0 items-center rounded-full border px-4 py-2 text-sm font-semibold transition-colors ' +
                        (active
                          ? 'border-primary bg-primary text-primary-foreground'
                          : 'border-border bg-card text-muted-foreground hover:text-foreground')
                      }
                    >
                      {d.title}
                    </Link>
                  )
                })}
              </div>
            </div>

            {/* Document body */}
            <article className="min-w-0">
              <Reveal>
                <div className="flex flex-wrap items-center gap-3">
                  <Badge variant="outline" className="gap-1.5 border-primary/30 text-primary">
                    <ShieldCheck className="h-3.5 w-3.5" aria-hidden />
                    Version {doc.version}
                  </Badge>
                  <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
                    <CalendarClock className="h-3.5 w-3.5" aria-hidden />
                    Effective {formatDate(doc.effectiveAt)}
                    {doc.updatedAt.getTime() !== doc.effectiveAt.getTime() && <> · Updated {formatDate(doc.updatedAt)}</>}
                  </span>
                </div>
              </Reveal>
              <Reveal delay={1}>
                <h1 className="mt-4 text-balance text-3xl font-bold leading-tight tracking-tight sm:text-4xl">{doc.title}</h1>
              </Reveal>

              {doc.summary && (
                <Reveal delay={2}>
                  <div className="mt-6 rounded-2xl border-l-4 border-primary/60 bg-primary/[0.05] p-5">
                    <p className="text-[15px] leading-relaxed text-foreground/90">{doc.summary}</p>
                  </div>
                </Reveal>
              )}

              <Reveal delay={3}>
                <div className="mt-8">
                  <Markdown body={doc.body} />
                </div>
              </Reveal>
            </article>
          </div>
        </SectionContainer>
      </Section>
    </>
  )
}
