import { ThemeProvider } from 'next-themes'
import { SiteHeader } from '@/components/site/site-header'
import { SiteFooter } from '@/components/site/site-footer'
import { StorefrontTheme } from '@/components/marketplace/storefront-theme'
import { BackToTop } from '@/components/marketplace/back-to-top'

/**
 * (site) route group layout — the public platform chrome (pagedesign.md §4):
 * announcement + site header on top, platform footer pinned to the bottom
 * (min-h-screen flex column + mt-auto) and the floating back-to-top button.
 * Applies to: /, /funding, /about, /contact (and future public pages).
 * The market at /market keeps its own full shopping header beneath a slim
 * site strip; consoles stay chrome-free inside their dashboard shells.
 */
export default function SiteLayout({ children }: { children: React.ReactNode }) {
  return (
    <ThemeProvider attribute="class" defaultTheme="light" enableSystem disableTransitionOnChange>
      {/* Live theme bridge — admin-configured accent/radius (reads the shared store) */}
      <StorefrontTheme />
      <div className="flex min-h-screen flex-col bg-background text-foreground">
        <SiteHeader />
        <main className="flex-1">{children}</main>
        <SiteFooter />
      </div>
      <BackToTop />
    </ThemeProvider>
  )
}
