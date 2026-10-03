'use client'

// ─────────────────────────────────────────────────────────────────────────────
// FINANCING VIEW — the applicant surface (?view=financing, FIN-6). Sections
// (sidebar-driven, internal state — no new routes): Overview · Services
// directory · My requests · Accreditation · Documents · Agreements, plus the
// 3-step application wizard launched from a service's Apply CTA. Deep link:
// ?view=financing&request=<id> opens a specific request (notification bell).
// ─────────────────────────────────────────────────────────────────────────────

import { useMemo, useState } from 'react'
import { Wallet } from 'lucide-react'
import { useMarketplace } from '@/store/marketplace'
import { useApi } from '@/hooks/use-api'
import type { ApplicantProfileDTO } from '@/lib/types'
import { DashboardLayout, PageHeader, SignInRequired } from '@/components/dashboards/dashboard-layout'
import { BUYER_NAV, filterNavByModules, userModuleSet } from '@/components/dashboards/nav-config'
import type { NavItem } from '@/components/dashboards/nav-config'
import { OverviewSection } from '@/components/marketplace/financing/overview-section'
import { ServicesSection } from '@/components/marketplace/financing/services-section'
import { RequestsSection } from '@/components/marketplace/financing/requests-section'
import { AccreditationSection } from '@/components/marketplace/financing/accreditation-section'
import { DocumentsSection } from '@/components/marketplace/financing/documents-section'
import { AgreementsSection } from '@/components/marketplace/financing/agreements-section'
import { FinancingWizard } from '@/components/marketplace/financing/wizard-section'

type Section = 'overview' | 'services' | 'requests' | 'accreditation' | 'documents' | 'agreements'

const SECTION_KEYS = new Set<Section>(['overview', 'services', 'requests', 'accreditation', 'documents', 'agreements'])

function FinancingConsole() {
  const navigate = useMarketplace((s) => s.navigate)
  const params = useMarketplace((s) => s.params)
  const [section, setSection] = useState<Section>('overview')
  const [wizardServiceId, setWizardServiceId] = useState<string | null>(null)
  const [openRequestId, setOpenRequestId] = useState<string | null>(null)

  // Deep link: ?view=financing&request=<id> (bell / handoffs) — consumed once via
  // the documented adjust-state-during-render pattern (previous-prop compare).
  // NOTE (STAB-4): prev starts at null UNCONDITIONALLY — this view is gated on
  // `user`, so on a cold load the console mounts AFTER applyLocation() has
  // already applied the URL params. Seeding prev from `params` would swallow
  // the deep link on every direct URL / reload entry.
  const [prevDeepLink, setPrevDeepLink] = useState<string | null>(null)
  if ((params.requestId ?? null) !== prevDeepLink) {
    setPrevDeepLink(params.requestId ?? null)
    if (params.requestId) {
      setOpenRequestId(params.requestId)
      setSection('requests')
      setWizardServiceId(null)
    }
  }

  // Deep link: ?view=financing&section=<section> (Account → Document Vault
  // sidebar handoff, direct URL). prev starts null so a fresh mount consumes
  // the param (cold loads included — the console mounts after applyLocation);
  // in-console sidebar clicks keep using setSection directly.
  const [prevSectionLink, setPrevSectionLink] = useState<string | null>(null)
  if ((params.financingSection ?? null) !== prevSectionLink) {
    setPrevSectionLink(params.financingSection ?? null)
    if (params.financingSection && SECTION_KEYS.has(params.financingSection as Section)) {
      setSection(params.financingSection as Section)
      // A wizard param in the same URL wins over the section (e.g. a bookmark
      // carrying both) — don't kill the wizard from here.
      if (!params.financingWizard) setWizardServiceId(null)
      setOpenRequestId(null)
    }
  }

  // Deep link: ?view=financing&wizard=<serviceId> (FIN-7 / STAB-4) — the
  // application wizard itself becomes deep-linkable: an accidental reload
  // or back/forward round-trip reopens it on the same service instead of
  // silently dumping the applicant back on the overview. prev starts at null
  // unconditionally — see the request deep-link note above (cold-load mount
  // order). Consumed via the same adjust-state-during-render pattern.
  const [prevWizardLink, setPrevWizardLink] = useState<string | null>(null)
  if ((params.financingWizard ?? null) !== prevWizardLink) {
    setPrevWizardLink(params.financingWizard ?? null)
    if (params.financingWizard) {
      setWizardServiceId(params.financingWizard)
      setOpenRequestId(null)
    } else {
      setWizardServiceId(null)
    }
  }

  // Sidebar: financing-group items drive the internal section; everything else
  // navigates to its own view (orders / favorites / business …).
  // IA-001/BUY-210: section clicks also push the URL param so each sidebar
  // label is deep-linkable, bookmarkable and survives back/forward + remounts.
  const onNavigate = (item: NavItem) => {
    if (item.view === 'financing' && SECTION_KEYS.has(item.key as Section)) {
      setSection(item.key as Section)
      setWizardServiceId(null)
      setOpenRequestId(null)
      navigate('financing', { financingSection: item.key })
      return
    }
    navigate(item.view ?? 'account', item.params)
  }

  const { icon: headerIcon, title, description } = useMemo(() => {
    const t = BUYER_NAV.titles[section] ?? BUYER_NAV.titles.financing
    const item = BUYER_NAV.groups.flatMap((g) => g.items).find((i) => i.key === section)
    return { icon: item?.icon ?? Wallet, title: t.title, description: t.description }
  }, [section])

  const user = useMarketplace((s) => s.user)
  const { data: meData } = useApi<{ applicant: ApplicantProfileDTO | null }>(user ? '/api/auth/me' : null)
  const me = user ? { user, applicant: meData?.applicant ?? null } : null
  // Phase 5 — module-gated sidebar (RFQ / business entries drop when off).
  const nav = filterNavByModules(BUYER_NAV, userModuleSet(user?.modules))

  return (
    <DashboardLayout role="buyer" nav={nav} activeKey={section} onNavigate={onNavigate}>
      {wizardServiceId && me ? (
        <>
          <PageHeader
            icon={Wallet}
            title="Financing application"
            description={`Three steps: profile review, activity + checklist, review & submit — then the platform verification gate.`}
          />
          <FinancingWizard
            key={wizardServiceId}
            serviceId={wizardServiceId}
            me={me}
            onExit={() => {
              setWizardServiceId(null)
              // Land back on the services list with the URL synced (the
              // wizard param disappears from the address bar).
              navigate('financing', { financingSection: 'services' })
            }}
            onSubmitted={(requestId) => {
              setWizardServiceId(null)
              setOpenRequestId(requestId)
              setSection('requests')
              navigate('financing', { requestId })
            }}
          />
        </>
      ) : (
        <>
          <PageHeader icon={headerIcon} title={title} description={description} />
          {section === 'overview' && <OverviewSection onGoto={(s) => setSection(s)} />}
          {section === 'services' && (
            <ServicesSection
              onApply={(serviceId) => {
                setWizardServiceId(serviceId)
                navigate('financing', { financingWizard: serviceId })
              }}
            />
          )}
          {section === 'requests' && (
            <RequestsSection initialRequestId={openRequestId ?? undefined} />
          )}
          {section === 'accreditation' && (
            <AccreditationSection me={me ?? { user: { id: '', name: '' }, applicant: null }} onBrowse={() => setSection('services')} />
          )}
          {section === 'documents' && <DocumentsSection />}
          {section === 'agreements' && <AgreementsSection />}
        </>
      )}
    </DashboardLayout>
  )
}

export function FinancingView() {
  const user = useMarketplace((s) => s.user)
  const authChecked = useMarketplace((s) => s.authChecked)

  if (!user && authChecked) {
    return (
      <SignInRequired
        icon={Wallet}
        title="Financing & accreditation"
        description="Sign in to apply for financing, track applications and manage your document vault."
        afterView="financing"
      />
    )
  }

  if (!user) {
    // Session still resolving — the app shell shows its boot state.
    return (
      <div className="min-h-screen bg-muted/40" aria-label="Loading financing">
        <span className="sr-only">Loading…</span>
      </div>
    )
  }

  return <FinancingConsole />
}
