import type { Metadata } from 'next'
import { db } from '@/lib/db'
import { Breadcrumbs } from '@/components/site/breadcrumbs'
import {
  AboutCta,
  AboutHero,
  AboutStats,
  AboutStory,
  AboutValues,
  AboutVisionMission,
} from '@/components/site/about-reveals'

/**
 * /about — about us (pagedesign.md §5.4). Server component with static
 * story/values copy and one live data point: the platform stats band,
 * counted straight from the database with a static fallback.
 */

export const metadata: Metadata = {
  title: 'About us — Vendora',
  description:
    'Vendora is the renewable-energy platform: an engineer-reviewed solar marketplace, a B2B procurement engine, and verified funding entities — all under one roof.',
}

/** Static fallback if the live counts fail (matches the seeded catalog). */
const FALLBACK_STATS = [
  { value: 26, label: 'Products listed' },
  { value: 5, label: 'Active sellers' },
  { value: 103, label: 'Customer reviews' },
  { value: 14, label: 'Orders placed' },
]

async function getStats(): Promise<{ value: number; label: string }[]> {
  try {
    const [products, sellers, reviews, orders] = await Promise.all([
      db.product.count({ where: { status: 'ACTIVE' } }),
      db.user.count({ where: { role: 'SELLER', status: 'ACTIVE' } }),
      db.review.count(),
      db.order.count(),
    ])
    if (products === 0 && sellers === 0 && reviews === 0 && orders === 0) return FALLBACK_STATS
    return [
      { value: products, label: 'Products listed' },
      { value: sellers, label: 'Active sellers' },
      { value: reviews, label: 'Customer reviews' },
      { value: orders, label: 'Orders placed' },
    ]
  } catch {
    return FALLBACK_STATS
  }
}

export default async function AboutPage() {
  const stats = await getStats()
  return (
    <>
      <Breadcrumbs items={[{ label: 'About us' }]} />
      <AboutHero />
      <AboutStory />
      <AboutVisionMission />
      <AboutValues />
      <AboutStats stats={stats} />
      <AboutCta />
    </>
  )
}
