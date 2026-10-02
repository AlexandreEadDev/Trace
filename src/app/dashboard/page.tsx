'use client'

export const dynamic = 'force-dynamic'

import { useEffect, useState, useMemo, useCallback } from 'react'
import Link from 'next/link'
import {
  BookOpen, LibraryBig, Gamepad2, Film, Tv, Star, Notebook, ArrowRight,
  Trophy, BarChart3, CalendarDays, TrendingUp, RefreshCw, CheckCircle2, AlertCircle,
  Search, X, ArrowUpDown, ChevronDown,
} from 'lucide-react'
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell,
} from 'recharts'
import { useMode } from '@/context/ModeContext'
import type { ModeAccent } from '@/context/ModeContext'
import { createClient } from '@/lib/supabase/client'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'
import { MODE_STATUS_LABELS } from '@/types'
import type { LibraryEntryWithItem, StatusType, ItemType } from '@/types'
import { MovieWheel } from '@/components/MovieWheel'
import { useCardContextMenu } from '@/hooks/useCardContextMenu'
import { CardContextMenu } from '@/components/CardContextMenu'

const MONTH_LABELS = ['Jan', 'Fév', 'Mar', 'Avr', 'Mai', 'Juin', 'Juil', 'Aoû', 'Sep', 'Oct', 'Nov', 'Déc']
const ACCENT_HEX: Record<string, string> = {
  amber: '#D97706',
  violet: '#7C3AED',
  indigo: '#4F46E5',
  rose: '#E11D48',
  teal: '#0D9488',
}

/** Prefer completed + newest when the same external title was added under multiple item rows. */
function dedupeLibraryEntries(entries: LibraryEntryWithItem[]): LibraryEntryWithItem[] {
  const byKey = new Map<string, LibraryEntryWithItem>()
  for (const entry of entries) {
    const item = entry.items
    if (!item) continue
    const key =
      item.external_source && item.external_id
        ? `${item.external_source}:${item.external_id}`
        : item.id
    const prev = byKey.get(key)
    if (!prev) {
      byKey.set(key, entry)
      continue
    }
    const preferCompleted = entry.status === 'completed' && prev.status !== 'completed'
    const sameStatusNewer =
      entry.status === prev.status &&
      new Date(entry.created_at).getTime() > new Date(prev.created_at).getTime()
    if (preferCompleted || sameStatusNewer) byKey.set(key, entry)
  }
  return Array.from(byKey.values()).sort(
    (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
  )
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function monthIndex(date: string) {
  return new Date(date).getMonth()
}

// ─── Search & sort ────────────────────────────────────────────────────────────

/** The five sortable criteria. Direction is handled separately. */
type SortKey = 'added' | 'title' | 'release' | 'rating' | 'completed'

/** Sort direction. `asc` = A→Z / oldest→newest / lowest→highest. */
type SortDir = 'asc' | 'desc'

interface SortOption {
  key: SortKey
  label: string
  /** Label describing the ascending direction, e.g. "A → Z". */
  ascHint: string
  /** Label describing the descending direction, e.g. "Z → A". */
  descHint: string
  /** Direction applied when the option is first selected. */
  defaultDir: SortDir
}

const SORT_OPTIONS: SortOption[] = [
  { key: 'added', label: "Date d'ajout", ascHint: 'ancien → récent', descHint: 'récent → ancien', defaultDir: 'desc' },
  { key: 'title', label: 'Titre', ascHint: 'A → Z', descHint: 'Z → A', defaultDir: 'asc' },
  { key: 'release', label: 'Année de sortie', ascHint: 'ancien → récent', descHint: 'récent → ancien', defaultDir: 'desc' },
  { key: 'rating', label: 'Note', ascHint: 'basse → haute', descHint: 'haute → basse', defaultDir: 'desc' },
  { key: 'completed', label: 'Date de visionnage', ascHint: 'ancien → récent', descHint: 'récent → ancien', defaultDir: 'desc' },
]

/** Normalize a string for accent/case-insensitive search. */
function normalizeSearch(s: string): string {
  return s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
}

/**
 * Timestamp of the backlog → completed transition.
 * Falls back to updated_at / created_at for legacy rows that predate
 * the completed_at column, so completed entries always have a value.
 */
function entryCompletedTime(e: LibraryEntryWithItem): number {
  return new Date(e.completed_at ?? e.updated_at ?? e.created_at).getTime()
}

/** Filter entries by a free-text query across title, genre and private notes. */
function filterByQuery(entries: LibraryEntryWithItem[], query: string): LibraryEntryWithItem[] {
  const q = normalizeSearch(query.trim())
  if (!q) return entries
  return entries.filter((e) => {
    const item = e.items
    if (!item) return false
    const haystack = normalizeSearch(
      [item.title, item.genre ?? '', e.private_notes ?? '', item.release_year?.toString() ?? ''].join(' ')
    )
    return haystack.includes(q)
  })
}

/**
 * Sort a copy of the entries by the given criterion and direction.
 * `ratings` maps item_id → rating (0 when the item has no review).
 */
function sortEntries(
  entries: LibraryEntryWithItem[],
  key: SortKey,
  dir: SortDir,
  ratings: Map<string, number>
): LibraryEntryWithItem[] {
  const copy = [...entries]
  const sign = dir === 'asc' ? 1 : -1

  const compare = (a: LibraryEntryWithItem, b: LibraryEntryWithItem): number => {
    switch (key) {
      case 'title':
        return a.items.title.localeCompare(b.items.title, 'fr', { sensitivity: 'base' })
      case 'added':
        return new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
      case 'release':
        return (a.items.release_year ?? 0) - (b.items.release_year ?? 0)
      case 'rating':
        return (ratings.get(a.items.id) ?? 0) - (ratings.get(b.items.id) ?? 0)
      case 'completed':
        return entryCompletedTime(a) - entryCompletedTime(b)
      default:
        return 0
    }
  }

  return copy.sort((a, b) => sign * compare(a, b))
}

// ─── Sub-components ─────────────────────────────────────────────────────────

function StatCard({
  label,
  value,
  icon: Icon,
  accent,
  active,
  onClick,
}: {
  label: string
  value: number | string
  icon: React.ElementType
  accent: string
  active?: boolean
  onClick?: () => void
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        'flex flex-col gap-1 rounded-xl border p-4 text-left transition-all',
        active
          ? `border-${accent}-300 bg-${accent}-50`
          : 'bg-card hover:border-muted-foreground/30'
      )}
    >
      <Icon className={cn('h-5 w-5 mb-1', active ? `text-${accent}-600` : 'text-muted-foreground')} />
      <p className={cn('text-2xl font-bold', `text-${accent}-600`)}>{value}</p>
      <p className="text-xs text-muted-foreground leading-snug">{label}</p>
    </button>
  )
}

function EntryRow({
  entry,
  accent,
  rating,
  onChanged,
  menuOpenId,
  onMenuOpenChange,
}: {
  entry: LibraryEntryWithItem
  accent: ModeAccent
  rating?: number
  onChanged?: () => void
  /** Id of the single card whose context menu is open across the dashboard. */
  menuOpenId: string | null
  onMenuOpenChange: (id: string | null) => void
}) {
  const item = entry.items
  const { open, close, longPressHandlers, onClickCapture } = useCardContextMenu({
    activeId: menuOpenId,
    id: entry.id,
    onOpenChange: onMenuOpenChange,
  })
  return (
    <Link
      href={`/item/${item.id}`}
      onClickCapture={onClickCapture}
      {...longPressHandlers}
      className="group relative block select-none rounded-lg border bg-card p-3 transition-all hover:-translate-y-0.5 hover:shadow-sm"
    >
      <div className="flex items-center gap-3">
      <div className="h-14 w-10 shrink-0 overflow-hidden rounded border">
        {item.cover_url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={item.cover_url} alt={item.title} className="h-full w-full object-cover" />
        ) : (
          <div className={cn('flex h-full w-full items-center justify-center text-xs font-bold text-white', `bg-gradient-to-br from-${accent}-400 to-${accent}-600`)}>
            {item.title.charAt(0)}
          </div>
        )}
      </div>
        <div className="flex-1 min-w-0">
          <p className="truncate text-sm font-semibold leading-snug">{item.title}</p>
          <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
            {item.genre && item.genre.split(', ').slice(0, 2).map((g) => (
              <span key={g} className="rounded-full bg-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">
                {g}
              </span>
            ))}
            {item.genre && item.genre.split(', ').length > 2 && (
              <span className="text-[10px] text-muted-foreground/60">
                +{item.genre.split(', ').length - 2}
              </span>
            )}
            {item.release_year && (
              <span className="text-xs text-muted-foreground">
                {item.genre ? '· ' : ''}{item.release_year}
              </span>
            )}
          </div>
        {entry.private_notes && (
          <p className="mt-1 text-xs text-muted-foreground line-clamp-1 flex items-center gap-1">
            <Notebook className="h-3 w-3 shrink-0" />
            {entry.private_notes}
          </p>
        )}
      </div>
        <ArrowRight className="h-4 w-4 shrink-0 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100" />
      </div>

      {open && (
        <CardContextMenu
          target={{ itemId: item.id, title: item.title, rating, status: entry.status }}
          accent={accent}
          onClose={close}
          onChanged={onChanged}
        />
      )}
    </Link>
  )
}

function EmptyState({ status, accent, itemType }: { status: StatusType; accent: ModeAccent; itemType: ItemType }) {
  const labels = MODE_STATUS_LABELS[itemType]
  return (
    <div className="flex flex-col items-center gap-2 py-12 text-center">
      <Star className={cn('h-10 w-10', `text-${accent}-200`)} />
      <p className="text-muted-foreground">
        {status === 'backlog' ? `Rien en "${labels.backlog}" pour le moment.` : `Rien en "${labels.completed}" pour le moment.`}
      </p>
      <Link href="/catalog" className={cn('text-sm font-medium underline', `text-${accent}-600`)}>
        Parcourir le catalogue →
      </Link>
    </div>
  )
}

// Custom tooltip for recharts
function CustomTooltip({ active, payload, label }: { active?: boolean; payload?: { value: number }[]; label?: string }) {
  if (!active || !payload?.length) return null
  return (
    <div className="rounded-lg border bg-card px-3 py-2 shadow-md text-sm">
      <p className="font-medium">{label}</p>
      <p className="text-muted-foreground">{payload[0].value} ajout{payload[0].value !== 1 ? 's' : ''}</p>
    </div>
  )
}

// ─── Main page ───────────────────────────────────────────────────────────────

export default function DashboardPage() {
  const { mode, accent } = useMode()
  const [allEntries, setAllEntries] = useState<LibraryEntryWithItem[]>([])
  const [allReviews, setAllReviews] = useState<{ item_id: string; rating: number; created_at: string }[]>([])
  const [loading, setLoading] = useState(true)
  const [activeTab, setActiveTab] = useState<StatusType>('backlog')
  const [syncState, setSyncState] = useState<'idle' | 'syncing' | 'done' | 'error'>('idle')
  const [syncStats, setSyncStats] = useState<{ updated: number; total: number } | null>(null)
  const [query, setQuery] = useState('')
  const [sortKey, setSortKey] = useState<SortKey>('added')
  const [sortDir, setSortDir] = useState<SortDir>('desc')
  const [sortOpen, setSortOpen] = useState(false)
  /** Id of the single card whose inline context menu is open (null = none). */
  const [menuOpenId, setMenuOpenId] = useState<string | null>(null)

  const year = new Date().getFullYear()
  const hexAccent = ACCENT_HEX[accent] ?? '#D97706'

  /** Fetch library entries + reviews for the current mode. */
  const load = useCallback(
    async (showSpinner: boolean) => {
      if (showSpinner) setLoading(true)
      const supabase = createClient()
      const [{ data: libData }, { data: revData }] = await Promise.all([
        supabase
          .from('user_libraries')
          .select('*, items(*)')
          .order('created_at', { ascending: false }),
        supabase
          .from('reviews')
          .select('item_id, rating, created_at')
          .order('created_at', { ascending: false }),
      ])
      const filtered = ((libData ?? []) as LibraryEntryWithItem[]).filter(
        (e) => e.items && e.items.type === mode
      )
      setAllEntries(dedupeLibraryEntries(filtered))
      setAllReviews((revData ?? []) as { item_id: string; rating: number; created_at: string }[])
      setLoading(false)
    },
    [mode]
  )

  useEffect(() => {
    let cancelled = false
    const run = async (showSpinner: boolean) => {
      if (cancelled) return
      await load(showSpinner)
    }
    run(true)

    // Silent refetch when returning from an item page (status may have changed).
    const onFocus = () => run(false)
    window.addEventListener('focus', onFocus)
    return () => {
      cancelled = true
      window.removeEventListener('focus', onFocus)
    }
  }, [load])

  /** Silent refresh used after a quick action from the card context menu. */
  const refresh = useCallback(async () => {
    await load(false)
  }, [load])

  const byStatus = (status: StatusType) => allEntries.filter((e) => e.status === status)

  /** item_id → rating, used by the "Note" sort criterion. */
  const ratingsByItem = useMemo(() => {
    const map = new Map<string, number>()
    for (const r of allReviews) map.set(r.item_id, r.rating)
    return map
  }, [allReviews])

  /** Entries for the active tab, filtered by the search query then sorted. */
  const visibleEntries = useMemo(
    () => sortEntries(filterByQuery(byStatus(activeTab), query), sortKey, sortDir, ratingsByItem),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [allEntries, activeTab, query, sortKey, sortDir, ratingsByItem]
  )

  const isSearching = query.trim().length > 0

  const activeSortOption = SORT_OPTIONS.find((o) => o.key === sortKey) ?? SORT_OPTIONS[0]
  const activeSortHint = sortDir === 'asc' ? activeSortOption.ascHint : activeSortOption.descHint

  /**
   * Select a sort criterion.
   * - Clicking the active criterion toggles its direction and keeps the menu open.
   * - Selecting a different criterion applies its default direction and closes the menu.
   */
  const selectSort = (key: SortKey) => {
    if (key === sortKey) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'))
      return
    }
    setSortKey(key)
    setSortDir(SORT_OPTIONS.find((o) => o.key === key)?.defaultDir ?? 'desc')
    setSortOpen(false)
  }

  // ── Stats ──
  const totalItems = allEntries.length
  const completedItems = byStatus('completed').length
  const avgRating = useMemo(() => {
    if (!allReviews.length) return null
    return allReviews.reduce((s, r) => s + r.rating, 0) / allReviews.length
  }, [allReviews])
  const withNotes = allEntries.filter((e) => e.private_notes && e.private_notes.trim().length > 0)

  // ── Year activity chart ──
  const thisYearEntries = allEntries.filter(
    (e) => new Date(e.created_at).getFullYear() === year
  )
  const chartData = useMemo(() => {
    const counts = Array(12).fill(0)
    for (const e of thisYearEntries) counts[monthIndex(e.created_at)]++
    return MONTH_LABELS.map((label, i) => ({ label, count: counts[i] }))
  }, [thisYearEntries])

  const mostActiveMonthIdx = chartData.reduce(
    (best, d, i) => (d.count > chartData[best].count ? i : best),
    0
  )
  const topItem = useMemo(() => {
    return allEntries.find((e) => e.status === 'completed') ?? allEntries[0] ?? null
  }, [allEntries])

  const refreshGenres = useCallback(async () => {
    setSyncState('syncing')
    setSyncStats(null)
    try {
      const res = await fetch('/api/admin/refresh-genres', { method: 'POST' })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error ?? 'Erreur serveur')
      setSyncStats({ updated: json.updated, total: json.total })
      setSyncState('done')
      // Reload entries after sync
      if (json.updated > 0) {
        const supabase = createClient()
        const { data: libData } = await supabase
          .from('user_libraries')
          .select('*, items(*)')
          .order('created_at', { ascending: false })
        const filtered = ((libData ?? []) as LibraryEntryWithItem[]).filter(
          (e) => e.items && e.items.type === mode
        )
        setAllEntries(dedupeLibraryEntries(filtered))
      }
    } catch {
      setSyncState('error')
    }
  }, [mode])

  const ModeIcon =
    mode === 'book' ? BookOpen : mode === 'manga' ? LibraryBig : mode === 'game' ? Gamepad2 : mode === 'tv' ? Tv : Film
  const labels = MODE_STATUS_LABELS[mode]

  return (
    <div className="mx-auto max-w-5xl px-4 py-10 sm:px-6 lg:px-8 space-y-10">

      {/* ── Header ── */}
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <ModeIcon className={cn('h-7 w-7', `text-${accent}-600`)} />
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Mon Dashboard</h1>
            <p className="text-sm text-muted-foreground">
              {mode === 'book'
                ? 'Ta bibliothèque'
                : mode === 'manga'
                  ? 'Ta mangathèque'
                  : mode === 'game'
                    ? 'Ta ludothèque'
                    : mode === 'tv'
                      ? 'Ta sériethèque'
                      : 'Ta cinémathèque'}
            </p>
          </div>
        </div>

        {/* Sync genres button */}
        {!loading && allEntries.length > 0 && (
          <div className="flex flex-col items-end gap-1">
            <button
              onClick={refreshGenres}
              disabled={syncState === 'syncing'}
              title="Mettre à jour les genres depuis les APIs externes"
              className={cn(
                'flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium border transition-all',
                syncState === 'syncing'
                  ? 'opacity-50 cursor-not-allowed bg-muted border-transparent text-muted-foreground'
                  : syncState === 'done'
                    ? `border-${accent}-200 bg-${accent}-50 text-${accent}-700`
                    : syncState === 'error'
                      ? 'border-red-200 bg-red-50 text-red-600'
                      : 'bg-muted border-transparent text-muted-foreground hover:text-foreground hover:border-muted-foreground/30'
              )}
            >
              {syncState === 'syncing' ? (
                <RefreshCw className="h-3 w-3 animate-spin" />
              ) : syncState === 'done' ? (
                <CheckCircle2 className="h-3 w-3" />
              ) : syncState === 'error' ? (
                <AlertCircle className="h-3 w-3" />
              ) : (
                <RefreshCw className="h-3 w-3" />
              )}
              {syncState === 'syncing'
                ? 'Mise à jour…'
                : syncState === 'done'
                  ? 'Genres mis à jour'
                  : syncState === 'error'
                    ? 'Erreur'
                    : 'Sync genres'}
            </button>
            {syncState === 'done' && syncStats && (
              <p className="text-[10px] text-muted-foreground">
                {syncStats.updated}/{syncStats.total} mis à jour
              </p>
            )}
          </div>
        )}
      </div>

      {/* ── REWIND — Ton année ── */}
      <section className={cn('rounded-2xl border-2 overflow-hidden', `border-${accent}-100`)}>
        <div className={cn('px-6 py-4 flex items-center gap-2', `bg-${accent}-600`)}>
          <TrendingUp className="h-5 w-5 text-white" />
          <h2 className="font-bold text-white text-lg">Ton Rewind {year}</h2>
        </div>

        <div className="p-6 space-y-6 bg-card">
          {/* Key stats row */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {[
              { label: `Ajoutés en ${year}`, value: loading ? '—' : thisYearEntries.length, icon: CalendarDays },
              { label: 'Terminés', value: loading ? '—' : thisYearEntries.filter(e => e.status === 'completed').length, icon: Trophy },
              { label: 'Note moyenne', value: loading || !avgRating ? '—' : `★ ${avgRating.toFixed(1)}`, icon: Star },
              { label: 'Mois le + actif', value: loading || thisYearEntries.length === 0 ? '—' : MONTH_LABELS[mostActiveMonthIdx], icon: BarChart3 },
            ].map(({ label, value, icon: Icon }) => (
              <div key={label} className={cn('rounded-xl p-4 text-center', `bg-${accent}-50`)}>
                <Icon className={cn('h-5 w-5 mx-auto mb-1', `text-${accent}-500`)} />
                <p className={cn('text-xl font-bold', `text-${accent}-700`)}>{value}</p>
                <p className="text-xs text-muted-foreground mt-0.5">{label}</p>
              </div>
            ))}
          </div>

          {/* Bar chart */}
          {!loading && (
            <div>
              <p className="text-sm font-medium text-muted-foreground mb-3">
                Activité mensuelle {year}
              </p>
              <ResponsiveContainer width="100%" height={160}>
                <BarChart data={chartData} margin={{ top: 0, right: 0, bottom: 0, left: -20 }}>
                  <XAxis dataKey="label" tick={{ fontSize: 11 }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fontSize: 11 }} allowDecimals={false} axisLine={false} tickLine={false} />
                  <Tooltip content={<CustomTooltip />} cursor={{ fill: 'rgba(0,0,0,0.04)' }} />
                  <Bar dataKey="count" radius={[4, 4, 0, 0]}>
                    {chartData.map((_, i) => (
                      <Cell key={i} fill={i === mostActiveMonthIdx ? hexAccent : `${hexAccent}55`} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}

          {/* Top item */}
          {topItem && !loading && (
            <div className="flex items-center gap-3 rounded-xl border p-3">
              <Trophy className={cn('h-5 w-5 shrink-0', `text-${accent}-500`)} />
              <div className="min-w-0">
                <p className="text-xs text-muted-foreground">Dernier terminé</p>
                <p className="font-semibold truncate">{topItem.items.title}</p>
              </div>
              <Link
                href={`/item/${topItem.items.id}`}
                className={cn('ml-auto shrink-0 text-xs font-medium', `text-${accent}-600`)}
              >
                Voir →
              </Link>
            </div>
          )}
        </div>
      </section>

      {/* ── Global stats cards ── */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <StatCard
          label="Total"
          value={loading ? '—' : totalItems}
          icon={ModeIcon}
          accent={accent}
        />
        <StatCard
          label={labels.completed}
          value={loading ? '—' : completedItems}
          icon={Trophy}
          accent={accent}
          active={activeTab === 'completed'}
          onClick={() => setActiveTab('completed')}
        />
        <StatCard
          label="Note moy."
          value={loading || !avgRating ? '—' : `${avgRating.toFixed(1)}/5`}
          icon={Star}
          accent={accent}
        />
        <StatCard
          label="Notes privées"
          value={loading ? '—' : withNotes.length}
          icon={Notebook}
          accent={accent}
        />
      </div>

      {/* ── Library list ── */}
      <section className="space-y-3">
        {/* Pill toggle — same style as header ModeSwitch */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <h2 className="text-base font-semibold text-muted-foreground">Ma collection</h2>
            {!loading && byStatus('backlog').length > 0 && (
              <MovieWheel entries={byStatus('backlog')} accent={accent} mode={mode} />
            )}
          </div>
          <div role="group" className="flex items-center gap-1 rounded-full bg-muted p-1">
            {(['backlog', 'completed'] as StatusType[]).map((s) => {
              const accentActive =
                accent === 'amber'
                  ? 'bg-amber-600'
                  : accent === 'violet'
                    ? 'bg-violet-600'
                    : accent === 'indigo'
                      ? 'bg-indigo-600'
                      : 'bg-rose-600'
              return (
                <button
                  key={s}
                  type="button"
                  onClick={() => setActiveTab(s)}
                  className={cn(
                    'flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium transition-all duration-200 sm:text-sm',
                    activeTab === s
                      ? `${accentActive} text-white shadow-sm scale-[1.03]`
                      : 'text-muted-foreground hover:text-foreground'
                  )}
                >
                  {labels[s]}
                  {!loading && byStatus(s).length > 0 && (
                    <span className={cn(
                      'inline-flex h-4 min-w-4 items-center justify-center rounded-full px-1 text-[10px] font-bold tabular-nums',
                      activeTab === s ? 'bg-white/25 text-white' : 'bg-muted-foreground/20 text-muted-foreground'
                    )}>
                      {byStatus(s).length}
                    </span>
                  )}
                </button>
              )
            })}
          </div>
        </div>

        {/* Search + sort toolbar */}
        {!loading && byStatus(activeTab).length > 0 && (
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            {/* Search */}
            <div className="relative flex-1">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <input
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Rechercher par titre, genre, note…"
                className={cn(
                  'w-full rounded-full border bg-card py-2 pl-9 pr-9 text-sm outline-none transition-colors',
                  `focus:border-${accent}-400 focus:ring-2 focus:ring-${accent}-100`
                )}
              />
              {isSearching && (
                <button
                  type="button"
                  onClick={() => setQuery('')}
                  aria-label="Effacer la recherche"
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 rounded-full p-1 text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              )}
            </div>

            {/* Sort dropdown */}
            <div className="group relative shrink-0">
              <div
                className={cn(
                  'flex w-full items-center gap-1 rounded-full border bg-card pl-3 pr-1.5 py-1.5 text-sm font-medium transition-colors sm:w-auto',
                  sortOpen ? `border-${accent}-400` : 'hover:border-muted-foreground/30'
                )}
              >
                <button
                  type="button"
                  onClick={() => setSortOpen((v) => !v)}
                  className="flex min-w-0 flex-1 items-center gap-1.5 py-0.5 text-left"
                >
                  <ArrowUpDown className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                  <span className="truncate">{activeSortOption.label}</span>
                  <span className="hidden text-xs font-normal text-muted-foreground sm:inline">{activeSortHint}</span>
                  <ChevronDown className={cn('h-3.5 w-3.5 shrink-0 text-muted-foreground transition-transform', sortOpen && 'rotate-180')} />
                </button>

                {/* Direction toggle — always visible */}
                <button
                  type="button"
                  onClick={() => setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'))}
                  aria-label={sortDir === 'asc' ? 'Trier par ordre décroissant' : 'Trier par ordre croissant'}
                  title={sortDir === 'asc' ? 'Ordre décroissant' : 'Ordre croissant'}
                  className={cn(
                    'flex h-6 w-6 shrink-0 items-center justify-center rounded-full transition-colors',
                    `hover:bg-${accent}-50 hover:text-${accent}-600`
                  )}
                >
                  <ArrowUpDown
                    className={cn('h-3.5 w-3.5 transition-transform', sortDir === 'asc' && 'rotate-180')}
                  />
                </button>
              </div>

              {sortOpen && (
                <>
                  {/* Click-away backdrop */}
                  <div className="fixed inset-0 z-10" onClick={() => setSortOpen(false)} />
                  <div className="absolute right-0 z-20 mt-1 w-64 overflow-hidden rounded-xl border bg-card shadow-lg">
                    {SORT_OPTIONS.map((opt) => {
                      const isActive = sortKey === opt.key
                      return (
                        <button
                          key={opt.key}
                          type="button"
                          onClick={() => selectSort(opt.key)}
                          className={cn(
                            'flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-sm transition-colors hover:bg-muted/60',
                            isActive ? cn('font-semibold', `text-${accent}-600`) : 'text-foreground'
                          )}
                        >
                          <span className="flex flex-col">
                            <span>{opt.label}</span>
                            <span className="text-[11px] font-normal text-muted-foreground">
                              {isActive ? (sortDir === 'asc' ? opt.ascHint : opt.descHint) : opt.ascHint}
                            </span>
                          </span>
                          {isActive && (
                            <ArrowUpDown
                              className={cn('h-3.5 w-3.5 shrink-0 transition-transform', sortDir === 'asc' && 'rotate-180')}
                            />
                          )}
                        </button>
                      )
                    })}
                  </div>
                </>
              )}
            </div>
          </div>
        )}

        {/* Content */}
        <div className="space-y-2">
          {loading ? (
            <>
              {[1, 2, 3].map((i) => (
                <div key={i} className="h-16 animate-pulse rounded-lg border bg-muted" />
              ))}
            </>
          ) : byStatus(activeTab).length === 0 ? (
            <EmptyState status={activeTab} accent={accent} itemType={mode} />
          ) : visibleEntries.length === 0 ? (
            <div className="flex flex-col items-center gap-2 py-12 text-center">
              <Search className={cn('h-10 w-10', `text-${accent}-200`)} />
              <p className="text-muted-foreground">
                Aucun résultat pour «&nbsp;{query.trim()}&nbsp;»
              </p>
              <button
                type="button"
                onClick={() => setQuery('')}
                className={cn('text-sm font-medium underline', `text-${accent}-600`)}
              >
                Effacer la recherche
              </button>
            </div>
          ) : (
            visibleEntries.map((entry) => (
              <EntryRow
                key={entry.id}
                entry={entry}
                accent={accent}
                rating={ratingsByItem.get(entry.items.id)}
                onChanged={refresh}
                menuOpenId={menuOpenId}
                onMenuOpenChange={setMenuOpenId}
              />
            ))
          )}
        </div>
      </section>

      {/* ── Journal privé ── */}
      {!loading && withNotes.length > 0 && (
        <section className="space-y-4">
          <div className="flex items-center gap-2">
            <Notebook className={cn('h-5 w-5', `text-${accent}-600`)} />
            <h2 className="text-lg font-bold">Journal privé</h2>
            <Badge variant="secondary">{withNotes.length}</Badge>
          </div>
          <div className="space-y-3">
            {withNotes.map((entry) => (
              <Link
                key={entry.id}
                href={`/item/${entry.items.id}`}
                className="block rounded-xl border bg-card p-4 hover:shadow-sm transition-all group"
              >
                <div className="flex items-start gap-3">
                  {entry.items.cover_url && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={entry.items.cover_url}
                      alt={entry.items.title}
                      className="w-10 h-14 rounded object-cover border shrink-0"
                    />
                  )}
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold truncate">{entry.items.title}</p>
                    <p className="mt-1 text-sm text-muted-foreground line-clamp-3 whitespace-pre-wrap">
                      {entry.private_notes}
                    </p>
                  </div>
                  <ArrowRight className="h-4 w-4 text-muted-foreground shrink-0 opacity-0 group-hover:opacity-100 transition-opacity mt-1" />
                </div>
              </Link>
            ))}
          </div>
        </section>
      )}
    </div>
  )
}
