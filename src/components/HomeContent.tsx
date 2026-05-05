'use client'

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { BookOpen, LibraryBig, Gamepad2, Film, Star, ArrowRight, Search, Trophy, TrendingUp, Sparkles } from 'lucide-react'
import { useMode } from '@/context/ModeContext'
import type { NavMode } from '@/context/ModeContext'
import type { ModeAccent } from '@/context/ModeContext'
import { createClient } from '@/lib/supabase/client'
import { cn } from '@/lib/utils'
import { encodeCatalogId } from '@/lib/catalog/types'
import type { CatalogItem } from '@/lib/catalog/types'
import type { ItemWithReviews } from '@/types'
import { mapGenreToLabel } from '@/lib/catalog/genres'

// ─── Config per mode ─────────────────────────────────────────────────────────

const MODE_CONFIG = {
  book: {
    Icon: BookOpen,
    label: 'Bibliothèque',
    tagline: 'Découvre des livres, note tes lectures, garde un journal privé.',
    heroName: 'Trace',
    gradient: 'from-amber-50 via-white to-orange-50',
    badge: 'bg-amber-100 text-amber-700',
    btn: 'bg-amber-600 hover:bg-amber-700',
    iconBg: 'bg-amber-600 rotate-3',
    trendTitle: '📚 Tendances — Livres',
    bestTitle: '🏆 Mieux notés — Livres',
    ctaTitle: 'Cherche ton prochain livre',
    ctaDesc: 'Des milliers de titres accessibles, notables et sauvegardables.',
    ctaBg: 'bg-amber-50 border-amber-100',
    apiEndpoint: '/api/catalog/books',
  },
  manga: {
    Icon: LibraryBig,
    label: 'Mangathèque',
    tagline: 'Explore des mangas, note tes lectures, suis les volumes.',
    heroName: 'Trace',
    gradient: 'from-violet-50 via-white to-purple-50',
    badge: 'bg-violet-100 text-violet-700',
    btn: 'bg-violet-600 hover:bg-violet-700',
    iconBg: 'bg-violet-600 -rotate-3',
    trendTitle: '📖 Tendances — Mangas',
    bestTitle: '🏆 Mieux notés — Mangas',
    ctaTitle: 'Cherche ton prochain manga',
    ctaDesc: 'Titres Jikan, notables et sauvegardables dans ton journal.',
    ctaBg: 'bg-violet-50 border-violet-100',
    apiEndpoint: '/api/catalog/manga',
  },
  game: {
    Icon: Gamepad2,
    label: 'Ludothèque',
    tagline: 'Explore des jeux, partage tes avis, suis ta progression.',
    heroName: 'Trace',
    gradient: 'from-indigo-50 via-white to-violet-50',
    badge: 'bg-indigo-100 text-indigo-700',
    btn: 'bg-indigo-600 hover:bg-indigo-700',
    iconBg: 'bg-indigo-600 -rotate-3',
    trendTitle: '🎮 Tendances — Jeux',
    bestTitle: '🏆 Mieux notés — Jeux',
    ctaTitle: 'Trouve ton prochain jeu',
    ctaDesc: 'Centaines de jeux référencés, gratuits ou non.',
    ctaBg: 'bg-indigo-50 border-indigo-100',
    apiEndpoint: '/api/catalog/games',
  },
  movie: {
    Icon: Film,
    label: 'Cinémathèque',
    tagline: 'Découvre des films, note tes visionnages, garde une trace.',
    heroName: 'Trace',
    gradient: 'from-rose-50 via-white to-pink-50',
    badge: 'bg-rose-100 text-rose-700',
    btn: 'bg-rose-600 hover:bg-rose-700',
    iconBg: 'bg-rose-600 rotate-3',
    trendTitle: '🎬 Tendances — Films',
    bestTitle: '🏆 Mieux notés — Films',
    ctaTitle: 'Trouve ton prochain film',
    ctaDesc: 'Milliers de films référencés avec notes et critiques.',
    ctaBg: 'bg-rose-50 border-rose-100',
    apiEndpoint: '/api/catalog/movies',
  },
} satisfies Record<NavMode, object>

// ─── Bayesian scoring ────────────────────────────────────────────────────────

function bayesianScore(v: number, R: number, m: number, C: number): number {
  return (v / (v + m)) * R + (m / (v + m)) * C
}

function computeBest(items: ItemWithReviews[], limit = 12): ItemWithReviews[] {
  const withReviews = items.filter((i) => i.reviews.length >= 1)
  if (withReviews.length === 0) return []

  const totalRatings = withReviews.reduce(
    (s, i) => s + i.reviews.reduce((a, r) => a + r.rating, 0),
    0
  )
  const totalVotes = withReviews.reduce((s, i) => s + i.reviews.length, 0)
  const C = totalVotes > 0 ? totalRatings / totalVotes : 3
  const m = 3

  return withReviews
    .map((item) => {
      const v = item.reviews.length
      const R = item.reviews.reduce((s, r) => s + r.rating, 0) / v
      return { item, score: bayesianScore(v, R, m, C) }
    })
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map((x) => x.item)
}

// ─── Card components ─────────────────────────────────────────────────────────

function CatalogCard({
  item,
  accent,
  onTrack,
}: {
  item: CatalogItem
  accent: ModeAccent
  onTrack?: (id: string) => void
}) {
  const href = `/item/${encodeCatalogId(item.externalSource, item.externalId)}`
  const [imgError, setImgError] = useState(false)
  const [imgLoaded, setImgLoaded] = useState(false)

  return (
    <Link
      href={href}
      className="group block shrink-0 w-36 sm:w-40 snap-start"
      onClick={() => onTrack?.(encodeCatalogId(item.externalSource, item.externalId))}
    >
      <div className="overflow-hidden rounded-xl border bg-card shadow-sm transition-all duration-300 hover:-translate-y-1 hover:shadow-md">
        <div className="relative aspect-[2/3] w-full overflow-hidden bg-muted">
          {item.coverUrl && !imgError ? (
            <>
              {!imgLoaded && <div className="absolute inset-0 animate-pulse bg-muted" />}
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={item.coverUrl}
                alt={item.title}
                loading="lazy"
                decoding="async"
                onLoad={() => setImgLoaded(true)}
                onError={() => setImgError(true)}
                className={cn('h-full w-full object-cover transition-all duration-300 group-hover:scale-105', imgLoaded ? 'opacity-100' : 'opacity-0')}
              />
            </>
          ) : (
            <div className={cn('flex h-full w-full items-center justify-center text-4xl font-bold text-white', `bg-gradient-to-br from-${accent}-400 to-${accent}-600`)}>
              {item.title.charAt(0).toUpperCase()}
            </div>
          )}
        </div>
        <div className="p-2.5 space-y-0.5">
          <p className="line-clamp-2 text-xs font-semibold leading-snug">{item.title}</p>
          {item.genre && <p className="text-[11px] text-muted-foreground truncate">{item.genre}</p>}
          <div className="flex items-center gap-1.5 flex-wrap">
            {item.releaseYear && <span className="text-[11px] text-muted-foreground">{item.releaseYear}</span>}
            {item.metacritic != null && (
              <span className={cn('text-[10px] font-bold px-1 rounded', item.metacritic >= 75 ? 'bg-green-100 text-green-700' : item.metacritic >= 50 ? 'bg-yellow-100 text-yellow-700' : 'bg-red-100 text-red-700')}>
                MC {item.metacritic}
              </span>
            )}
            {item.tmdbScore != null && (
              <span className="text-[10px] font-bold px-1 rounded bg-blue-100 text-blue-700">
                ★ {item.tmdbScore.toFixed(1)}
              </span>
            )}
          </div>
        </div>
      </div>
    </Link>
  )
}

function BestCard({
  item,
  accent,
  rank,
}: {
  item: ItemWithReviews
  accent: ModeAccent
  rank: number
}) {
  const [imgError, setImgError] = useState(false)
  const v = item.reviews.length
  const R = v > 0 ? item.reviews.reduce((s, r) => s + r.rating, 0) / v : 0

  return (
    <Link href={`/item/${item.id}`} className="group block shrink-0 w-36 sm:w-40 snap-start">
      <div className="overflow-hidden rounded-xl border bg-card shadow-sm transition-all duration-300 hover:-translate-y-1 hover:shadow-md">
        <div className="relative aspect-[2/3] w-full overflow-hidden bg-muted">
          {/* Rank badge */}
          <div className={cn(
            'absolute top-2 left-2 z-10 flex h-6 w-6 items-center justify-center rounded-full text-xs font-bold text-white shadow',
            rank === 1 ? 'bg-yellow-500' : rank === 2 ? 'bg-slate-400' : rank === 3 ? 'bg-amber-700' : `bg-${accent}-600`
          )}>
            {rank}
          </div>
          {item.cover_url && !imgError ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={item.cover_url}
              alt={item.title}
              loading="lazy"
              decoding="async"
              onError={() => setImgError(true)}
              className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
            />
          ) : (
            <div className={cn('flex h-full w-full items-center justify-center text-4xl font-bold text-white', `bg-gradient-to-br from-${accent}-400 to-${accent}-600`)}>
              {item.title.charAt(0).toUpperCase()}
            </div>
          )}
        </div>
        <div className="p-2.5 space-y-1">
          <p className="line-clamp-2 text-xs font-semibold leading-snug">{item.title}</p>
          <div className="flex items-center gap-1">
            <Star className={cn('h-3 w-3 fill-current', `text-${accent}-500`)} />
            <span className={cn('text-xs font-medium', `text-${accent}-600`)}>
              {R.toFixed(1)}
            </span>
            <span className="text-[11px] text-muted-foreground">({v})</span>
          </div>
        </div>
      </div>
    </Link>
  )
}

function CardSkeleton() {
  return (
    <div className="shrink-0 w-36 sm:w-40 overflow-hidden rounded-xl border bg-card shadow-sm animate-pulse">
      <div className="aspect-[2/3] w-full bg-muted" />
      <div className="p-2.5 space-y-2">
        <div className="h-3 w-3/4 rounded bg-muted" />
        <div className="h-3 w-1/2 rounded bg-muted" />
      </div>
    </div>
  )
}

function ScrollRow({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex gap-3 overflow-x-auto pb-3 scrollbar-hide snap-x snap-mandatory">
      {children}
    </div>
  )
}

// ─── Main component ──────────────────────────────────────────────────────────

export function HomeContent() {
  const { mode, accent } = useMode()
  const prevMode = useRef(mode)
  const cfg = MODE_CONFIG[mode]
  const { Icon } = cfg

  const [trending, setTrending] = useState<CatalogItem[]>([])
  const [rawItems, setRawItems] = useState<ItemWithReviews[]>([])
  const [trendingCounts, setTrendingCounts] = useState<Map<string, number>>(new Map())
  const [loadingTrending, setLoadingTrending] = useState(true)
  const [loadingBest, setLoadingBest] = useState(true)
  const [transitioning, setTransitioning] = useState(false)
  const [recommendations, setRecommendations] = useState<CatalogItem[]>([])
  const [topGenreLabels, setTopGenreLabels] = useState<string[]>([])
  const [loadingRecs, setLoadingRecs] = useState(false)

  useEffect(() => {
    if (prevMode.current === mode) return
    prevMode.current = mode
    setTransitioning(true)
    setTimeout(() => setTransitioning(false), 50)
  }, [mode])

  useEffect(() => {
    const controller = new AbortController()
    setLoadingTrending(true)
    setTrending([])

    // Fetch catalog items and trending counts in parallel
    const itemsFetch = (async (): Promise<CatalogItem[]> => {
      try {
        let raw: CatalogItem[] = []
        if (mode === 'book' || mode === 'manga') {
          const r = await fetch(`${cfg.apiEndpoint}?page=1`, { signal: controller.signal })
          const data = await r.json()
          raw = Array.isArray(data) ? data : (data?.items ?? [])
        } else {
          const r = await fetch(cfg.apiEndpoint, { signal: controller.signal })
          const data = await r.json()
          raw = Array.isArray(data) ? data : data?.items ?? []
        }
        const items = [...raw].sort((a, b) => (b.popularityScore ?? 0) - (a.popularityScore ?? 0))
        setTrending(items)
        setLoadingTrending(false)
        return items
      } catch (e) {
        if ((e as { name?: string })?.name !== 'AbortError') setLoadingTrending(false)
        return []
      }
    })()

    // Fetch Trace trending counts to reorder
    fetch(`/api/analytics/trending?type=${mode}&limit=100`, { signal: controller.signal })
      .then((r) => r.json())
      .then((data: { id: string; count: number }[]) => {
        if (Array.isArray(data) && data.length > 0) {
          const counts = new Map(data.map(({ id, count }) => [id, count]))
          setTrendingCounts(counts)
          // Reorder already-loaded trending items: hybrid score (popularity + click boost)
          itemsFetch?.then?.((items) => {
            if (!items) return
            const reordered = [...items].sort((a, b) => {
              const idA = `${a.externalSource}__${a.externalId}`
              const idB = `${b.externalSource}__${b.externalId}`
              const clickA = counts.get(idA) ?? 0
              const clickB = counts.get(idB) ?? 0
              const scoreA = (a.popularityScore ?? 0) + Math.log(clickA + 1) * 8
              const scoreB = (b.popularityScore ?? 0) + Math.log(clickB + 1) * 8
              return scoreB - scoreA
            })
            setTrending(reordered)
          })
        }
      })
      .catch(() => {})

    return () => controller.abort()
  }, [cfg, mode])

  useEffect(() => {
    let cancelled = false
    setLoadingBest(true)
    setRawItems([])
    const supabase = createClient()
    supabase
      .from('items')
      .select('id, title, type, genre, cover_url, release_year, reviews(rating)')
      .eq('type', mode)
      .limit(100)
      .then(({ data }) => {
        if (!cancelled) {
          setRawItems((data as ItemWithReviews[]) ?? [])
          setLoadingBest(false)
        }
      }, () => { if (!cancelled) setLoadingBest(false) })
    return () => { cancelled = true }
  }, [mode])

  // ── Personalised recommendations ("Pourrait vous plaire") ─────────────────
  // Aggregates the user's reviews and library entries for the current mode,
  // computes a weighted profile of preferred genres, then fetches catalog items
  // from those genres. Excludes items already in the user's library.
  useEffect(() => {
    let cancelled = false
    setRecommendations([])
    setTopGenreLabels([])
    setLoadingRecs(true)

    const run = async () => {
      const supabase = createClient()
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { setLoadingRecs(false); return }

      const [{ data: libRows }, { data: reviewRows }] = await Promise.all([
        supabase
          .from('user_libraries')
          .select('status, items(id, type, genre, external_source, external_id)')
          .eq('user_id', user.id),
        supabase
          .from('reviews')
          .select('rating, items(id, type, genre, external_source, external_id)')
          .eq('user_id', user.id),
      ])

      type LibRow = { status: string; items: { id: string; type: string; genre: string | null; external_source: string | null; external_id: string | null } | null }
      type RevRow = { rating: number; items: { id: string; type: string; genre: string | null; external_source: string | null; external_id: string | null } | null }
      const libs = (libRows ?? []) as unknown as LibRow[]
      const revs = (reviewRows ?? []) as unknown as RevRow[]

      // Collect external ids of items already in library, to exclude them later
      const ownedExternal = new Set<string>()
      const genreScore = new Map<string, number>()

      for (const row of libs) {
        const it = row.items
        if (!it || it.type !== mode) continue
        if (it.external_source && it.external_id) {
          ownedExternal.add(`${it.external_source}__${it.external_id}`)
        }
        if (it.genre) {
          const w = row.status === 'completed' ? 1 : 0.3
          genreScore.set(it.genre, (genreScore.get(it.genre) ?? 0) + w)
        }
      }

      for (const row of revs) {
        const it = row.items
        if (!it || it.type !== mode) continue
        if (it.external_source && it.external_id) {
          ownedExternal.add(`${it.external_source}__${it.external_id}`)
        }
        if (it.genre) {
          // Centred at 3 → range [-2, +2]
          genreScore.set(it.genre, (genreScore.get(it.genre) ?? 0) + (row.rating - 3))
        }
      }

      if (genreScore.size === 0) { if (!cancelled) setLoadingRecs(false); return }

      // Map raw genre strings to canonical catalog labels and aggregate
      const labelScore = new Map<string, number>()
      for (const [raw, s] of genreScore.entries()) {
        if (s <= 0) continue
        const label = mapGenreToLabel(raw, mode)
        if (!label) continue
        labelScore.set(label, (labelScore.get(label) ?? 0) + s)
      }

      const topLabels = [...labelScore.entries()]
        .sort((a, b) => b[1] - a[1])
        .slice(0, 3)
        .map(([l]) => l)

      if (topLabels.length === 0) { if (!cancelled) setLoadingRecs(false); return }
      if (!cancelled) setTopGenreLabels(topLabels)

      // Fetch catalog items for each top genre in parallel
      const fetches = topLabels.map((label) =>
        fetch(`${cfg.apiEndpoint}?genre=${encodeURIComponent(label)}&page=1`)
          .then((r) => r.json())
          .catch(() => null)
      )
      const responses = await Promise.all(fetches)
      if (cancelled) return

      const merged: CatalogItem[] = []
      const seen = new Set<string>()
      for (const r of responses) {
        const items: CatalogItem[] = Array.isArray(r) ? r : (r?.items ?? [])
        for (const it of items) {
          const key = `${it.externalSource}__${it.externalId}`
          if (seen.has(key) || ownedExternal.has(key)) continue
          seen.add(key)
          merged.push(it)
        }
      }

      merged.sort((a, b) => (b.popularityScore ?? 0) - (a.popularityScore ?? 0))
      if (!cancelled) {
        setRecommendations(merged.slice(0, 12))
        setLoadingRecs(false)
      }
    }

    run().catch(() => { if (!cancelled) setLoadingRecs(false) })
    return () => { cancelled = true }
  }, [mode, cfg])

  const bestItems = computeBest(rawItems)

  // Track click analytics
  const trackClick = (itemId: string) => {
    fetch('/api/analytics/click', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ itemId }),
    }).catch(() => {})
  }

  return (
    <div className="min-h-screen">
      {/* Hero */}
      <section className={cn('relative overflow-hidden border-b py-16 sm:py-20 transition-colors duration-500 bg-gradient-to-br', cfg.gradient)}>
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="flex flex-col items-start gap-6 sm:flex-row sm:items-center sm:justify-between">
            <div className="space-y-3 max-w-xl">
              <div className={cn('inline-flex items-center gap-2 rounded-full px-3 py-1 text-xs font-medium', cfg.badge)}>
                <Icon className="h-3.5 w-3.5" />
                {cfg.label}
              </div>
              <h1 className="text-4xl font-extrabold tracking-tight sm:text-5xl">
                Ton{' '}
                <span className={cn('transition-colors duration-300', `text-${accent}-600`)}>
                  {cfg.heroName}
                </span>
              </h1>
              <p className="text-base text-muted-foreground">{cfg.tagline}</p>
              <div className="flex gap-3 pt-1">
                <Link
                  href="/catalog"
                  className={cn('inline-flex items-center gap-2 rounded-lg px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition-all hover:shadow-md active:scale-95', cfg.btn)}
                >
                  <Search className="h-4 w-4" />
                  Explorer le catalogue
                </Link>
              </div>
            </div>
            <div className={cn('hidden sm:flex h-32 w-32 shrink-0 items-center justify-center rounded-3xl shadow-xl transition-all duration-500', cfg.iconBg)}>
              <Icon className="h-16 w-16 text-white" strokeWidth={1.5} />
            </div>
          </div>
        </div>
      </section>

      {/* Content */}
      <div className={cn('mx-auto max-w-7xl px-4 py-10 sm:px-6 lg:px-8 space-y-12 transition-all duration-300', transitioning ? 'opacity-0 translate-y-2' : 'opacity-100 translate-y-0')}>

        {/* Trending */}
        <section>
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-bold tracking-tight flex items-center gap-2">
              {cfg.trendTitle}
              {trendingCounts.size > 0 && (
                <span className="inline-flex items-center gap-1 rounded-full bg-orange-100 px-2 py-0.5 text-xs font-medium text-orange-700">
                  <TrendingUp className="h-3 w-3" />
                  Trace
                </span>
              )}
            </h2>
            <Link href="/catalog" className={cn('flex items-center gap-1 text-sm font-medium', `text-${accent}-600 hover:text-${accent}-700`)}>
              Voir tout <ArrowRight className="h-3.5 w-3.5" />
            </Link>
          </div>
          <ScrollRow>
            {loadingTrending
              ? Array.from({ length: 8 }).map((_, i) => <CardSkeleton key={i} />)
              : trending.length > 0
              ? trending.map((item) => (
                  <CatalogCard
                    key={`${item.externalSource}-${item.externalId}`}
                    item={item}
                    accent={accent}
                    onTrack={trackClick}
                  />
                ))
              : (
                <p className="text-sm text-muted-foreground py-8 px-1">
                  {mode === 'movie'
                    ? 'Ajoutez TMDB_API_KEY dans .env.local pour les films.'
                    : mode === 'game'
                      ? 'Ajoutez RAWG_API_KEY dans .env.local pour tous les jeux.'
                      : mode === 'manga'
                        ? 'Impossible de charger les mangas (Jikan ou réseau). Réessaie plus tard.'
                        : 'Impossible de charger les tendances.'}
                </p>
              )}
          </ScrollRow>
        </section>

        {/* Meilleurs — Bayesian score */}
        <section>
          <div className="flex items-center gap-2 mb-4">
            <Trophy className={cn('h-5 w-5', `text-${accent}-600`)} />
            <h2 className="text-lg font-bold tracking-tight">{cfg.bestTitle}</h2>
            <span className="text-xs text-muted-foreground">Score pondéré par nb d&apos;avis</span>
          </div>
          {loadingBest ? (
            <ScrollRow>
              {Array.from({ length: 6 }).map((_, i) => <CardSkeleton key={i} />)}
            </ScrollRow>
          ) : bestItems.length > 0 ? (
            <ScrollRow>
              {bestItems.map((item, i) => (
                <BestCard key={item.id} item={item} accent={accent} rank={i + 1} />
              ))}
            </ScrollRow>
          ) : (
            <p className="text-sm text-muted-foreground py-6 px-1">
              Aucun titre noté pour le moment.{' '}
              <Link href="/catalog" className={cn('underline font-medium', `text-${accent}-600`)}>
                Explore le catalogue
              </Link>{' '}
              et sois le premier à noter !
            </p>
          )}
        </section>

        {/* Pourrait vous plaire — personalised genre-based recommendations */}
        {(loadingRecs || recommendations.length > 0) && (
          <section>
            <div className="flex items-center gap-2 mb-4 flex-wrap">
              <Sparkles className={cn('h-5 w-5', `text-${accent}-600`)} />
              <h2 className="text-lg font-bold tracking-tight">Pourrait vous plaire</h2>
              {topGenreLabels.length > 0 && (
                <span className="text-xs text-muted-foreground">
                  basé sur tes goûts en {topGenreLabels.join(', ')}
                </span>
              )}
            </div>
            {loadingRecs ? (
              <ScrollRow>
                {Array.from({ length: 6 }).map((_, i) => <CardSkeleton key={i} />)}
              </ScrollRow>
            ) : (
              <ScrollRow>
                {recommendations.map((item) => (
                  <CatalogCard
                    key={`rec-${item.externalSource}-${item.externalId}`}
                    item={item}
                    accent={accent}
                    onTrack={trackClick}
                  />
                ))}
              </ScrollRow>
            )}
          </section>
        )}

        {/* CTA */}
        <section className={cn('rounded-2xl p-8 text-center border transition-colors duration-500', cfg.ctaBg)}>
          <h3 className="text-xl font-bold mb-2">{cfg.ctaTitle}</h3>
          <p className="text-sm text-muted-foreground mb-5">{cfg.ctaDesc}</p>
          <Link
            href="/catalog"
            className={cn('inline-flex items-center gap-2 rounded-lg px-6 py-3 text-sm font-semibold text-white transition-all hover:shadow-md active:scale-95', cfg.btn)}
          >
            <Search className="h-4 w-4" />
            Parcourir le catalogue
          </Link>
        </section>
      </div>
    </div>
  )
}
