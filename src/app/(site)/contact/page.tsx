import type { Metadata } from 'next'
import { Breadcrumbs } from '@/components/site/breadcrumbs'
import {
  ContactChannels,
  ContactFormSection,
  ContactHero,
  ContactQuickLinks,
} from '@/components/site/contact-reveals'

/**
 * /contact — contact us (pagedesign.md §5.5). Fully static server component;
 * the only interactivity lives in the <ContactForm /> island, which posts to
 * the already-built POST /api/contact endpoint.
 *
 * NOTE: only the four email channels are shown as placeholders until the
 * owner provides real channels — no invented addresses, phones or chat apps.
 */

export const metadata: Metadata = {
  title: 'Contact us — Vendora',
  description:
    'Talk to the Vendora team — sales & orders, funding & financing, seller support and partnerships. Replies within 1 business day.',
}

export default function ContactPage() {
  return (
    <>
      <Breadcrumbs items={[{ label: 'Contact us' }]} />
      <ContactHero />
      <ContactChannels />
      <ContactFormSection />
      <ContactQuickLinks />
    </>
  )
}
