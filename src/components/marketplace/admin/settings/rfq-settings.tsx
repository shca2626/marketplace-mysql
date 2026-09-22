'use client'

// ─────────────────────────────────────────────────────────────────────────────
// RFQ SETTINGS — the admin configuration cockpit (UI-first, no code).
// Left (≥lg): collapsible accordion of the settings taxonomy groups + panel
// search + active overrides. Below lg the rail collapses into a single
// grouped dropdown picker above the form. Top: the editing scope
// selector (Platform Default / org type / org / category / region — lower
// scope wins) + View History. Right: the registry-rendered panel form with
// Save / Cancel / Reset-to-default. Every change is diffed, logged and can be
// rolled back field-by-field.
// ─────────────────────────────────────────────────────────────────────────────

import { useCallback, useMemo, useState } from 'react'
import {
  BarChart3,
  ChevronDown,
  Coins,
  CreditCard,
  History,
  Layers,
  Loader2,
  Repeat2,
  RotateCcw,
  Search,
  ShieldCheck,
  SlidersHorizontal,
  Trash2,
  Undo2,
  Workflow,
} from 'lucide-react'
import { toast } from '@/hooks/use-toast'
import { useApi } from '@/hooks/use-api'
import {
  RFQ_SETTINGS_SECTIONS,
  RFQ_SETTING_PANELS,
  panelDefaults,
  diffPanelValue,
  formatFieldValue,
  type PanelValue,
  type ScopeType,
} from '@/lib/rfq-settings/registry'
import { apiRequest, toastApiError } from '../shared'
import { SettingsPanelForm } from './panel-form'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Skeleton } from '@/components/ui/skeleton'
import { cn } from '@/lib/utils'

// ── Types ───────────────────────────────────────────────────────────────────

interface AdminPayload {
  values: Record<string, PanelValue>
  overrides: {
    key: string
    panelTitle: string
    sectionTitle: string
    scopeType: ScopeType
    scopeId: string
    scopeLabel: string
    updatedAt: string
  }[]
  orgs: { id: string; name: string; orgType: string; industry: string | null }[]
  categories: { id: string; name: string }[]
  orgTypes: { value: string; label: string }[]
}

interface HistoryChange {
  id: string
  settingKey: string
  panelTitle: string
  scopeType: string
  scopeId: string
  scopeLabel: string
  field: string
  fieldLabel: string
  oldValue: string | null
  newValue: string | null
  rollbackOfId: string | null
  userName: string
  userEmail: string
  createdAt: string
}

const SECTION_ICONS: Record<string, React.ComponentType<{ size?: number; className?: string }>> = {
  master: SlidersHorizontal,
  workflow: Workflow,
  commercial: Coins,
  productivity: Repeat2,
  trust: ShieldCheck,
  payments: CreditCard,
  reports: BarChart3,
}

const SCOPE_LABEL: Record<string, string> = {
  PLATFORM: 'Platform Default',
  ORG_TYPE: 'Organization type',
  ORG: 'Organization',
  CATEGORY: 'Category',
  REGION: 'Region',
}

/** Key of the section that owns a panel ('quoteRouting' → 'master'). */
function sectionKeyOf(panelKey: string): string {
  return RFQ_SETTINGS_SECTIONS.find((s) => s.panels.some((p) => p.key === panelKey))?.key ?? ''
}

// ── Component ───────────────────────────────────────────────────────────────

export function RfqSettings() {
  const [scopeType, setScopeType] = useState<ScopeType>('PLATFORM')
  const [scopeId, setScopeId] = useState('')
  const [regionInput, setRegionInput] = useState('')
  const [activePanel, setActivePanel] = useState('quoteRouting')
  const [saving, setSaving] = useState(false)
  const [historyOpen, setHistoryOpen] = useState(false)
  const [rollbackTarget, setRollbackTarget] = useState<HistoryChange | null>(null)
  const [rollingBack, setRollingBack] = useState(false)
  const [deleteOverrideTarget, setDeleteOverrideTarget] = useState<AdminPayload['overrides'][number] | null>(null)
  const [historyRefreshKey, setHistoryRefreshKey] = useState(0)
  const [panelQuery, setPanelQuery] = useState('') // rail search filter
  // Accordion state for the desktop rail — SINGLE-OPEN: opening one group
  // collapses the rest so the rail never outgrows its scroll container.
  // ('quoteRouting' → 'master' starts expanded.)
  const [openSections, setOpenSections] = useState<Set<string>>(() => new Set([sectionKeyOf('quoteRouting')]))

  const toggleSection = useCallback((key: string) => {
    setOpenSections((prev) => {
      if (prev.has(key)) return new Set() // collapse the open group
      return new Set([key]) // single-open accordion
    })
  }, [])

  // Selecting a panel from the rail keeps its group as the open one; clearing
  // the search snaps back to the active panel's group.
  const selectPanel = useCallback((key: string) => {
    setActivePanel(key)
    setOpenSections(new Set([sectionKeyOf(key)]))
  }, [])

  const onSearchChange = (value: string) => {
    setPanelQuery(value)
    if (!value.trim()) setOpenSections(new Set([sectionKeyOf(activePanel)]))
  }

  const query = useMemo(() => {
    if (scopeType === 'PLATFORM') return ''
    if (scopeType === 'REGION') return `?scopeType=REGION&scopeId=${encodeURIComponent(regionInput.toUpperCase().slice(0, 64))}`
    return `?scopeType=${scopeType}&scopeId=${encodeURIComponent(scopeId)}`
  }, [scopeType, scopeId, regionInput])

  const { data, loading, error, refetch } = useApi<AdminPayload>(`/api/admin/rfq-settings${query}`)

  const panel = RFQ_SETTING_PANELS[activePanel]
  const saved = data?.values?.[activePanel]

  // Draft is DERIVED, never effect-loaded: a fresh clone of the effective value
  // whenever the panel or the saved document changes; edits attach to the
  // current "source" so they survive re-renders until saved data replaces them.
  const draftSource = useMemo(
    () => ({ panel: activePanel, saved, loaded: saved ? structuredClone(saved) : null }),
    [activePanel, saved]
  )
  const [draftEdit, setDraftEdit] = useState<{ source: typeof draftSource; value: PanelValue } | null>(null)
  const draft = draftEdit && draftEdit.source === draftSource ? draftEdit.value : (draftSource.loaded ?? null)

  const dirty = useMemo(() => {
    if (!draft || !saved) return false
    return diffPanelValue(activePanel, saved, draft).length > 0
  }, [draft, saved, activePanel])

  const scopeValid = scopeType !== 'REGION' || regionInput.trim().length > 0

  const setField = useCallback((field: string, next: unknown) => {
    setDraftEdit((d) => ({ source: draftSource, value: { ...(d && d.source === draftSource ? d.value : (draftSource.loaded ?? {})), [field]: next } }))
  }, [draftSource])

  const changeScopeType = (next: string) => {
    setScopeType(next as ScopeType)
    setScopeId('')
    setRegionInput('')
  }

  const save = async () => {
    if (!draft) return
    setSaving(true)
    const changed = diffPanelValue(activePanel, saved ?? panelDefaults(activePanel), draft)
    const res = await apiRequest('/api/admin/rfq-settings', {
      method: 'PUT',
      body: JSON.stringify({
        key: activePanel,
        scopeType,
        scopeId: scopeType === 'REGION' ? regionInput.toUpperCase().slice(0, 64) : scopeId,
        value: draft,
      }),
    })
    setSaving(false)
    if (!res.ok) {
      toastApiError(res.error, 'Settings not saved')
      return
    }
    toast({
      title: 'Settings saved',
      description: `${panel?.title} updated at ${scopeLabel()}. ${changed.length} field${changed.length === 1 ? '' : 's'} changed — logged in history.`,
    })
    refetch()
  }

  const resetToDefault = () => {
    setDraftEdit({ source: draftSource, value: panelDefaults(activePanel) })
    toast({ title: 'Draft reset', description: 'Registry defaults restored — review and save to apply.' })
  }

  const scopeLabel = () => {
    switch (scopeType) {
      case 'PLATFORM': return 'Platform Default'
      case 'ORG_TYPE': return data?.orgTypes.find((t) => t.value === scopeId)?.label ?? scopeId
      case 'ORG': return data?.orgs.find((o) => o.id === scopeId)?.name ?? scopeId
      case 'CATEGORY': return data?.categories.find((c) => c.id === scopeId)?.name ?? scopeId
      case 'REGION': return regionInput ? `Region ${regionInput.toUpperCase()}` : 'Region'
    }
  }

  const effectiveScope = scopeType === 'PLATFORM' || (scopeType === 'REGION' ? regionInput.trim().length > 0 : scopeId.length > 0)

  const activeOverride = data?.overrides.find(
    (o) => o.key === activePanel && o.scopeType === scopeType && o.scopeId === (scopeType === 'REGION' ? regionInput.toUpperCase().slice(0, 64) : scopeId)
  )

  // Rail search — derived at render (never setState-in-effect): a typed query
  // force-expands every group with matches and hides the rest, while
  // openSections quietly keeps the user's manual open/close choices for when
  // the query is cleared.
  const queryText = panelQuery.trim().toLowerCase()
  const isFiltering = queryText.length > 0
  const totalPanels = Object.keys(RFQ_SETTING_PANELS).length
  const matchStats = useMemo(() => {
    if (!isFiltering) return null
    let groups = 0
    let panels = 0
    for (const section of RFQ_SETTINGS_SECTIONS) {
      const hits = section.panels.filter((p) => p.title.toLowerCase().includes(queryText)).length
      if (hits > 0) {
        groups += 1
        panels += hits
      }
    }
    return { groups, panels }
  }, [isFiltering, queryText])

  return (
    <div className="space-y-5">
      {/* ── Settings toolbar: scope + history ── */}
      <Card className="border-border/70 py-0 shadow-sm">
        <CardContent className="px-0 py-0">
          <div className="flex flex-col gap-3 px-4 py-3.5 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex flex-wrap items-center gap-2">
              <span
                className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary"
                title="Editing scope — lower scope wins"
              >
                <Layers size={15} />
              </span>
              <Select value={scopeType} onValueChange={changeScopeType}>
                <SelectTrigger className="h-9 w-[172px] rounded-lg text-[13px] font-medium" aria-label="Editing scope">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="rounded-xl">
                  {(Object.keys(SCOPE_LABEL) as ScopeType[]).map((t) => (
                    <SelectItem key={t} value={t}>
                      {SCOPE_LABEL[t]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {scopeType === 'ORG_TYPE' && (
                <Select value={scopeId} onValueChange={setScopeId}>
                  <SelectTrigger className="h-9 w-[190px] rounded-lg text-[13px]" aria-label="Organization type">
                    <SelectValue placeholder="Choose a type…" />
                  </SelectTrigger>
                  <SelectContent className="max-h-72 rounded-xl">
                    {data?.orgTypes.map((t) => (
                      <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
              {scopeType === 'ORG' && (
                <Select value={scopeId} onValueChange={setScopeId}>
                  <SelectTrigger className="h-9 w-[220px] rounded-lg text-[13px]" aria-label="Organization">
                    <SelectValue placeholder="Choose an organization…" />
                  </SelectTrigger>
                  <SelectContent className="max-h-72 rounded-xl">
                    {data?.orgs.map((o) => (
                      <SelectItem key={o.id} value={o.id}>{o.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
              {scopeType === 'CATEGORY' && (
                <Select value={scopeId} onValueChange={setScopeId}>
                  <SelectTrigger className="h-9 w-[190px] rounded-lg text-[13px]" aria-label="Category">
                    <SelectValue placeholder="Choose a category…" />
                  </SelectTrigger>
                  <SelectContent className="max-h-72 rounded-xl">
                    {data?.categories.map((c) => (
                      <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
              {scopeType === 'REGION' && (
                <Input
                  className="h-9 w-[180px] rounded-lg text-[13px] uppercase"
                  placeholder="e.g. YEMEN, SANA"
                  value={regionInput}
                  onChange={(e) => setRegionInput(e.target.value)}
                  aria-label="Region code"
                />
              )}
              {scopeType !== 'PLATFORM' && (
                <Badge
                  variant={activeOverride ? 'default' : 'outline'}
                  className={cn(
                    'rounded-full text-[10.5px] font-semibold',
                    activeOverride ? 'border-primary/40 bg-primary/10 text-primary hover:bg-primary/10' : ''
                  )}
                >
                  {activeOverride ? 'Override active' : 'No override yet'}
                </Badge>
              )}
            </div>
            <Button
              variant="outline"
              size="sm"
              className="h-9 shrink-0 rounded-lg"
              disabled={!effectiveScope}
              onClick={() => setHistoryOpen(true)}
            >
              <History size={14} className="mr-1.5" /> View history
            </Button>
          </div>
          {/* Info strip — one calm line explaining the scope semantics */}
          <div className="border-t bg-muted/40 px-4 py-2 text-xs leading-relaxed text-muted-foreground">
            {scopeType === 'PLATFORM' ? (
              <>Editing <strong className="text-foreground/80">Platform Default</strong> — every organization, category and region uses these values until an override is added.</>
            ) : (
              <>Editing an <strong className="text-foreground/80">override for {scopeLabel()}</strong> — fields start from the broader scope; save to carve out this one.</>
            )}
            {data && data.overrides.length > 0 && (
              <span className="ml-1.5 rounded-full bg-muted px-1.5 py-px text-[10.5px] font-semibold tabular-nums">
                {data.overrides.length} active override{data.overrides.length === 1 ? '' : 's'} platform-wide
              </span>
            )}
          </div>
        </CardContent>
      </Card>

      {/* ── Workspace ── */}
      <div className="grid items-start gap-5 lg:grid-cols-[280px_minmax(0,1fr)]">
        {/* Desktop rail — single-open accordion inside a sticky, self-contained
            scroll column. The card can never outgrow the viewport and never
            overlaps the content beside it (native overflow-y-auto nav). */}
        <aside className="hidden lg:block" aria-label="Settings navigation">
          <div className="sticky top-20 flex max-h-[calc(100vh-6.5rem)] flex-col overflow-hidden rounded-2xl border bg-card shadow-sm">
            <div className="shrink-0 space-y-2 border-b px-3 py-3">
              <div className="relative">
                <Search
                  size={13}
                  className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground"
                />
                <Input
                  value={panelQuery}
                  onChange={(e) => onSearchChange(e.target.value)}
                  placeholder="Filter panels…"
                  className="h-8 rounded-lg bg-muted/50 pl-7 text-xs shadow-none focus-visible:ring-1"
                  aria-label="Filter settings panels"
                />
              </div>
              <p className="px-0.5 text-[11px] text-muted-foreground">
                {matchStats
                  ? `${matchStats.groups} group${matchStats.groups === 1 ? '' : 's'} · ${matchStats.panels} of ${totalPanels} panels match`
                  : `${RFQ_SETTINGS_SECTIONS.length} groups · ${totalPanels} panels`}
              </p>
            </div>
            {/* Native scroll container — min-h-0 + overflow-y-auto keeps the
                menu fully reachable no matter how many groups are expanded. */}
            <nav aria-label="Settings sections" className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-2">
              {RFQ_SETTINGS_SECTIONS.map((section) => {
                const Icon = SECTION_ICONS[section.key] ?? Layers
                const panels = section.panels.filter((p) => !isFiltering || p.title.toLowerCase().includes(queryText))
                if (panels.length === 0) return null
                const hasOverride = data?.overrides.some((o) => panels.some((p) => p.key === o.key))
                // A typed query force-expands every group with matches; the
                // manual single-open choice applies otherwise.
                const isOpen = isFiltering || openSections.has(section.key)
                return (
                  <div key={section.key}>
                    <button
                      type="button"
                      aria-expanded={isOpen}
                      aria-controls={`rfq-rail-${section.key}`}
                      onClick={() => toggleSection(section.key)}
                      className={cn(
                        'flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left transition-colors hover:bg-muted',
                        !isOpen && 'mb-0.5'
                      )}
                    >
                      <span
                        className={cn(
                          'flex size-6 shrink-0 items-center justify-center rounded-md transition-colors',
                          isOpen ? 'bg-primary/15 text-primary' : 'bg-muted/70 text-muted-foreground'
                        )}
                      >
                        <Icon size={13} />
                      </span>
                      <span
                        className={cn(
                          'min-w-0 flex-1 truncate text-[11px] font-semibold uppercase tracking-wide',
                          isOpen ? 'text-foreground' : 'text-muted-foreground'
                        )}
                      >
                        {section.title}
                      </span>
                      {hasOverride && (
                        <span
                          title="Some panels in this group have overrides"
                          aria-label="Group has overrides"
                          className="size-1.5 shrink-0 rounded-full bg-primary"
                        />
                      )}
                      <span className="shrink-0 rounded-full bg-muted px-1.5 text-[10px] font-semibold leading-4 tabular-nums text-muted-foreground">
                        {panels.length}
                      </span>
                      <ChevronDown
                        size={13}
                        className={cn(
                          'shrink-0 text-muted-foreground/60 transition-transform duration-200',
                          isOpen && 'rotate-180 text-foreground/70'
                        )}
                      />
                    </button>
                    {isOpen && (
                      <div id={`rfq-rail-${section.key}`} className="mb-1 mt-0.5 animate-in fade-in slide-in-from-top-1 duration-200">
                        {panels.map((p) => {
                          const isActive = p.key === activePanel
                          const isOverridden = data?.overrides.some((o) => o.key === p.key)
                          return (
                            <button
                              key={p.key}
                              aria-current={isActive ? 'page' : undefined}
                              onClick={() => selectPanel(p.key)}
                              className={cn(
                                'relative flex w-full items-center gap-2 rounded-lg py-[7px] pl-4 pr-2.5 text-left text-[13px] transition-colors',
                                isActive
                                  ? 'bg-primary/10 font-semibold text-primary'
                                  : 'text-foreground/70 hover:bg-muted hover:text-foreground'
                              )}
                            >
                              {isActive && (
                                <span
                                  aria-hidden
                                  className="absolute left-0 top-1/2 h-4 w-[3px] -translate-y-1/2 rounded-r-full bg-primary"
                                />
                              )}
                              <span className="min-w-0 flex-1 truncate">{p.title}</span>
                              {isOverridden && (
                                <span title="Override exists" className="size-1.5 shrink-0 rounded-full bg-primary/70" />
                              )}
                            </button>
                          )
                        })}
                      </div>
                    )}
                  </div>
                )
              })}
              {isFiltering && matchStats?.panels === 0 && (
                <p className="px-2 py-6 text-center text-xs text-muted-foreground">
                  No panels match “{panelQuery.trim()}”.
                </p>
              )}
            </nav>
          </div>
        </aside>

        {/* Mobile panel picker — one grouped dropdown replaces the stacked rail */}
        <div className="lg:hidden">
          <Select value={activePanel} onValueChange={setActivePanel}>
            <SelectTrigger className="h-10 w-full rounded-xl text-[13px] font-medium" aria-label="Settings panel">
              <SlidersHorizontal size={14} className="shrink-0 text-primary" />
              <SelectValue placeholder="Choose a panel…" />
            </SelectTrigger>
            <SelectContent className="max-h-[24rem] rounded-xl">
              {RFQ_SETTINGS_SECTIONS.map((section) => (
                <SelectGroup key={section.key}>
                  <SelectLabel className="text-[11px] font-semibold uppercase tracking-wide">{section.title}</SelectLabel>
                  {section.panels.map((p) => (
                    <SelectItem key={p.key} value={p.key} className="text-[13px]">
                      {p.title}
                    </SelectItem>
                  ))}
                </SelectGroup>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Panel form */}
        <main className="min-w-0">
          <Card className="border-border/70 shadow-sm">
            <CardContent className="p-5 sm:p-6">
              {loading || !draft ? (
                <div className="space-y-4">
                  <Skeleton className="h-6 w-52" />
                  <Skeleton className="h-4 w-96" />
                  {Array.from({ length: 7 }).map((_, i) => (
                    <div key={i} className="flex items-center justify-between gap-6">
                      <Skeleton className="h-4 w-44" />
                      <Skeleton className="h-9 flex-1" />
                    </div>
                  ))}
                </div>
              ) : error ? (
                <div className="py-12 text-center text-sm text-destructive">{error}</div>
              ) : (
                <>
                  <div className="flex flex-wrap items-start justify-between gap-3 border-b pb-4">
                    <div>
                      <h2 className="text-lg font-bold tracking-tight">{panel?.title}</h2>
                      <p className="mt-0.5 max-w-2xl text-sm text-muted-foreground">{panel?.description}</p>
                    </div>
                    {activeOverride && (
                      <Badge className="rounded-full border-primary/40 bg-primary/10 text-primary hover:bg-primary/10">Override active</Badge>
                    )}
                  </div>

                  <div className="mt-5">
                    <SettingsPanelForm
                      panelKey={activePanel}
                      draft={draft}
                      onChange={setField}
                      disabled={!effectiveScope}
                    />
                  </div>

                  <div className="mt-7 flex flex-wrap items-center gap-2.5 border-t pt-5">
                    <Button className="rounded-lg" disabled={!dirty || saving || !effectiveScope} onClick={save}>
                      {saving && <Loader2 size={14} className="mr-1.5 animate-spin" />} Save changes
                    </Button>
                    <Button variant="ghost" className="rounded-lg" disabled={!dirty || saving} onClick={() => setDraftEdit(null)}>
                      Cancel
                    </Button>
                    <Button variant="outline" className="rounded-lg" disabled={saving} onClick={resetToDefault}>
                      <RotateCcw size={13} className="mr-1.5" /> Reset to default
                    </Button>
                    {dirty && (
                      <span className="text-xs font-medium text-amber-600 dark:text-amber-400">
                        {diffPanelValue(activePanel, saved ?? panelDefaults(activePanel), draft).length} unsaved change{diffPanelValue(activePanel, saved ?? panelDefaults(activePanel), draft).length === 1 ? '' : 's'}
                      </span>
                    )}
                  </div>
                </>
              )}
            </CardContent>
          </Card>

          {/* Overrides management — full width under the form (desktop + mobile
              share this placement; the rail stays a pure navigation surface). */}
          {data && data.overrides.length > 0 && (
            <OverridesCard overrides={data.overrides} onDelete={setDeleteOverrideTarget} className="mt-5" />
          )}
        </main>
      </div>

      {/* ── History dialog ── */}
      <HistoryDialog
        open={historyOpen}
        onOpenChange={setHistoryOpen}
        panelKey={activePanel}
        scopeType={scopeType}
        scopeId={scopeType === 'REGION' ? regionInput.toUpperCase().slice(0, 64) : scopeId}
        scopeDisplayName={scopeLabel()}
        refreshKey={historyRefreshKey}
        onRollback={(c) => setRollbackTarget(c)}
      />

      {/* ── Rollback confirm ── */}
      <AlertDialog open={!!rollbackTarget} onOpenChange={(v) => !v && setRollbackTarget(null)}>
        <AlertDialogContent className="rounded-2xl">
          <AlertDialogHeader>
            <AlertDialogTitle>Roll back this change?</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div>
                <span className="block">
                  “{rollbackTarget?.fieldLabel}” in <strong>{rollbackTarget?.panelTitle}</strong> will return from{' '}
                  <strong>{rollbackTarget ? formatFieldValue(rollbackTarget.settingKey, rollbackTarget.field, rollbackTarget.newValue) : ''}</strong> to{' '}
                  <strong>{rollbackTarget ? formatFieldValue(rollbackTarget.settingKey, rollbackTarget.field, rollbackTarget.oldValue) : ''}</strong>.
                </span>
                <span className="mt-1 block text-muted-foreground">The rollback itself is logged — nothing is silently rewritten.</span>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="rounded-lg">Keep current</AlertDialogCancel>
            <AlertDialogAction
              className="rounded-lg"
              disabled={rollingBack}
              onClick={async (e) => {
                e.preventDefault()
                if (!rollbackTarget) return
                setRollingBack(true)
                const res = await apiRequest('/api/admin/rfq-settings/history/rollback', {
                  method: 'POST',
                  body: JSON.stringify({ changeId: rollbackTarget.id }),
                })
                setRollingBack(false)
                if (!res.ok) {
                  toastApiError(res.error, 'Rollback failed')
                  return
                }
                toast({ title: 'Rolled back', description: `${rollbackTarget.fieldLabel} restored to its previous value.` })
                setRollbackTarget(null)
                refetch()
                setHistoryRefreshKey((k) => k + 1)
              }}
            >
              {rollingBack && <Loader2 size={14} className="mr-1.5 animate-spin" />} Roll back
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* ── Delete override confirm ── */}
      <AlertDialog open={!!deleteOverrideTarget} onOpenChange={(v) => !v && setDeleteOverrideTarget(null)}>
        <AlertDialogContent className="rounded-2xl">
          <AlertDialogHeader>
            <AlertDialogTitle>Remove this override?</AlertDialogTitle>
            <AlertDialogDescription>
              {deleteOverrideTarget?.panelTitle} for {deleteOverrideTarget?.scopeLabel} will fall back to the broader
              scope. The change history is preserved.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="rounded-lg">Keep override</AlertDialogCancel>
            <AlertDialogAction
              className="rounded-lg bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={async (e) => {
                e.preventDefault()
                if (!deleteOverrideTarget) return
                const res = await apiRequest(
                  `/api/admin/rfq-settings?key=${encodeURIComponent(deleteOverrideTarget.key)}&scopeType=${deleteOverrideTarget.scopeType}&scopeId=${encodeURIComponent(deleteOverrideTarget.scopeId)}`,
                  { method: 'DELETE' }
                )
                if (!res.ok) {
                  toastApiError(res.error, 'Could not remove override')
                  return
                }
                toast({ title: 'Override removed', description: `${deleteOverrideTarget.panelTitle} now inherits the broader scope.` })
                setDeleteOverrideTarget(null)
                refetch()
              }}
            >
              Remove override
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}

// ── Active overrides card (desktop rail + below the mobile form) ───────────

function OverridesCard({
  overrides,
  onDelete,
  className,
}: {
  overrides: AdminPayload['overrides']
  onDelete: (o: AdminPayload['overrides'][number]) => void
  className?: string
}) {
  if (overrides.length === 0) return null
  return (
    <div className={cn('overflow-hidden rounded-2xl border bg-card shadow-sm', className)}>
      <div className="flex items-center justify-between gap-2 border-b bg-muted/40 px-4 py-2.5">
        <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Active overrides
        </span>
        <span className="rounded-full bg-muted px-1.5 text-[10.5px] font-semibold tabular-nums text-muted-foreground">
          {overrides.length}
        </span>
      </div>
      {/* Native scroll — capped height, fully reachable on every viewport */}
      <ul className="max-h-64 divide-y overflow-y-auto">
        {overrides.map((o) => (
          <li
            key={`${o.key}:${o.scopeType}:${o.scopeId}`}
            className="flex items-center gap-3 px-4 py-2.5 text-xs transition-colors hover:bg-muted/40"
          >
            <div className="min-w-0 flex-1">
              <p className="truncate font-semibold">{o.panelTitle}</p>
              <p className="mt-0.5 truncate text-[11px] text-muted-foreground">
                {o.scopeLabel} · {SCOPE_LABEL[o.scopeType]} · updated {timeAgoShort(o.updatedAt)}
              </p>
            </div>
            <button
              aria-label={`Delete override for ${o.panelTitle}`}
              className="rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive"
              onClick={() => onDelete(o)}
            >
              <Trash2 size={13} />
            </button>
          </li>
        ))}
      </ul>
    </div>
  )
}

/** Compact “3d ago” style stamp for override rows. */
function timeAgoShort(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime()
  if (ms < 0) return 'just now'
  const mins = Math.floor(ms / 60_000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins}m ago`
  const hours = Math.floor(mins / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.floor(hours / 24)
  if (days < 30) return `${days}d ago`
  return new Date(iso).toLocaleDateString()
}

// ── History dialog ─────────────────────────────────────────────────────────

function HistoryDialog({
  open,
  onOpenChange,
  panelKey,
  scopeType,
  scopeId,
  scopeDisplayName,
  refreshKey,
  onRollback,
}: {
  open: boolean
  onOpenChange: (v: boolean) => void
  panelKey: string
  scopeType: ScopeType
  scopeId: string
  scopeDisplayName: string
  refreshKey: number
  onRollback: (c: HistoryChange) => void
}) {
  const url = open
    ? `/api/admin/rfq-settings/history?${new URLSearchParams({ key: panelKey, scopeType, scopeId, limit: '100', _r: String(refreshKey) })}`
    : null
  const { data, loading, refetch } = useApi<{ changes: HistoryChange[] }>(url)
  const changes = data?.changes ?? []

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] max-w-3xl overflow-hidden rounded-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <History size={16} className="text-primary" /> Change history
          </DialogTitle>
          <DialogDescription>
            {RFQ_SETTING_PANELS[panelKey]?.title} · {scopeDisplayName} — newest first. Roll back any single field.
          </DialogDescription>
        </DialogHeader>
        {/* Native scroll — reliable inside the dialog on every viewport */}
        <div className="max-h-[60vh] overflow-y-auto pr-1">
          {loading ? (
            <div className="space-y-3 py-6">
              {Array.from({ length: 4 }).map((_, i) => (
                <Skeleton key={i} className="h-12 w-full" />
              ))}
            </div>
          ) : changes.length === 0 ? (
            <div className="py-10 text-center text-sm text-muted-foreground">
              No changes logged for this panel at this scope yet.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[560px] text-left text-xs">
                <thead>
                  <tr className="border-b text-muted-foreground">
                    <th className="pb-2 pr-3 font-semibold">When</th>
                    <th className="pb-2 pr-3 font-semibold">Who</th>
                    <th className="pb-2 pr-3 font-semibold">Field</th>
                    <th className="pb-2 pr-3 font-semibold">Old → New</th>
                    <th className="pb-2" />
                  </tr>
                </thead>
                <tbody>
                  {changes.map((c) => (
                    <tr key={c.id} className="border-b last:border-0 align-top">
                      <td className="py-2.5 pr-3 whitespace-nowrap text-muted-foreground">
                        {new Date(c.createdAt).toLocaleString()}
                      </td>
                      <td className="py-2.5 pr-3">
                        <span className="font-medium">{c.userName}</span>
                        {c.rollbackOfId && (
                          <Badge variant="outline" className="ml-1.5 rounded-full border-primary/40 px-1.5 text-[9px] text-primary">
                            <Undo2 size={9} className="mr-0.5" /> rollback
                          </Badge>
                        )}
                      </td>
                      <td className="py-2.5 pr-3 font-medium">{c.fieldLabel}</td>
                      <td className="py-2.5 pr-3">
                        <span className="text-muted-foreground line-through">
                          {formatFieldValue(c.settingKey, c.field, c.oldValue)}
                        </span>
                        <span className="mx-1.5 text-muted-foreground/60">→</span>
                        <span className="font-semibold text-foreground">
                          {formatFieldValue(c.settingKey, c.field, c.newValue)}
                        </span>
                      </td>
                      <td className="py-2.5">
                        {c.rollbackOfId ? null : (
                          <Button variant="ghost" size="sm" className="h-7 rounded-lg px-2 text-[11px]" onClick={() => onRollback(c)}>
                            <Undo2 size={11} className="mr-1" /> Roll back
                          </Button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}
