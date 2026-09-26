'use client'

// ─────────────────────────────────────────────────────────────────────────────
// FINANCING & FINANCIER VIEWS — placeholder shells (FIN-5 / FIN-6 fill them in).
// Registered in CONSOLE_VIEWS so the view union, routing, bell deep-links and
// nav registry already resolve while the surfaces are being built.
// ─────────────────────────────────────────────────────────────────────────────

import { Construction } from 'lucide-react'

export function FinancierPlaceholder({ title, subtitle }: { title: string; subtitle: string }) {
  return (
    <div className="mx-auto flex max-w-2xl flex-col items-center gap-4 px-6 py-24 text-center">
      <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/10">
        <Construction className="h-7 w-7 text-primary" />
      </div>
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
        <p className="mt-1 text-sm text-muted-foreground">{subtitle}</p>
      </div>
    </div>
  )
}
