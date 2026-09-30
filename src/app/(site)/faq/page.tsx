import type { Metadata } from 'next'
import Link from 'next/link'
import { ArrowRight, FileText, Mail } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { getFaqs } from '@/lib/site-content'
import { PageHero, Reveal, Section, SectionContainer } from '@/components/site/kit'
import { FaqBrowser } from '@/components/site/pages/faq-browser'

export const metadata: Metadata = {
  title: 'FAQ — Vendora',
  description:
    'Answers about the Vendora platform: buying on the market, selling in stores, sending RFQs, and applying for solar financing with verified entities.',
}

export default async function FaqPage() {
  const faqs = await getFaqs()

  return (
    <>
      <PageHero
        eyebrow="FAQ"
        title="Questions, answered."
        sub="Everything buyers, businesses and sellers ask before their first order — grouped by topic, with the essentials pinned first."
      />

      <Section tone="light" className="py-12 sm:py-14">
        <SectionContainer className="max-w-4xl">
          {faqs.length > 0 ? (
            <FaqBrowser faqs={faqs} />
          ) : (
            <p className="rounded-2xl border border-dashed p-8 text-center text-sm text-muted-foreground">
              Answers are being published — reach out directly and we’ll respond within a day.
            </p>
          )}
        </SectionContainer>
      </Section>

      {/* Split CTA */}
      <Section tone="muted" className="py-12 sm:py-14">
        <SectionContainer className="max-w-4xl">
          <Reveal>
            <div className="grid gap-5 sm:grid-cols-2">
              <div className="flex flex-col items-start gap-4 rounded-3xl border bg-card p-6 sm:p-8">
                <span className="flex h-12 w-12 items-center justify-center rounded-2xl border border-primary/20 bg-primary/10 text-primary">
                  <Mail className="h-6 w-6" aria-hidden />
                </span>
                <div>
                  <h2 className="text-lg font-bold tracking-tight">Still stuck?</h2>
                  <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">
                    Ask us directly — a human replies within one business day.
                  </p>
                </div>
                <Button asChild className="mt-auto h-12 rounded-full px-6">
                  <Link href="/contact">
                    Contact us
                    <ArrowRight className="ml-1.5 h-4 w-4" aria-hidden />
                  </Link>
                </Button>
              </div>
              <div className="flex flex-col items-start gap-4 rounded-3xl border bg-card p-6 sm:p-8">
                <span className="flex h-12 w-12 items-center justify-center rounded-2xl border border-primary/20 bg-primary/10 text-primary">
                  <FileText className="h-6 w-6" aria-hidden />
                </span>
                <div>
                  <h2 className="text-lg font-bold tracking-tight">Prefer the fine print?</h2>
                  <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">
                    The full terms of service and privacy policy, in plain language.
                  </p>
                </div>
                <Button asChild variant="outline" className="mt-auto h-12 rounded-full px-6">
                  <Link href="/legal/terms">
                    Read the legal docs
                    <ArrowRight className="ml-1.5 h-4 w-4" aria-hidden />
                  </Link>
                </Button>
              </div>
            </div>
          </Reveal>
        </SectionContainer>
      </Section>
    </>
  )
}
