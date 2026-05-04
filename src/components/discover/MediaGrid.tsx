'use client'

import Image from 'next/image'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useCallback, useEffect, useState } from 'react'
import { BookOpen, Loader2, NotebookPen, Star } from 'lucide-react'
import { useMode } from '@/context/ModeContext'
import type { DiscoverPopularItem } from '@/lib/discover/types'
import { discoverItemHref } from '@/lib/discover/href'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { DiscoverScoreSparkline } from '@/components/discover/DiscoverScoreSparkline'

interface MediaGridProps {
  limit?: number
}

export function MediaGrid({ limit = 24 }: MediaGridProps) {
  const router = useRouter()
  const { accent } = useMode()
  const [items, setItems] = useState<DiscoverPopularItem[]>([])
  const [loading, setLoading] = useState(true)
  const [busyId, setBusyId] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch(`/api/discover/popular?limit=${limit}`, { cache: 'no-store' })
      const json = (await res.json()) as { items?: DiscoverPopularItem[] }
      setItems(Array.isArray(json.items) ? json.items : [])
    } finally {
      setLoading(false)
    }
  }, [limit])

  useEffect(() => {
    load()
  }, [load])

  const quickAdd = async (it: DiscoverPopularItem) => {
    const key = it.itemId ?? it.catalogId
    if (!key) return
    setBusyId(key)
    try {
      const res = await fetch('/api/discover/quick-add', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(
          it.itemId
            ? { itemId: it.itemId }
            : { catalogId: it.catalogId }
        ),
      })
      if (res.status === 401) {
        window.location.href = '/login'
        return
      }
      if (res.ok) router.refresh()
    } finally {
      setBusyId(null)
    }
  }

  if (loading) {
    return (
      <div className="flex min-h-[12rem] items-center justify-center rounded-xl border bg-card">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    )
  }

  return (
    <section aria-labelledby="discover-grid-heading">
      <h2
        id="discover-grid-heading"
        className={cn('mb-4 text-lg font-semibold tracking-tight sm:text-xl', `text-${accent}-900`)}
      >
        Explorer
      </h2>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6">
        {items.map((it) => {
          const href = discoverItemHref(it)
          const key = it.itemId ?? it.catalogId ?? it.title
          const scoreLabel =
            it.communityAvg != null && it.communityAvg > 0
              ? `${it.communityAvg.toFixed(1)}/5`
              : it.engagementScore != null
                ? `Pop. ${Math.round(it.engagementScore)}`
                : '—'
          const loadingBtn = busyId === (it.itemId ?? it.catalogId)

          return (
            <article
              key={key}
              className="flex flex-col overflow-hidden rounded-xl border bg-card shadow-sm"
            >
              <Link href={href} className="group relative block aspect-[2/3] bg-muted">
                {it.coverUrl ? (
                  <Image
                    src={it.coverUrl}
                    alt={it.title}
                    fill
                    className="object-cover transition group-hover:opacity-95"
                    sizes="(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 16vw"
                    unoptimized
                  />
                ) : (
                  <div className="flex h-full w-full items-center justify-center text-muted-foreground">
                    <BookOpen className="h-10 w-10 opacity-35" />
                  </div>
                )}
              </Link>
              <div className="flex flex-1 flex-col gap-2 p-2.5">
                <Link href={href} className="line-clamp-2 min-h-[2.5rem] text-sm font-medium leading-snug hover:underline">
                  {it.title}
                </Link>
                <div className="flex items-center justify-between gap-1 text-xs text-muted-foreground">
                  <span className="capitalize">{it.type}</span>
                  <span className="inline-flex shrink-0 items-center gap-0.5 font-medium text-foreground">
                    <Star className="h-3.5 w-3.5 fill-amber-400 text-amber-500" />
                    {scoreLabel}
                  </span>
                </div>
                <DiscoverScoreSparkline values={it.sparkline} height={32} />
                <Button
                  type="button"
                  size="sm"
                  variant="secondary"
                  className="mt-auto w-full gap-1.5 text-xs"
                  disabled={loadingBtn}
                  onClick={() => quickAdd(it)}
                >
                  {loadingBtn ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <NotebookPen className="h-3.5 w-3.5" />
                  )}
                  Journal
                </Button>
              </div>
            </article>
          )
        })}
      </div>
    </section>
  )
}
