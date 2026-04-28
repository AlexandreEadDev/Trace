'use client'

export const dynamic = 'force-dynamic'

import { useEffect, useState, useMemo } from 'react'
import Link from 'next/link'
import {
  BookOpen, Gamepad2, Film, Star, Notebook, ArrowRight,
  Trophy, BarChart3, CalendarDays, TrendingUp,
} from 'lucide-react'
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell,
} from 'recharts'
import { useMode } from '@/context/ModeContext'
import { createClient } from '@/lib/supabase/client'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'
import { MODE_STATUS_LABELS } from '@/types'
import type { LibraryEntryWithItem, StatusType, ItemType } from '@/types'

const MONTH_LABELS = ['Jan', 'Fév', 'Mar', 'Avr', 'Mai', 'Juin', 'Juil', 'Aoû', 'Sep', 'Oct', 'Nov', 'Déc']
const ACCENT_HEX: Record<string, string> = {
  amber: '#D97706',
  indigo: '#4F46E5',
  rose: '#E11D48',
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function monthIndex(date: string) {
  return new Date(date).getMonth()
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
}: {
  entry: LibraryEntryWithItem
  accent: 'amber' | 'indigo' | 'rose'
}) {
  const item = entry.items
  return (
    <Link
      href={`/item/${item.id}`}
      className="flex items-center gap-4 rounded-lg border bg-card p-4 transition-all hover:shadow-sm hover:-translate-y-0.5 group"
    >
      <div className="shrink-0 w-10 h-14 rounded overflow-hidden border">
        {item.cover_url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={item.cover_url} alt={item.title} className="h-full w-full object-cover" />
        ) : (
          <div className={cn('flex h-full w-full items-center justify-center text-sm font-bold text-white', `bg-gradient-to-br from-${accent}-400 to-${accent}-600`)}>
            {item.title.charAt(0)}
          </div>
        )}
      </div>
      <div className="flex-1 min-w-0">
        <p className="font-medium truncate">{item.title}</p>
        <div className="flex items-center gap-2 mt-0.5">
          {item.genre && <span className="text-xs text-muted-foreground">{item.genre}</span>}
          {item.release_year && <span className="text-xs text-muted-foreground">· {item.release_year}</span>}
        </div>
        {entry.private_notes && (
          <p className="mt-1 text-xs text-muted-foreground line-clamp-1 flex items-center gap-1">
            <Notebook className="h-3 w-3 shrink-0" />
            {entry.private_notes}
          </p>
        )}
      </div>
      <ArrowRight className="shrink-0 h-4 w-4 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
    </Link>
  )
}

function EmptyState({ status, accent, itemType }: { status: StatusType; accent: 'amber' | 'indigo' | 'rose'; itemType: ItemType }) {
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
  const [allReviews, setAllReviews] = useState<{ rating: number; created_at: string }[]>([])
  const [loading, setLoading] = useState(true)
  const [activeTab, setActiveTab] = useState<StatusType>('backlog')

  const year = new Date().getFullYear()
  const hexAccent = ACCENT_HEX[accent] ?? '#D97706'

  useEffect(() => {
    const supabase = createClient()
    setLoading(true)

    Promise.all([
      supabase
        .from('user_libraries')
        .select('*, items(*)')
        .order('created_at', { ascending: false }),
      supabase
        .from('reviews')
        .select('rating, created_at')
        .order('created_at', { ascending: false }),
    ]).then(([{ data: libData }, { data: revData }]) => {
      const filtered = ((libData ?? []) as LibraryEntryWithItem[]).filter(
        (e) => e.items && e.items.type === mode
      )
      setAllEntries(filtered)
      setAllReviews((revData ?? []) as { rating: number; created_at: string }[])
      setLoading(false)
    })
  }, [mode])

  const byStatus = (status: StatusType) => allEntries.filter((e) => e.status === status)

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

  const ModeIcon = mode === 'book' ? BookOpen : mode === 'game' ? Gamepad2 : Film
  const labels = MODE_STATUS_LABELS[mode]

  return (
    <div className="mx-auto max-w-5xl px-4 py-10 sm:px-6 lg:px-8 space-y-10">

      {/* ── Header ── */}
      <div className="flex items-center gap-3">
        <ModeIcon className={cn('h-7 w-7', `text-${accent}-600`)} />
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Mon Dashboard</h1>
          <p className="text-sm text-muted-foreground">
            {mode === 'book' ? 'Ta bibliothèque' : mode === 'game' ? 'Ta ludothèque' : 'Ta cinémathèque'}
          </p>
        </div>
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
      <section>
        <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as StatusType)}>
          <div className="flex items-center gap-2 mb-4">
            <TabsList className="inline-flex">
              {(['backlog', 'completed'] as StatusType[]).map((s) => (
                <TabsTrigger key={s} value={s} className="px-4 py-1.5 text-sm">
                  {labels[s]}
                  {!loading && byStatus(s).length > 0 && (
                    <Badge variant="secondary" className="ml-1.5 h-4 px-1 text-[10px]">
                      {byStatus(s).length}
                    </Badge>
                  )}
                </TabsTrigger>
              ))}
            </TabsList>
          </div>

          {(['backlog', 'completed'] as StatusType[]).map((s) => (
            <TabsContent key={s} value={s} className="mt-4 space-y-2">
              {loading ? (
                <div className="space-y-2">
                  {[1, 2, 3].map((i) => (
                    <div key={i} className="h-20 animate-pulse rounded-lg border bg-muted" />
                  ))}
                </div>
              ) : byStatus(s).length === 0 ? (
                <EmptyState status={s} accent={accent} itemType={mode} />
              ) : (
                byStatus(s).map((entry) => (
                  <EntryRow key={entry.id} entry={entry} accent={accent} />
                ))
              )}
            </TabsContent>
          ))}
        </Tabs>
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
