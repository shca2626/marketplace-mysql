import type { Metadata } from 'next'
import { MarketplaceApp } from '@/components/marketplace/marketplace-app'
import { MarketSiteStrip } from '@/components/site/market-site-strip'

export const metadata: Metadata = {
  title: 'Market — Vendora',
  description:
    'Shop solar panels, LiFePO4 batteries, inverters and submersible pumps from engineer-owned stores — or send an RFQ and buy as a business.',
}

export default function MarketPage() {
  return (
    <>
      {/* Slim platform strip — five primary pages always reachable (pagedesign §4.2) */}
      <MarketSiteStrip />
      {/* The marketplace SPA, unchanged: storefront + consoles via ?view= */}
      <MarketplaceApp />
    </>
  )
}
