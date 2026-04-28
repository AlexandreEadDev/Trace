'use client'

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { BookOpen, Gamepad2, Film, Star, ArrowRight, Search } from 'lucide-react'
import { useMode } from '@/context/ModeContext'
import { createClient } from '@/lib/supabase/client'
import { cn } from '@/lib/utils'
import { encodeCatalogId } from '@/lib/catalog/types'
import type { CatalogItem } from '@/lib/catalog/types'
import type { ItemType, ItemWithReviews } from '@/types'

// ─── Config per mode ─────────────────────────────────────────────────────────

const MODE_CONFIG = {
  book: {
    Icon: BookOpen,
    label: 'Bibliothèque',
    tagline: 'Découvre des livres, note tes lectures, garde un journal privé.',
    heroName: 'LogBook',
    gradient: 'from-amber-50 via-white to-orange-50',
    badge: 'bg-amber-100 text-amber-700',
    btn: 'bg-amber-600 hover:bg-amber-700',
    iconBg: 'bg-amber-600 rotate-3',
    trendTitle: '📚 Tendances — Livres',
    ctaTitle: 'Cherche ton prochain livre',
    ctaDesc: 'Des milliers de titres accessibles, notables et sauvegardables.',
    ctaBg: 'bg-amber-50 border-amber-100',
    topTitle: '⭐ Mieux notés — Livres',
    apiEndpoint: '/api/catalog/books',
  },
  game: {
    Icon: Gamepad2,
    label: 'Ludothèque',
    tagline: 'Explore des jeux, partage tes avis, suis ta progression.',
    heroName: 'GameLog',
    gradient: 'from-indigo-50 via-white to-violet-50',
    badge: 'bg-indigo-100 text-indigo-700',
    btn: 'bg-indigo-600 hover:bg-indigo-700',
    iconBg: 'bg-indigo-600 -rotate-3',
    trendTitle: '🎮 Tendances — Jeux',
    ctaTitle: 'Trouve ton prochain jeu',
    ctaDesc: 'Centaines de jeux référencés, gratuits ou non.',
    ctaBg: 'bg-indigo-50 border-indigo-100',
    topTitle: '⭐ Mieux notés — Jeux',
    apiEndpoint: '/api/catalog/games',
  },
  movie: {
    Icon: Film,
    label: 'Cinémathèque',
    tagline: 'Découvre des films, note tes visionnages, garde une trace.',
    heroName: 'CineLog',
    gradient: 'from-rose-50 via-white to-pink-50',
    badge: 'bg-rose-100 text-rose-700',
    btn: 'bg-rose-600 hover:bg-rose-700',
    iconBg: 'bg-rose-600 rotate-3',
    trendTitle: '🎬 Tendances — Films',
    ctaTitle: 'Trouve ton prochain film',
    ctaDesc: 'Milliers de films référencés avec notes et critiques.',
    ctaBg: 'bg-rose-50 border-rose-100',
    topTitle: '⭐ Mieux notés — Films',
    apiEndpoint: '/api/catalog/movies',
  },
} satisfies Record<ItemType, object>

// ─── Catalog card (external API) ────────────────────────────────────────────

function CatalogCard({
  item,
  accent,
}: {
  item: CatalogItem
  accent: 'amber' | 'indigo' | 'rose'
}) {
  const href = `/item/${encodeCatalogId(item.externalSource, item.externalId)}`
  const [imgError, setImgError] = useState(false)
  const [imgLoaded, setImgLoaded] = useState(false)

  return (
    <Link href={href} className="group block shrink-0 w-36 sm:w-40 snap-start">
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
                className={cn(
                  'h-full w-full object-cover transition-all duration-300 group-hover:scale-105',
                  imgLoaded ? 'opacity-100' : 'opacity-0'
                )}
              />
            </>
          ) : (
            <div
              className={cn(
                'flex h-full w-full items-center justify-center text-4xl font-bold text-white',
                `bg-gradient-to-br from-${accent}-400 to-${accent}-600`
              )}
            >
              {item.title.charAt(0).toUpperCase()}
            </div>
          )}
        </div>
        <div className="p-2.5 space-y-0.5">
          <p className="line-clamp-2 text-xs font-semibold leading-snug">
            {item.title}
          </p>
          {item.genre && (
            <p className="text-[11px] text-muted-foreground truncate">{item.genre}</p>
          )}
          {item.releaseYear && (
            <p className="text-[11px] text-muted-foreground">{item.releaseYear}</p>
          )}
        </div>
      </div>
    </Link>
  )
}

// ─── Top-rated card (Supabase) ────────────────────────────────────────────

function TopRatedCard({
  item,
  accent,
}: {
  item: ItemWithReviews
  accent: 'amber' | 'indigo' | 'rose'
}) {
  const avg =
    item.reviews.length
      ? item.reviews.reduce((s, r) => s + r.rating, 0) / item.reviews.length
      : null
  const [imgError, setImgError] = useState(false)

  return (
    <Link href={`/item/${item.id}`} className="group block shrink-0 w-36 sm:w-40 snap-start">
      <div className="overflow-hidden rounded-xl border bg-card shadow-sm transition-all duration-300 hover:-translate-y-1 hover:shadow-md">
        <div className="relative aspect-[2/3] w-full overflow-hidden bg-muted">
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
            <div
              className={cn(
                'flex h-full w-full items-center justify-center text-4xl font-bold text-white',
                `bg-gradient-to-br from-${accent}-400 to-${accent}-600`
              )}
            >
              {item.title.charAt(0).toUpperCase()}
            </div>
          )}
        </div>
        <div className="p-2.5 space-y-1">
          <p className="line-clamp-2 text-xs font-semibold leading-snug">{item.title}</p>
          {avg !== null && (
            <div className="flex items-center gap-1">
              <Star className={cn('h-3 w-3 fill-current', `text-${accent}-500`)} />
              <span className={cn('text-xs font-medium', `text-${accent}-600`)}>
                {avg.toFixed(1)}
              </span>
              <span className="text-[11px] text-muted-foreground">
                ({item.reviews.length})
              </span>
            </div>
          )}
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

function SectionHeader({
  title,
  href,
  accent,
}: {
  title: string
  href?: string
  accent: 'amber' | 'indigo' | 'rose'
}) {
  return (
    <div className="flex items-center justify-between mb-4">
      <h2 className="text-lg font-bold tracking-tight">{title}</h2>
      {href && (
        <Link
          href={href}
          className={cn(
            'flex items-center gap-1 text-sm font-medium',
            `text-${accent}-600 hover:text-${accent}-700`
          )}
        >
          Voir tout <ArrowRight className="h-3.5 w-3.5" />
        </Link>
      )}
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
  const [topRated, setTopRated] = useState<ItemWithReviews[]>([])
  const [loadingTrending, setLoadingTrending] = useState(true)
  const [loadingTop, setLoadingTop] = useState(true)
  const [transitioning, setTransitioning] = useState(false)

  useEffect(() => {
    if (prevMode.current === mode) return
    prevMode.current = mode
    setTransitioning(true)
    setTimeout(() => setTransitioning(false), 50)
  }, [mode])

  useEffect(() => {
    setLoadingTrending(true)
    fetch(cfg.apiEndpoint)
      .then((r) => r.json())
      .then((data) => {
        setTrending(Array.isArray(data) ? data : data?.items ?? [])
        setLoadingTrending(false)
      })
      .catch(() => setLoadingTrending(false))
  }, [cfg.apiEndpoint])

  useEffect(() => {
    setLoadingTop(true)
    const supabase = createClient()
    supabase
      .from('items')
      .select('id, title, type, genre, cover_url, release_year, reviews(rating)')
      .eq('type', mode)
      .limit(24)
      .then(({ data }) => {
        const withReviews = ((data as ItemWithReviews[]) ?? []).filter(
          (it) => it.reviews.length > 0
        )
        withReviews.sort(
          (a, b) =>
            b.reviews.reduce((s, r) => s + r.rating, 0) / b.reviews.length -
            a.reviews.reduce((s, r) => s + r.rating, 0) / a.reviews.length
        )
        setTopRated(withReviews.slice(0, 12))
        setLoadingTop(false)
      }, () => setLoadingTop(false))
  }, [mode])

  return (
    <div className="min-h-screen">
      {/* Hero */}
      <section
        className={cn(
          'relative overflow-hidden border-b py-16 sm:py-20 transition-colors duration-500 bg-gradient-to-br',
          cfg.gradient
        )}
      >
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
                  className={cn(
                    'inline-flex items-center gap-2 rounded-lg px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition-all hover:shadow-md active:scale-95',
                    cfg.btn
                  )}
                >
                  <Search className="h-4 w-4" />
                  Explorer le catalogue
                </Link>
              </div>
            </div>
            <div
              className={cn(
                'hidden sm:flex h-32 w-32 shrink-0 items-center justify-center rounded-3xl shadow-xl transition-all duration-500',
                cfg.iconBg
              )}
            >
              <Icon className="h-16 w-16 text-white" strokeWidth={1.5} />
            </div>
          </div>
        </div>
      </section>

      {/* Content */}
      <div
        className={cn(
          'mx-auto max-w-7xl px-4 py-10 sm:px-6 lg:px-8 space-y-12 transition-all duration-300',
          transitioning ? 'opacity-0 translate-y-2' : 'opacity-100 translate-y-0'
        )}
      >
        {/* Trending */}
        <section>
          <SectionHeader title={cfg.trendTitle} href="/catalog" accent={accent} />
          <ScrollRow>
            {loadingTrending
              ? Array.from({ length: 8 }).map((_, i) => <CardSkeleton key={i} />)
              : trending.length > 0
              ? trending.map((item) => (
                  <CatalogCard
                    key={`${item.externalSource}-${item.externalId}`}
                    item={item}
                    accent={accent}
                  />
                ))
              : (
                <p className="text-sm text-muted-foreground py-8 px-1">
                  {mode === 'movie'
                    ? 'Ajoutez TMDB_API_KEY dans .env.local pour les films.'
                    : mode === 'game'
                    ? 'Ajoutez RAWG_API_KEY dans .env.local pour tous les jeux.'
                    : 'Impossible de charger les tendances.'}
                </p>
              )}
          </ScrollRow>
        </section>

        {/* Top rated */}
        {(loadingTop || topRated.length > 0) && (
          <section>
            <SectionHeader title={cfg.topTitle} accent={accent} />
            <ScrollRow>
              {loadingTop
                ? Array.from({ length: 6 }).map((_, i) => <CardSkeleton key={i} />)
                : topRated.map((item) => (
                    <TopRatedCard key={item.id} item={item} accent={accent} />
                  ))}
            </ScrollRow>
          </section>
        )}

        {/* CTA */}
        <section
          className={cn(
            'rounded-2xl p-8 text-center border transition-colors duration-500',
            cfg.ctaBg
          )}
        >
          <h3 className="text-xl font-bold mb-2">{cfg.ctaTitle}</h3>
          <p className="text-sm text-muted-foreground mb-5">{cfg.ctaDesc}</p>
          <Link
            href="/catalog"
            className={cn(
              'inline-flex items-center gap-2 rounded-lg px-6 py-3 text-sm font-semibold text-white transition-all hover:shadow-md active:scale-95',
              cfg.btn
            )}
          >
            <Search className="h-4 w-4" />
            Parcourir le catalogue
          </Link>
        </section>
      </div>
    </div>
  )
}
