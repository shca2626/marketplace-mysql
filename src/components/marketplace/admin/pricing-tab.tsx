'use client'

import { useState } from 'react'
import { ListTree, Users } from 'lucide-react'
import { cn } from '@/lib/utils'
import { CustomerGroupsSection } from './customer-groups-section'
import { PriceListsSection } from './price-lists-section'

/** Pricing tab — price lists (ladders) + customer groups (segments). */
export function PricingTab() {
  const [section, setSection] = useState<'lists' | 'groups'>('lists')

  return (
    <div className="space-y-5">
      {/* Segmented switch */}
      <div
        className="inline-flex w-full gap-1 rounded-xl bg-muted/60 p-1 sm:w-auto"
        role="tablist"
        aria-label="Pricing sections"
      >
        <button
          type="button"
          role="tab"
          aria-selected={section === 'lists'}
          onClick={() => setSection('lists')}
          className={cn(
            'flex flex-1 items-center justify-center gap-1.5 rounded-lg px-4 py-2 text-sm font-medium transition-colors sm:flex-none',
            section === 'lists'
              ? 'bg-background text-foreground shadow-sm'
              : 'text-muted-foreground hover:text-foreground'
          )}
        >
          <ListTree size={14} /> Price lists
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={section === 'groups'}
          onClick={() => setSection('groups')}
          className={cn(
            'flex flex-1 items-center justify-center gap-1.5 rounded-lg px-4 py-2 text-sm font-medium transition-colors sm:flex-none',
            section === 'groups'
              ? 'bg-background text-foreground shadow-sm'
              : 'text-muted-foreground hover:text-foreground'
          )}
        >
          <Users size={14} /> Customer groups
        </button>
      </div>

      {section === 'lists' ? <PriceListsSection /> : <CustomerGroupsSection />}
    </div>
  )
}
