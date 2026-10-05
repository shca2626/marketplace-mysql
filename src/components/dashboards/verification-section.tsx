'use client'

// ─────────────────────────────────────────────────────────────────────────────
// ACCOUNT · VERIFICATION (Phase 3 KYC).
// The account console's verification tab (?view=account&tab=verification):
// the L0→L3 level stepper (Registered → Phone verified → Identity verified →
// Business verified) from /api/kyc/status, verified evidence badges, the amber
// "what's missing for the next level" box, and the identity CTA that reuses
// the document vault's upload dialog (upload once — verified everywhere).
// Publishing products requires L2 (the publish gate deep-links here).
// ─────────────────────────────────────────────────────────────────────────────

import { useState } from 'react'
import {
  ArrowRight,
  BadgeCheck,
  Check,
  Building2,
  Circle,
  FolderLock,
  Loader2,
  Phone,
  RefreshCw,
  ShieldCheck,
  Smartphone,
  UserCog,
} from 'lucide-react'
import { useApi } from '@/hooks/use-api'
import { toast } from '@/hooks/use-toast'
import { useMarketplace } from '@/store/marketplace'
import type { KycStatusDTO } from '@/lib/types'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { cn } from '@/lib/utils'
import { UploadDocDialog } from '@/components/marketplace/financing/documents-section'

const LEVEL_STEPS = [
  { level: 0, label: 'Registered', hint: 'Account created' },
  { level: 1, label: 'Phone verified', hint: 'OTP via WhatsApp' },
  { level: 2, label: 'Identity verified', hint: 'National ID or passport' },
  { level: 3, label: 'Business verified', hint: 'Company documents' },
] as const

export function VerificationSection() {
  const user = useMarketplace((s) => s.user)
  const navigate = useMarketplace((s) => s.navigate)
  const { data: status, loading, error, refetch } = useApi<KycStatusDTO>('/api/kyc/status')
  const [uploadOpen, setUploadOpen] = useState(false)
  const [refreshing, setRefreshing] = useState(false)

  const kycLevel = status?.kycLevel ?? user?.kycLevel ?? 0
  // What unlocks at the next level (seller publishing at L2, L3 for companies).
  const nextLevel = Math.min(3, kycLevel + 1)
  const unlockCopy =
    kycLevel < 2
      ? 'Verifying your identity (level 2) unlocks publishing products on the marketplace.'
      : kycLevel < 3
        ? 'Business verification (level 3) unlocks company accounts and higher trust for buyers.'
        : 'You are fully verified — nothing left to unlock.'

  const refresh = async () => {
    setRefreshing(true)
    await refetch()
    setRefreshing(false)
  }

  return (
    <div className="space-y-6">
      {/* ── Level stepper ── */}
      <Card>
        <CardHeader className="flex-row items-start justify-between space-y-0 pb-4">
          <div>
            <CardTitle className="flex items-center gap-2 text-base">
              <ShieldCheck size={16} className="text-primary" /> Verification level
            </CardTitle>
            <p className="mt-1 text-sm text-muted-foreground">
              {status ? (
                <>
                  You are <span className="font-semibold text-foreground">{status.levelLabel}</span> —{' '}
                  {unlockCopy}
                </>
              ) : (
                'Your KYC progress across the platform.'
              )}
            </p>
          </div>
          <Button variant="ghost" size="icon" className="h-9 w-9 rounded-xl" onClick={() => void refresh()} aria-label="Refresh verification status" disabled={refreshing}>
            <RefreshCw size={14} className={refreshing ? 'animate-spin' : undefined} />
          </Button>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="space-y-3">
              <Skeleton className="h-20 w-full rounded-2xl" />
              <Skeleton className="h-16 w-full rounded-2xl" />
            </div>
          ) : error ? (
            <div className="flex flex-col items-start gap-3 rounded-2xl border border-dashed px-5 py-6">
              <p className="text-sm font-semibold">Couldn&apos;t load your verification status</p>
              <p className="text-xs text-muted-foreground">{error}</p>
              <Button variant="outline" size="sm" className="rounded-lg" onClick={() => void refetch()}>
                Try again
              </Button>
            </div>
          ) : (
            <ol className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4" aria-label="Verification levels">
              {LEVEL_STEPS.map((step) => {
                const reached = kycLevel >= step.level
                const current = kycLevel === step.level
                return (
                  <li
                    key={step.level}
                    aria-current={current ? 'step' : undefined}
                    className={cn(
                      'relative flex items-start gap-3 rounded-2xl border p-4 transition-colors',
                      current
                        ? 'border-primary/60 bg-primary/[0.06] shadow-sm'
                        : reached
                          ? 'border-emerald-200 bg-emerald-50/60 dark:border-emerald-900 dark:bg-emerald-950/40'
                          : 'border-dashed bg-muted/20'
                    )}
                  >
                    <span
                      className={cn(
                        'mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-bold',
                        reached
                          ? 'bg-emerald-600 text-white'
                          : 'bg-muted text-muted-foreground'
                      )}
                      aria-hidden
                    >
                      {reached ? <Check size={14} /> : step.level}
                    </span>
                    <div className="min-w-0">
                      <p className={cn('text-sm font-semibold', reached ? 'text-foreground' : 'text-muted-foreground')}>
                        L{step.level} · {step.label}
                      </p>
                      <p className="mt-0.5 text-xs text-muted-foreground">{step.hint}</p>
                      {current && (
                        <Badge className="mt-2 rounded-full border-0 bg-primary text-[10.5px] font-semibold text-primary-foreground">
                          You are here
                        </Badge>
                      )}
                    </div>
                  </li>
                )
              })}
            </ol>
          )}

          {/* What's missing for the next level */}
          {status && status.missingForNext.length > 0 && kycLevel < 3 && (
            <div className="mt-4 rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-amber-900 dark:border-amber-900/60 dark:bg-amber-950 dark:text-amber-200">
              <p className="flex items-center gap-1.5 text-sm font-semibold">
                <Circle size={11} className="fill-current" aria-hidden />
                To reach {LEVEL_STEPS[nextLevel].label.toLowerCase()} (L{nextLevel}):
              </p>
              <ul className="mt-1.5 list-inside list-disc space-y-0.5 text-xs">
                {status.missingForNext.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            </div>
          )}
        </CardContent>
      </Card>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* ── Verified evidence badges ── */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base">
              <BadgeCheck size={16} className="text-primary" /> Verified evidence
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {/* Phone — the L1 evidence, straight from the session */}
            <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-muted/50 px-4 py-3">
              <span className="flex items-center gap-2 text-sm">
                <Phone size={14} className="text-muted-foreground" />
                {user?.phone ?? 'No phone on file'}
              </span>
              {user?.phoneVerifiedAt ? (
                <Badge className="rounded-full border-0 bg-emerald-500 text-[11px] font-semibold text-white hover:bg-emerald-500">
                  <BadgeCheck size={11} className="mr-1" /> Verified
                </Badge>
              ) : (
                <Badge variant="outline" className="rounded-full text-[11px] text-amber-700 dark:text-amber-400">
                  Not verified
                </Badge>
              )}
            </div>

            {status && status.verifiedBadges.length > 0 ? (
              <div className="flex flex-wrap gap-1.5">
                {status.verifiedBadges.map((badge) => (
                  <Badge
                    key={badge}
                    className="rounded-full border-0 bg-emerald-100 text-[11px] font-semibold text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300"
                  >
                    <BadgeCheck size={11} className="mr-1" /> {badge}
                  </Badge>
                ))}
              </div>
            ) : (
              !loading && (
                <p className="rounded-xl border border-dashed px-4 py-3 text-xs text-muted-foreground">
                  {user?.phoneVerifiedAt
                    ? 'Verified identity documents will appear here as badges once the platform reviews them.'
                    : 'Badges appear here as your phone, identity and business documents get verified.'}
                </p>
              )
            )}

            {/* ── Identity CTA (the publish gate requirement) ── */}
            {kycLevel < 2 ? (
              <div className="rounded-xl border border-primary/30 bg-primary/[0.05] p-4">
                <p className="text-sm font-semibold">Verify your identity</p>
                <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                  Upload a national ID, passport or residence permit — Vendora reviews it once and
                  your account reaches level 2, unlocking product publishing.
                </p>
                <div className="mt-3 flex flex-wrap gap-2">
                  <Button size="sm" className="rounded-lg" onClick={() => setUploadOpen(true)}>
                    <UserCog size={13} className="mr-1.5" /> Verify identity
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    className="rounded-lg"
                    onClick={() => navigate('financing', { financingSection: 'documents' })}
                  >
                    <FolderLock size={13} className="mr-1.5" /> Open document vault
                  </Button>
                </div>
              </div>
            ) : (
              <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-emerald-200 bg-emerald-50/60 px-4 py-3 dark:border-emerald-900 dark:bg-emerald-950/40">
                <p className="text-xs text-muted-foreground">
                  Identity verified — publishing is unlocked on your account.
                </p>
                <Button
                  size="sm"
                  variant="outline"
                  className="rounded-lg"
                  onClick={() => navigate('financing', { financingSection: 'documents' })}
                >
                  <FolderLock size={13} className="mr-1.5" /> Document vault
                </Button>
              </div>
            )}
          </CardContent>
        </Card>

        {/* ── What each level unlocks ── */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base">
              <Smartphone size={16} className="text-primary" /> Why verify?
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="space-y-3 text-sm">
              <li className="flex items-start gap-3">
                <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-lg bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300">
                  <Check size={13} aria-hidden />
                </span>
                <span className="text-muted-foreground">
                  <span className="font-semibold text-foreground">L1 · Phone verified.</span> OTP-confirmed
                  WhatsApp number — required for account recovery and order notifications.
                </span>
              </li>
              <li className="flex items-start gap-3">
                <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                  <BadgeCheck size={13} aria-hidden />
                </span>
                <span className="text-muted-foreground">
                  <span className="font-semibold text-foreground">L2 · Identity verified.</span> Publish
                  products, respond to RFQs and earn buyer trust — the platform checks your ID once.
                </span>
              </li>
              <li className="flex items-start gap-3">
                <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-lg bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300">
                  <Building2 size={13} aria-hidden />
                </span>
                <span className="text-muted-foreground">
                  <span className="font-semibold text-foreground">L3 · Business verified.</span> Company
                  accounts, teams, contract pricing and financing with higher limits.
                </span>
              </li>
            </ul>
            <p className="mt-4 rounded-xl bg-muted/50 px-4 py-3 text-xs leading-relaxed text-muted-foreground">
              Documents live in your vault, are reviewed by Vendora a single time, and are reused by
              every application — you never upload the same file twice.
            </p>
            {user?.role === 'SELLER' && (
              <Button
                variant="ghost"
                size="sm"
                className="mt-2 rounded-lg text-primary hover:text-primary"
                onClick={() => navigate('seller')}
              >
                Back to seller dashboard <ArrowRight size={13} className="ml-1" />
              </Button>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Reusable vault upload dialog (shared with the financing wizard) */}
      <UploadDocDialog
        open={uploadOpen}
        onOpenChange={setUploadOpen}
        defaultType="NATIONAL_ID"
        onUploaded={() => {
          toast({
            title: 'Document uploaded for review',
            description: 'Vendora verifies it once — your level updates here automatically.',
          })
          void refetch()
        }}
      />
    </div>
  )
}
