'use client'

import { Star } from 'lucide-react'
import { cn } from '@/lib/utils'

interface StarRatingProps {
  value: number
  size?: number
  className?: string
  showValue?: boolean
  count?: number
}

export function StarRating({ value, size = 14, className, showValue = false, count }: StarRatingProps) {
  return (
    <div className={cn('flex items-center gap-1', className)}>
      <div className="flex items-center gap-0.5" aria-label={`Rated ${value} out of 5 stars`}>
        {[1, 2, 3, 4, 5].map((i) => (
          <Star
            key={i}
            size={size}
            className={cn(
              'shrink-0',
              value >= i - 0.25
                ? 'fill-amber-400 text-amber-400'
                : value >= i - 0.75
                  ? 'fill-amber-200 text-amber-400'
                  : 'fill-muted text-muted-foreground/30'
            )}
          />
        ))}
      </div>
      {showValue && (
        <span className="text-xs font-medium text-muted-foreground">
          {value.toFixed(1)}
          {typeof count === 'number' && ` (${count})`}
        </span>
      )}
    </div>
  )
}

export function StarPicker({
  value,
  onChange,
  size = 24,
}: {
  value: number
  onChange: (v: number) => void
  size?: number
}) {
  return (
    <div className="flex items-center gap-1" role="radiogroup" aria-label="Your rating">
      {[1, 2, 3, 4, 5].map((i) => (
        <button
          key={i}
          type="button"
          role="radio"
          aria-checked={value === i}
          aria-label={`${i} star${i > 1 ? 's' : ''}`}
          onClick={() => onChange(i)}
          className="rounded-sm p-0.5 transition-transform hover:scale-110 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <Star
            size={size}
            className={cn(
              'transition-colors',
              value >= i ? 'fill-amber-400 text-amber-400' : 'fill-muted text-muted-foreground/40'
            )}
          />
        </button>
      ))}
    </div>
  )
}
