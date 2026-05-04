'use client'

import Image from 'next/image'
import Link from 'next/link'
import { useCallback, useEffect, useRef, useState } from 'react'
import { BookOpen, ChevronLeft, ChevronRight, Loader2, Star } from 'lucide-react'
import { useMode } from '@/context/ModeContext'
import type { DiscoverPopularItem } from '@/lib/discover/types'
import { discoverItemHref } from '@/lib/discover/href'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { DiscoverScoreSparkline } from '@/components/discover/DiscoverScoreSparkline'

export function TrendingHero() {
  const { accent } = useMode()
  const [items, setItems] = useState<DiscoverPopularItem[]>([])
  const [loading, setLoading] = useState(true)
  const [err, setErr] = useState<string | null>(null)
  const scrollerRef = useRef<HTMLDivElement>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setErr(null)
    try {
      const res = await fetch('/api/discover/popular?limit=5', { cache: 'no-store' })
      const json = (await res.json()) as { items?: DiscoverPopularItem[]; error?: string }
      if (!res.ok) throw new Error(json.error ?? 'Erreur réseau')
      setItems(Array.isArray(json.items) ? json.items : [])
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Erreur')
      setItems([])
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    load()
  }, [load])

  const scrollBy = (dir: -1 | 1) => {
    const el = scrollerRef.current
    if (!el) return
    const w = el.clientWidth * 0.85
    el.scrollBy({ left: dir * w, behavior: 'smooth' })
  }

  if (loading) {
    return (
      <div className="flex h-56 items-center justify-center rounded-2xl border bg-card">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    )
  }

  if (err) {
    return (
      <div className="rounded-2xl border border-destructive/40 bg-destructive/5 px-4 py-6 text-center text-sm text-destructive">
        {err}
      </div>
    )
  }

  if (!items.length) {
    return (
      <div className="rounded-2xl border bg-muted/30 px-4 py-10 text-center text-sm text-muted-foreground">
        Aucune tendance pour le moment. Les classements apparaîtront quand la communauté notera ou
        ajoutera des titres à son journal.
      </div>
    )
  }

  return (
    <section className="relative" aria-labelledby="discover-trending-heading">
      <div className="mb-3 flex items-center justify-between gap-2">
        <h2
          id="discover-trending-heading"
          className={cn('text-lg font-semibold tracking-tight sm:text-xl', `text-${accent}-900`)}
        >
          Tendances communautaires
        </h2>
        <div className="hidden gap-1 sm:flex">
          <Button
            type="button"
            size="icon"
            variant="outline"
            className="h-8 w-8"
            aria-label="Voir les précédents"
            onClick={() => scrollBy(-1)}
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <Button
            type="button"
            size="icon"
            variant="outline"
            className="h-8 w-8"
            aria-label="Voir les suivants"
            onClick={() => scrollBy(1)}
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      </div>

      <div
        ref={scrollerRef}
        className="flex snap-x snap-mandatory gap-4 overflow-x-auto pb-2 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      >
        {items.map((it) => {
          const href = discoverItemHref(it)
          const score =
            it.communityAvg != null && it.communityAvg > 0
              ? it.communityAvg.toFixed(1)
              : it.engagementScore != null
                ? Math.round(it.engagementScore).toString()
                : null

          return (
            <article
              key={it.itemId ?? it.catalogId ?? it.title}
              className="relative w-[min(100%,22rem)] shrink-0 snap-start overflow-hidden rounded-2xl border bg-card shadow-sm"
            >
              <Link href={href} className="group block">
                <div className="relative aspect-[16/10] w-full bg-muted">
                  {it.coverUrl ? (
                    <Image
                      src={it.coverUrl}
                      alt={it.title}
                      fill
                      className="object-cover transition group-hover:opacity-95"
                      sizes="(max-width: 768px) 100vw, 22rem"
                      unoptimized
                    />
                  ) : (
                    <div className="flex h-full w-full items-center justify-center text-muted-foreground">
                      <BookOpen className="h-14 w-14 opacity-40" />
                    </div>
                  )}
                  <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/80 via-black/40 to-transparent p-4 pt-12">
                    <p className="line-clamp-2 text-base font-semibold text-white drop-shadow">
                      {it.title}
                    </p>
                    <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-white/90">
                      <span className="rounded bg-white/15 px-2 py-0.5 capitalize">{it.type}</span>
                      {it.kind === 'external' && (
                        <span className="rounded bg-amber-500/90 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide">
                          Découverte
                        </span>
                      )}
                      {score && (
                        <span className="inline-flex items-center gap-0.5 rounded bg-white/15 px-2 py-0.5">
                          <Star className="h-3 w-3 fill-amber-300 text-amber-300" />
                          {score}
                          {it.communityAvg != null && it.communityAvg > 0 ? '/5' : ''}
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              </Link>
              {it.sparkline.length > 0 && (
                <div className="border-t bg-background/95 px-3 py-2">
                  <p className="mb-1 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                    Notes (semaines)
                  </p>
                  <DiscoverScoreSparkline values={it.sparkline} height={36} />
                </div>
              )}
            </article>
          )
        })}
      </div>
    </section>
  )
}
