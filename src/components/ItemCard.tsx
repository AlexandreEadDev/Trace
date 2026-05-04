'use client'

import Link from 'next/link'
import { Star } from 'lucide-react'
import { useMode } from '@/context/ModeContext'
import type { ModeAccent } from '@/context/ModeContext'
import { cn } from '@/lib/utils'
import type { ItemWithReviews } from '@/types'

function avgRating(reviews: { rating: number }[]): number | null {
  if (!reviews.length) return null
  return reviews.reduce((sum, r) => sum + r.rating, 0) / reviews.length
}

function CoverPlaceholder({
  title,
  accent,
}: {
  title: string
  accent: ModeAccent
}) {
  return (
    <div
      className={cn(
        'flex h-full w-full items-center justify-center text-5xl font-bold text-white',
        `bg-gradient-to-br from-${accent}-400 to-${accent}-600`
      )}
    >
      {title.charAt(0).toUpperCase()}
    </div>
  )
}

export function ItemCard({ item }: { item: ItemWithReviews }) {
  const { accent } = useMode()
  const avg = avgRating(item.reviews)

  return (
    <Link href={`/item/${item.id}`} className="group block">
      <div className="overflow-hidden rounded-xl border bg-card shadow-sm transition-all duration-300 hover:-translate-y-1 hover:shadow-md">
        {/* Cover */}
        <div className="aspect-[2/3] w-full overflow-hidden">
          {item.cover_url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={item.cover_url}
              alt={item.title}
              className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
            />
          ) : (
            <CoverPlaceholder title={item.title} accent={accent} />
          )}
        </div>

        {/* Info */}
        <div className="space-y-1 p-3">
          <h3 className="line-clamp-2 text-sm font-semibold leading-snug">
            {item.title}
          </h3>
          {item.genre && (
            <p className="text-xs text-muted-foreground">{item.genre}</p>
          )}
          <div className="flex items-center gap-1 pt-0.5">
            <Star
              className={cn('h-3.5 w-3.5 fill-current', `text-${accent}-500`)}
            />
            {avg !== null ? (
              <span className={cn('text-xs font-medium', `text-${accent}-600`)}>
                {avg.toFixed(1)}{' '}
                <span className="text-muted-foreground font-normal">
                  ({item.reviews.length})
                </span>
              </span>
            ) : (
              <span className="text-xs text-muted-foreground">Aucun avis</span>
            )}
          </div>
        </div>
      </div>
    </Link>
  )
}

export function ItemCardSkeleton() {
  return (
    <div className="overflow-hidden rounded-xl border bg-card shadow-sm animate-pulse">
      <div className="aspect-[2/3] w-full bg-muted" />
      <div className="space-y-2 p-3">
        <div className="h-3 w-3/4 rounded bg-muted" />
        <div className="h-3 w-1/2 rounded bg-muted" />
        <div className="h-3 w-1/3 rounded bg-muted" />
      </div>
    </div>
  )
}
