'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import { Search, BookOpen, Gamepad2, Film, X, SlidersHorizontal, ChevronDown } from 'lucide-react'
import { useMode } from '@/context/ModeContext'
import { cn } from '@/lib/utils'
import { encodeCatalogId } from '@/lib/catalog/types'
import type { CatalogItem } from '@/lib/catalog/types'
import type { ItemType } from '@/types'

export const dynamic = 'force-dynamic'

// ─── Cover image with lazy loading ─────────────────────────────────────────

function CoverImage({
  src,
  alt,
  accent,
}: {
  src: string | null
  alt: string
  accent: 'amber' | 'indigo' | 'rose'
}) {
  const [loaded, setLoaded] = useState(false)
  const [error, setError] = useState(false)

  if (!src || error) {
    return (
      <div
        className={cn(
          'flex h-full w-full items-center justify-center text-5xl font-bold text-white',
          `bg-gradient-to-br from-${accent}-400 to-${accent}-600`
        )}
      >
        {alt.charAt(0).toUpperCase()}
      </div>
    )
  }

  return (
    <>
      {!loaded && (
        <div className="absolute inset-0 animate-pulse bg-muted" />
      )}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={src}
        alt={alt}
        loading="lazy"
        decoding="async"
        onLoad={() => setLoaded(true)}
        onError={() => setError(true)}
        className={cn(
          'h-full w-full object-cover transition-all duration-300 group-hover:scale-105',
          loaded ? 'opacity-100' : 'opacity-0'
        )}
      />
    </>
  )
}

// ─── Card ───────────────────────────────────────────────────────────────────

function CatalogCard({
  item,
  accent,
}: {
  item: CatalogItem
  accent: 'amber' | 'indigo' | 'rose'
}) {
  const href = `/item/${encodeCatalogId(item.externalSource, item.externalId)}`

  return (
    <Link href={href} className="group block">
      <div className="overflow-hidden rounded-xl border bg-card shadow-sm transition-all duration-300 hover:-translate-y-1 hover:shadow-md">
        <div className="relative aspect-[2/3] w-full overflow-hidden bg-muted">
          <CoverImage src={item.coverUrl} alt={item.title} accent={accent} />
        </div>
        <div className="space-y-1 p-3">
          <h3 className="line-clamp-2 text-sm font-semibold leading-snug">
            {item.title}
          </h3>
          {item.genre && (
            <p className="text-xs text-muted-foreground truncate">{item.genre}</p>
          )}
          <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
            {item.releaseYear && <span>{item.releaseYear}</span>}
            {item.authors && item.authors.length > 0 && (
              <span className="truncate">{item.authors[0]}</span>
            )}
          </div>
        </div>
      </div>
    </Link>
  )
}

function CardSkeleton() {
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

// ─── Filter bar ─────────────────────────────────────────────────────────────

interface Filters {
  genre: string
  yearMin: string
  yearMax: string
  sort: 'default' | 'title_asc' | 'title_desc' | 'year_desc' | 'year_asc'
}

const DEFAULT_FILTERS: Filters = {
  genre: '',
  yearMin: '',
  yearMax: '',
  sort: 'default',
}

const currentYear = new Date().getFullYear()

function FilterBar({
  items,
  filters,
  onChange,
  accent,
}: {
  items: CatalogItem[]
  filters: Filters
  onChange: (f: Filters) => void
  accent: 'amber' | 'indigo' | 'rose'
}) {
  const [open, setOpen] = useState(false)

  const genres = useMemo(() => {
    const set = new Set<string>()
    items.forEach((it) => {
      if (it.genre) set.add(it.genre)
    })
    return Array.from(set).sort()
  }, [items])

  const activeCount =
    (filters.genre ? 1 : 0) +
    (filters.yearMin ? 1 : 0) +
    (filters.yearMax ? 1 : 0) +
    (filters.sort !== 'default' ? 1 : 0)

  return (
    <div className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        className={cn(
          'flex items-center gap-2 rounded-lg border px-3 py-2 text-sm font-medium transition-colors',
          open ? `border-${accent}-300 bg-${accent}-50 text-${accent}-700` : 'hover:bg-muted'
        )}
      >
        <SlidersHorizontal className="h-4 w-4" />
        Filtres
        {activeCount > 0 && (
          <span
            className={cn(
              'flex h-5 w-5 items-center justify-center rounded-full text-[11px] font-bold text-white',
              `bg-${accent}-600`
            )}
          >
            {activeCount}
          </span>
        )}
        <ChevronDown
          className={cn('h-3.5 w-3.5 transition-transform', open && 'rotate-180')}
        />
      </button>

      {open && (
        <div className="absolute right-0 top-full z-50 mt-2 w-72 rounded-xl border bg-background shadow-lg p-4 space-y-4">
          {/* Genre */}
          <div className="space-y-1.5">
            <label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Genre
            </label>
            <select
              value={filters.genre}
              onChange={(e) => onChange({ ...filters, genre: e.target.value })}
              className="w-full rounded-lg border bg-background px-3 py-2 text-sm outline-none"
            >
              <option value="">Tous les genres</option>
              {genres.map((g) => (
                <option key={g} value={g}>
                  {g}
                </option>
              ))}
            </select>
          </div>

          {/* Year range */}
          <div className="space-y-1.5">
            <label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Année
            </label>
            <div className="flex items-center gap-2">
              <input
                type="number"
                placeholder="Depuis"
                min={1900}
                max={currentYear}
                value={filters.yearMin}
                onChange={(e) => onChange({ ...filters, yearMin: e.target.value })}
                className="w-full rounded-lg border bg-background px-3 py-2 text-sm outline-none"
              />
              <span className="text-muted-foreground shrink-0">→</span>
              <input
                type="number"
                placeholder="Jusqu'à"
                min={1900}
                max={currentYear}
                value={filters.yearMax}
                onChange={(e) => onChange({ ...filters, yearMax: e.target.value })}
                className="w-full rounded-lg border bg-background px-3 py-2 text-sm outline-none"
              />
            </div>
          </div>

          {/* Sort */}
          <div className="space-y-1.5">
            <label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Trier par
            </label>
            <select
              value={filters.sort}
              onChange={(e) =>
                onChange({ ...filters, sort: e.target.value as Filters['sort'] })
              }
              className="w-full rounded-lg border bg-background px-3 py-2 text-sm outline-none"
            >
              <option value="default">Pertinence</option>
              <option value="title_asc">Titre A → Z</option>
              <option value="title_desc">Titre Z → A</option>
              <option value="year_desc">Plus récent</option>
              <option value="year_asc">Plus ancien</option>
            </select>
          </div>

          {/* Reset */}
          {activeCount > 0 && (
            <button
              onClick={() => onChange(DEFAULT_FILTERS)}
              className="w-full rounded-lg border py-2 text-sm text-muted-foreground hover:bg-muted transition-colors"
            >
              Réinitialiser les filtres
            </button>
          )}
        </div>
      )}
    </div>
  )
}

// ─── Mode buttons ────────────────────────────────────────────────────────────

const MODE_CONFIG: {
  value: ItemType
  label: string
  Icon: React.ComponentType<{ className?: string }>
  activeClass: string
}[] = [
  { value: 'book', label: 'Livres', Icon: BookOpen, activeClass: 'bg-amber-600 text-white' },
  { value: 'game', label: 'Jeux', Icon: Gamepad2, activeClass: 'bg-indigo-600 text-white' },
  { value: 'movie', label: 'Films', Icon: Film, activeClass: 'bg-rose-600 text-white' },
]

// ─── Main page ───────────────────────────────────────────────────────────────

export default function CatalogPage() {
  const { mode, setMode, accent } = useMode()
  const [query, setQuery] = useState('')
  const [rawItems, setRawItems] = useState<CatalogItem[]>([])
  const [loading, setLoading] = useState(true)
  const [filters, setFilters] = useState<Filters>(DEFAULT_FILTERS)
  const [transitioning, setTransitioning] = useState(false)
  const prevMode = useRef(mode)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const ModeIcon =
    mode === 'book' ? BookOpen : mode === 'game' ? Gamepad2 : Film

  const endpointFor = useCallback(
    (m: ItemType) =>
      m === 'book'
        ? '/api/catalog/books'
        : m === 'game'
        ? '/api/catalog/games'
        : '/api/catalog/movies',
    []
  )

  const fetchItems = useCallback(
    (q: string, m: ItemType = mode) => {
      setLoading(true)
      const base = endpointFor(m)
      const url = q ? `${base}?q=${encodeURIComponent(q)}` : base

      fetch(url)
        .then((r) => r.json())
        .then((data) => {
          setRawItems(Array.isArray(data) ? data : data?.items ?? [])
          setLoading(false)
        })
        .catch(() => {
          setRawItems([])
          setLoading(false)
        })
    },
    [mode, endpointFor]
  )

  // Animate on mode switch
  useEffect(() => {
    if (prevMode.current === mode) return
    prevMode.current = mode
    setTransitioning(true)
    setTimeout(() => setTransitioning(false), 50)
    setQuery('')
    setFilters(DEFAULT_FILTERS)
    fetchItems('', mode)
  }, [mode, fetchItems])

  // Initial fetch
  useEffect(() => {
    fetchItems('')
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Debounced search (600ms, min 2 chars)
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current)
    if (query.length === 1) return
    debounceRef.current = setTimeout(() => fetchItems(query), 600)
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current)
    }
  }, [query, fetchItems])

  // Apply client-side filters + sort
  const items = useMemo(() => {
    let result = [...rawItems]

    if (filters.genre) {
      result = result.filter((it) => it.genre === filters.genre)
    }
    if (filters.yearMin) {
      const min = Number.parseInt(filters.yearMin, 10)
      result = result.filter((it) => it.releaseYear != null && it.releaseYear >= min)
    }
    if (filters.yearMax) {
      const max = Number.parseInt(filters.yearMax, 10)
      result = result.filter((it) => it.releaseYear != null && it.releaseYear <= max)
    }

    if (filters.sort === 'title_asc') {
      result.sort((a, b) => a.title.localeCompare(b.title))
    } else if (filters.sort === 'title_desc') {
      result.sort((a, b) => b.title.localeCompare(a.title))
    } else if (filters.sort === 'year_desc') {
      result.sort((a, b) => (b.releaseYear ?? 0) - (a.releaseYear ?? 0))
    } else if (filters.sort === 'year_asc') {
      result.sort((a, b) => (a.releaseYear ?? 9999) - (b.releaseYear ?? 9999))
    }

    return result
  }, [rawItems, filters])

  return (
    <div className="min-h-screen">
      {/* Sticky header */}
      <div className="sticky top-[65px] z-40 border-b bg-background/95 backdrop-blur-md">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="flex flex-col gap-3 py-4 sm:flex-row sm:items-center">
            {/* Mode buttons */}
            <div className="flex gap-1 rounded-full bg-muted p-1 shrink-0">
              {MODE_CONFIG.map(({ value, label, Icon, activeClass }) => (
                <button
                  key={value}
                  onClick={() => setMode(value)}
                  className={cn(
                    'flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm font-medium transition-all',
                    mode === value
                      ? activeClass
                      : 'text-muted-foreground hover:text-foreground'
                  )}
                >
                  <Icon className="h-4 w-4" />
                  <span className="hidden xs:inline">{label}</span>
                </button>
              ))}
            </div>

            {/* Search */}
            <div className="relative flex-1">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <input
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder={
                  mode === 'book'
                    ? 'Rechercher un livre, auteur…'
                    : mode === 'game'
                    ? 'Rechercher un jeu (ex: Fallout 3)…'
                    : 'Rechercher un film…'
                }
                className="w-full rounded-lg border bg-background py-2 pl-9 pr-9 text-sm outline-none focus:ring-2 focus:ring-offset-1 transition"
              />
              {query && (
                <button
                  onClick={() => setQuery('')}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                >
                  <X className="h-4 w-4" />
                </button>
              )}
            </div>

            {/* Filter button */}
            <FilterBar
              items={rawItems}
              filters={filters}
              onChange={setFilters}
              accent={accent}
            />
          </div>
        </div>
      </div>

      {/* Grid */}
      <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
        <div className="flex items-center gap-3 mb-6">
          <ModeIcon className={cn('h-6 w-6', `text-${accent}-600`)} />
          <div>
            <h1 className="text-xl font-bold tracking-tight">
              {query
                ? `Résultats pour "${query}"`
                : mode === 'book'
                ? 'Catalogue — Livres'
                : mode === 'game'
                ? 'Catalogue — Jeux vidéo'
                : 'Catalogue — Films'}
            </h1>
            {!loading && (
              <p className="text-xs text-muted-foreground">
                {items.length} résultat{items.length !== 1 ? 's' : ''}
                {rawItems.length !== items.length &&
                  ` (${rawItems.length} total filtré)`}
              </p>
            )}
          </div>
        </div>

        <div
          className={cn(
            'transition-all duration-300',
            transitioning ? 'opacity-0 translate-y-2' : 'opacity-100 translate-y-0'
          )}
        >
          {loading ? (
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6">
              {Array.from({ length: 18 }).map((_, i) => (
                <CardSkeleton key={i} />
              ))}
            </div>
          ) : items.length === 0 ? (
            <div className="flex flex-col items-center justify-center gap-3 py-24 text-center">
              <ModeIcon className={cn('h-12 w-12', `text-${accent}-200`)} />
              <p className="text-lg font-medium text-muted-foreground">
                {mode === 'movie' && !query
                  ? 'Ajoutez TMDB_API_KEY dans .env.local pour les films'
                  : mode === 'game' && !query
                  ? 'Ajoutez RAWG_API_KEY dans .env.local pour tous les jeux'
                  : query
                  ? `Aucun résultat pour "${query}"`
                  : 'Aucun résultat'}
              </p>
              {query && (
                <button
                  onClick={() => setQuery('')}
                  className={cn(
                    'text-sm font-medium underline',
                    `text-${accent}-600`
                  )}
                >
                  Effacer la recherche
                </button>
              )}
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6">
              {items.map((item) => (
                <CatalogCard
                  key={`${item.externalSource}-${item.externalId}`}
                  item={item}
                  accent={accent}
                />
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
