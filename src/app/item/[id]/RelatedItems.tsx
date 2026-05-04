'use client'

import React, { useCallback, useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { encodeCatalogId } from '@/lib/catalog/types'
import type { CatalogItem } from '@/lib/catalog/types'
import { cn } from '@/lib/utils'

interface RelatedItemsProps {
  items: CatalogItem[]
  title?: string
  accent: 'amber' | 'indigo' | 'rose' | 'pink'
}

function MiniCard({ item, accent }: { item: CatalogItem; accent: RelatedItemsProps['accent'] }) {
  const [loaded, setLoaded] = useState(false)
  const [error, setError] = useState(false)
  const href = `/item/${encodeCatalogId(item.externalSource, item.externalId)}`

  return (
    <Link href={href} className="group shrink-0 w-28 flex flex-col gap-1.5 snap-start">
      <div className="relative w-28 overflow-hidden rounded-lg border bg-muted shadow-sm transition-all duration-300 group-hover:-translate-y-1 group-hover:shadow-md" style={{ aspectRatio: '2/3' }}>
        {item.coverUrl && !error ? (
          <>
            {!loaded && <div className="absolute inset-0 animate-pulse bg-muted" />}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={item.coverUrl}
              alt={item.title}
              loading="lazy"
              onLoad={() => setLoaded(true)}
              onError={() => setError(true)}
              className={cn('h-full w-full object-cover transition-opacity duration-300', loaded ? 'opacity-100' : 'opacity-0')}
            />
          </>
        ) : (
          <div className={cn('flex h-full w-full items-center justify-center text-3xl font-bold text-white', `bg-gradient-to-br from-${accent}-400 to-${accent}-600`)}>
            {item.title.charAt(0).toUpperCase()}
          </div>
        )}
      </div>
      <p className="text-xs font-medium line-clamp-2 leading-tight text-center">{item.title}</p>
      {item.releaseYear && (
        <p className="text-[10px] text-muted-foreground text-center">{item.releaseYear}</p>
      )}
    </Link>
  )
}

export function RelatedItems({ items, title = 'Dans la même série', accent }: RelatedItemsProps) {
  const scrollRef = useRef<HTMLDivElement>(null)
  const [canScrollLeft, setCanScrollLeft] = useState(false)
  const [canScrollRight, setCanScrollRight] = useState(false)

  const updateArrows = useCallback(() => {
    const el = scrollRef.current
    if (!el) return
    setCanScrollLeft(el.scrollLeft > 4)
    setCanScrollRight(el.scrollLeft + el.clientWidth < el.scrollWidth - 4)
  }, [])

  useEffect(() => {
    updateArrows()
    const el = scrollRef.current
    if (!el) return
    const handler = () => updateArrows()
    el.addEventListener('scroll', handler, { passive: true })
    window.addEventListener('resize', handler)
    return () => {
      el.removeEventListener('scroll', handler)
      window.removeEventListener('resize', handler)
    }
  }, [updateArrows, items.length])

  const scrollBy = (dx: number) => {
    scrollRef.current?.scrollBy({ left: dx, behavior: 'smooth' })
  }

  if (items.length === 0) return null

  return (
    <section className="space-y-3">
      <h2 className="text-base font-semibold">{title}</h2>
      <div className="relative group/row">
        <div
          ref={scrollRef}
          className="flex gap-4 overflow-x-auto scrollbar-hide pb-2 snap-x scroll-smooth"
        >
          {items.map((item) => (
            <MiniCard
              key={`${item.externalSource}-${item.externalId}`}
              item={item}
              accent={accent}
            />
          ))}
        </div>

        {canScrollLeft && (
          <button
            type="button"
            aria-label="Précédent"
            onClick={() => scrollBy(-320)}
            className="absolute left-0 top-1/2 -translate-y-1/2 -translate-x-1 flex h-9 w-9 items-center justify-center rounded-full border bg-background/95 shadow-md backdrop-blur transition-opacity hover:bg-background opacity-0 group-hover/row:opacity-100 focus:opacity-100"
          >
            <ChevronLeft className="h-5 w-5" />
          </button>
        )}

        {canScrollRight && (
          <button
            type="button"
            aria-label="Suivant"
            onClick={() => scrollBy(320)}
            className="absolute right-0 top-1/2 -translate-y-1/2 translate-x-1 flex h-9 w-9 items-center justify-center rounded-full border bg-background/95 shadow-md backdrop-blur transition-opacity hover:bg-background opacity-0 group-hover/row:opacity-100 focus:opacity-100"
          >
            <ChevronRight className="h-5 w-5" />
          </button>
        )}
      </div>
    </section>
  )
}
