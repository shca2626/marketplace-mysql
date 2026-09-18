'use client'

import { Minus, Plus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

interface QuantityInputProps {
  value: number
  onChange: (v: number) => void
  min?: number
  max?: number
  className?: string
  compact?: boolean
}

export function QuantityInput({ value, onChange, min = 1, max = 99, className, compact }: QuantityInputProps) {
  const btnSize = compact ? 'h-7 w-7' : 'h-9 w-9'
  return (
    <div className={cn('inline-flex items-center rounded-lg border', className)}>
      <Button
        type="button"
        variant="ghost"
        size="icon"
        className={cn(btnSize, 'rounded-l-lg rounded-r-none')}
        disabled={value <= min}
        onClick={() => onChange(Math.max(min, value - 1))}
        aria-label="Decrease quantity"
      >
        <Minus size={14} />
      </Button>
      <span className={cn('min-w-8 text-center text-sm font-semibold tabular-nums', compact && 'min-w-7')}>
        {value}
      </span>
      <Button
        type="button"
        variant="ghost"
        size="icon"
        className={cn(btnSize, 'rounded-r-lg rounded-l-none')}
        disabled={value >= max}
        onClick={() => onChange(Math.min(max, value + 1))}
        aria-label="Increase quantity"
      >
        <Plus size={14} />
      </Button>
    </div>
  )
}
