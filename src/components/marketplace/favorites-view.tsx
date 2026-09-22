'use client'

import { useEffect } from 'react'
import { Heart } from 'lucide-react'
import { useMarketplace } from '@/store/marketplace'
import { useApi } from '@/hooks/use-api'
import type { ProductDTO } from '@/lib/types'
import { ProductCard, ProductCardSkeleton } from './product-card'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'

export function FavoritesView() {
  const user = useMarketplace((s) => s.user)
  const openAuth = useMarketplace((s) => s.openAuth)
  const navigate = useMarketplace((s) => s.navigate)
  const { data, loading, refetch } = useApi<{ products: ProductDTO[] }>(
    user ? '/api/favorites' : null,
    { skip: !user }
  )

  useEffect(() => {
    const handler = () => refetch()
    window.addEventListener('favorites-changed', handler)
    return () => window.removeEventListener('favorites-changed', handler)
  }, [refetch])

  if (!user) {
    return (
      <div className="mx-auto flex max-w-md flex-col items-center px-4 py-24 text-center">
        <div className="relative">
          <div className="absolute inset-0 -z-10 scale-150 rounded-full bg-primary/10 blur-2xl" aria-hidden />
          <div className="flex h-20 w-20 items-center justify-center rounded-full border bg-card shadow-sm">
            <Heart size={32} className="text-primary/70" />
          </div>
        </div>
        <h1 className="mt-5 text-xl font-bold">Sign in to see your favorites</h1>
        <p className="mt-1 text-sm text-muted-foreground">Save products you love for later.</p>
        <Button className="mt-6 rounded-xl" onClick={() => openAuth('login', { view: 'favorites' })}>
          Sign in
        </Button>
      </div>
    )
  }

  const products = data?.products ?? []

  return (
    <div className="mx-auto w-full max-w-6xl">
      <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">Favorites</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        {loading ? 'Loading…' : `${products.length} saved product${products.length === 1 ? '' : 's'}`}
      </p>

      <div className="mt-6">
        {loading ? (
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <ProductCardSkeleton key={i} />
            ))}
          </div>
        ) : products.length === 0 ? (
          <Card className="flex flex-col items-center border-dashed py-16 text-center">
            <div className="relative">
              <div className="absolute inset-0 -z-10 scale-150 rounded-full bg-primary/10 blur-2xl" aria-hidden />
              <div className="flex h-20 w-20 items-center justify-center rounded-full border bg-card shadow-sm">
                <Heart size={32} className="text-primary/70" />
              </div>
            </div>
            <h2 className="mt-5 text-lg font-semibold">No favorites yet</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Tap the heart on any product to save it here.
            </p>
            <Button className="mt-5 rounded-full" onClick={() => navigate('catalog')}>
              Discover products
            </Button>
          </Card>
        ) : (
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
            {products.map((p, i) => (
              <ProductCard key={p.id} product={p} index={i} />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
