'use client'

export const dynamic = 'force-dynamic'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { BookOpen, Gamepad2, Film, Star, Notebook, ArrowRight } from 'lucide-react'
import { useMode } from '@/context/ModeContext'
import { createClient } from '@/lib/supabase/client'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'
import type { LibraryEntryWithItem, StatusType } from '@/types'

const STATUS_TABS: { value: StatusType; label: string }[] = [
  { value: 'backlog', label: 'En attente' },
  { value: 'in_progress', label: 'En cours' },
  { value: 'completed', label: 'Terminé' },
]

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
      {/* Mini cover */}
      <div className="shrink-0 w-10 h-14 rounded overflow-hidden border">
        {item.cover_url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={item.cover_url}
            alt={item.title}
            className="h-full w-full object-cover"
          />
        ) : (
          <div
            className={cn(
              'flex h-full w-full items-center justify-center text-sm font-bold text-white',
              `bg-gradient-to-br from-${accent}-400 to-${accent}-600`
            )}
          >
            {item.title.charAt(0)}
          </div>
        )}
      </div>

      {/* Info */}
      <div className="flex-1 min-w-0">
        <p className="font-medium truncate">{item.title}</p>
        <div className="flex items-center gap-2 mt-0.5">
          {item.genre && (
            <span className="text-xs text-muted-foreground">{item.genre}</span>
          )}
          {item.release_year && (
            <span className="text-xs text-muted-foreground">
              · {item.release_year}
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

      <ArrowRight className="shrink-0 h-4 w-4 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
    </Link>
  )
}

function EmptyState({ status, accent }: { status: StatusType; accent: 'amber' | 'indigo' | 'rose' }) {
  const messages: Record<StatusType, string> = {
    backlog: 'Votre liste d\'attente est vide.',
    in_progress: 'Rien en cours pour le moment.',
    completed: 'Vous n\'avez encore rien terminé.',
  }
  return (
    <div className="flex flex-col items-center gap-2 py-16 text-center">
      <Star className={cn('h-10 w-10', `text-${accent}-200`)} />
      <p className="text-muted-foreground">{messages[status]}</p>
      <Link
        href="/"
        className={cn('text-sm font-medium underline', `text-${accent}-600`)}
      >
        Parcourir le catalogue →
      </Link>
    </div>
  )
}

export default function DashboardPage() {
  const { mode, accent } = useMode()
  const [entries, setEntries] = useState<LibraryEntryWithItem[]>([])
  const [loading, setLoading] = useState(true)
  const [activeTab, setActiveTab] = useState<StatusType>('backlog')

  useEffect(() => {
    const supabase = createClient()
    setLoading(true)

    supabase
      .from('user_libraries')
      .select('*, items(*)')
      .eq('items.type', mode)
      .order('created_at', { ascending: false })
      .then(({ data, error }) => {
        if (error) console.error(error)
        // Filter out entries where items didn't match (type mismatch)
        const filtered = (data ?? []).filter(
          (e) => e.items && e.items.type === mode
        ) as LibraryEntryWithItem[]
        setEntries(filtered)
        setLoading(false)
      })
  }, [mode])

  const byStatus = (status: StatusType) =>
    entries.filter((e) => e.status === status)

  const ModeIcon = mode === 'book' ? BookOpen : mode === 'game' ? Gamepad2 : Film

  return (
    <div className="mx-auto max-w-4xl px-4 py-10 sm:px-6 lg:px-8 space-y-8">
      {/* Header */}
      <div className="flex items-center gap-3">
        <ModeIcon className={cn('h-7 w-7', `text-${accent}-600`)} />
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Mon Dashboard</h1>
          <p className="text-sm text-muted-foreground">
            Suivi de vos {mode === 'book' ? 'livres' : 'jeux vidéo'}
          </p>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-3">
        {STATUS_TABS.map(({ value, label }) => (
          <button
            key={value}
            onClick={() => setActiveTab(value)}
            className={cn(
              'rounded-xl border p-4 text-left transition-all',
              activeTab === value
                ? `border-${accent}-300 bg-${accent}-100/50`
                : 'bg-card hover:border-muted-foreground/30'
            )}
          >
            <p className={cn('text-2xl font-bold', `text-${accent}-600`)}>
              {loading ? '—' : byStatus(value).length}
            </p>
            <p className="text-xs text-muted-foreground mt-0.5">{label}</p>
          </button>
        ))}
      </div>

      {/* Tabs */}
      <Tabs
        value={activeTab}
        onValueChange={(v) => setActiveTab(v as StatusType)}
      >
        <TabsList className="w-full">
          {STATUS_TABS.map(({ value, label }) => (
            <TabsTrigger key={value} value={value} className="flex-1">
              {label}
              {!loading && byStatus(value).length > 0 && (
                <Badge
                  variant="secondary"
                  className="ml-2 h-5 px-1.5 text-xs"
                >
                  {byStatus(value).length}
                </Badge>
              )}
            </TabsTrigger>
          ))}
        </TabsList>

        {STATUS_TABS.map(({ value }) => (
          <TabsContent key={value} value={value} className="mt-4 space-y-2">
            {loading ? (
              <div className="space-y-2">
                {[1, 2, 3].map((i) => (
                  <div
                    key={i}
                    className="h-20 animate-pulse rounded-lg border bg-muted"
                  />
                ))}
              </div>
            ) : byStatus(value).length === 0 ? (
              <EmptyState status={value} accent={accent} />
            ) : (
              byStatus(value).map((entry) => (
                <EntryRow key={entry.id} entry={entry} accent={accent} />
              ))
            )}
          </TabsContent>
        ))}
      </Tabs>
    </div>
  )
}
