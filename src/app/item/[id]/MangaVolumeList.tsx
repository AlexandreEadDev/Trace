'use client'

import { useEffect, useState, useCallback } from 'react'
import { BookOpen, CheckCircle2, Circle, Loader2, X, ChevronDown } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { VolumeInfo } from '@/lib/catalog/jikan'

interface MangaVolumeListProps {
  mangaItemId: string
  mangaExternalId: string
  mangaCoverUrl?: string | null
  totalVolumes?: number | null
  totalChapters?: number | null
}

type VolumeStatus = 'backlog' | 'completed'
type ProgressMap = Record<number, VolumeStatus>

interface VolumeModalData extends VolumeInfo {
  status?: VolumeStatus
}

export function MangaVolumeList({ mangaItemId, mangaExternalId, mangaCoverUrl, totalVolumes, totalChapters }: MangaVolumeListProps) {
  const [volumes, setVolumes] = useState<VolumeInfo[]>([])
  const [progress, setProgress] = useState<ProgressMap>({})
  const [loadingVolumes, setLoadingVolumes] = useState(true)
  const [selected, setSelected] = useState<Set<number>>(new Set())
  const [bulkLoading, setBulkLoading] = useState(false)
  const [modalVolume, setModalVolume] = useState<VolumeModalData | null>(null)
  const [collapsed, setCollapsed] = useState(false)

  const fetchVolumes = useCallback(async () => {
    setLoadingVolumes(true)
    try {
      const params = new URLSearchParams({ external_id: mangaExternalId })
      if (totalVolumes != null) params.set('total', String(totalVolumes))
      if (totalChapters != null) params.set('chapters', String(totalChapters))
      if (mangaCoverUrl) params.set('fallback_cover', mangaCoverUrl)
      const res = await fetch(`/api/manga/volumes/list?${params}`)
      if (res.ok) {
        const data: VolumeInfo[] = await res.json()
        setVolumes(data)
      }
    } catch {
      // keep empty
    }
    setLoadingVolumes(false)
  }, [mangaExternalId, totalVolumes, totalChapters])

  const fetchProgress = useCallback(async () => {
    try {
      const res = await fetch(`/api/manga/volumes?manga_item_id=${mangaItemId}`)
      if (!res.ok) return
      const rows: { volume_number: number; status: VolumeStatus }[] = await res.json()
      const map: ProgressMap = {}
      for (const r of rows) map[r.volume_number] = r.status
      setProgress(map)
    } catch {
      // not logged in or error
    }
  }, [mangaItemId])

  useEffect(() => {
    fetchVolumes()
    fetchProgress()
  }, [fetchVolumes, fetchProgress])

  const toggleSelect = (vol: number) => {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(vol)) next.delete(vol)
      else next.add(vol)
      return next
    })
  }

  const selectAll = () => setSelected(new Set(volumes.map((v) => v.volume_number)))
  const clearSelection = () => setSelected(new Set())

  const bulkSetStatus = async (status: VolumeStatus | 'clear') => {
    if (selected.size === 0) return
    setBulkLoading(true)
    try {
      if (status === 'clear') {
        await fetch('/api/manga/volumes', {
          method: 'DELETE',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            manga_item_id: mangaItemId,
            volume_numbers: Array.from(selected),
          }),
        })
        setProgress((prev) => {
          const next = { ...prev }
          for (const v of selected) delete next[v]
          return next
        })
      } else {
        await fetch('/api/manga/volumes', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            manga_item_id: mangaItemId,
            volumes: Array.from(selected).map((v) => ({ volume_number: v, status })),
          }),
        })
        setProgress((prev) => {
          const next = { ...prev }
          for (const v of selected) next[v] = status
          return next
        })
      }
    } finally {
      setBulkLoading(false)
      setSelected(new Set())
    }
  }

  const setSingleStatus = async (volumeNumber: number, status: VolumeStatus | 'clear') => {
    try {
      if (status === 'clear') {
        await fetch('/api/manga/volumes', {
          method: 'DELETE',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ manga_item_id: mangaItemId, volume_number: volumeNumber }),
        })
        setProgress((prev) => {
          const next = { ...prev }
          delete next[volumeNumber]
          return next
        })
      } else {
        await fetch('/api/manga/volumes', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            manga_item_id: mangaItemId,
            volume_number: volumeNumber,
            status,
          }),
        })
        setProgress((prev) => ({ ...prev, [volumeNumber]: status }))
      }
    } catch {
      // silent
    }
  }

  if (loadingVolumes) {
    return (
      <div className="flex items-center gap-2 text-sm text-muted-foreground py-4">
        <Loader2 className="h-4 w-4 animate-spin" />
        Chargement des tomes…
      </div>
    )
  }

  if (volumes.length === 0) return null

  const completedCount = volumes.filter((v) => progress[v.volume_number] === 'completed').length
  const backlogCount = volumes.filter((v) => progress[v.volume_number] === 'backlog').length

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <button
          onClick={() => setCollapsed((v) => !v)}
          className="flex items-center gap-2 text-base font-semibold hover:text-foreground/80 transition-colors"
        >
          <BookOpen className="h-4 w-4" />
          Tomes ({volumes.length})
          <ChevronDown className={cn('h-4 w-4 transition-transform text-muted-foreground', collapsed && '-rotate-90')} />
        </button>
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          {completedCount > 0 && (
            <span className="rounded-full bg-green-100 dark:bg-green-950 px-2 py-0.5 text-green-700 dark:text-green-300 font-medium">
              {completedCount} lu{completedCount > 1 ? 's' : ''}
            </span>
          )}
          {backlogCount > 0 && (
            <span className="rounded-full bg-amber-100 dark:bg-amber-950 px-2 py-0.5 text-amber-700 dark:text-amber-300 font-medium">
              {backlogCount} à lire
            </span>
          )}
        </div>
      </div>

      {!collapsed && (
        <>
          {/* Bulk toolbar */}
          {volumes.length > 1 && (
            <div className="flex flex-wrap items-center gap-2">
              <button
                onClick={selected.size === volumes.length ? clearSelection : selectAll}
                className="rounded-lg border px-2.5 py-1 text-xs font-medium transition-colors hover:bg-muted"
              >
                {selected.size === volumes.length ? 'Tout désélectionner' : 'Tout sélectionner'}
              </button>

              {selected.size > 0 && (
                <>
                  <span className="text-xs text-muted-foreground">{selected.size} sélectionné{selected.size > 1 ? 's' : ''}</span>
                  <button
                    onClick={() => bulkSetStatus('backlog')}
                    disabled={bulkLoading}
                    className="rounded-lg border border-amber-200 bg-amber-50 dark:bg-amber-950 px-2.5 py-1 text-xs font-medium text-amber-700 dark:text-amber-300 transition-colors hover:bg-amber-100 dark:hover:bg-amber-900 disabled:opacity-50"
                  >
                    À lire
                  </button>
                  <button
                    onClick={() => bulkSetStatus('completed')}
                    disabled={bulkLoading}
                    className="rounded-lg border border-green-200 bg-green-50 dark:bg-green-950 px-2.5 py-1 text-xs font-medium text-green-700 dark:text-green-300 transition-colors hover:bg-green-100 dark:hover:bg-green-900 disabled:opacity-50"
                  >
                    Terminé
                  </button>
                  <button
                    onClick={() => bulkSetStatus('clear')}
                    disabled={bulkLoading}
                    className="rounded-lg border px-2.5 py-1 text-xs font-medium text-muted-foreground transition-colors hover:bg-muted disabled:opacity-50"
                  >
                    Effacer
                  </button>
                  {bulkLoading && <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />}
                </>
              )}
            </div>
          )}

          {/* Volume grid */}
          <div className="grid grid-cols-3 gap-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 xl:grid-cols-8">
            {volumes.map((vol) => {
              const status = progress[vol.volume_number]
              const isSelected = selected.has(vol.volume_number)

              return (
                <div
                  key={vol.volume_number}
                  className={cn(
                    'group relative flex flex-col overflow-hidden rounded-xl border transition-all',
                    isSelected ? 'ring-2 ring-pink-500 border-pink-300' : 'hover:border-muted-foreground/30',
                    status === 'completed' && 'border-green-200 dark:border-green-800',
                    status === 'backlog' && 'border-amber-200 dark:border-amber-800'
                  )}
                >
                  {/* Selection checkbox */}
                  <button
                    onClick={() => toggleSelect(vol.volume_number)}
                    className="absolute left-1.5 top-1.5 z-10 rounded-full bg-black/40 p-0.5 backdrop-blur-sm transition-opacity opacity-0 group-hover:opacity-100"
                    title={isSelected ? 'Désélectionner' : 'Sélectionner'}
                  >
                    {isSelected
                      ? <CheckCircle2 className="h-4 w-4 text-pink-400" />
                      : <Circle className="h-4 w-4 text-white/80" />
                    }
                  </button>

                  {/* Status badge */}
                  {status && (
                    <div className={cn(
                      'absolute right-1.5 top-1.5 z-10 rounded-full px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide',
                      status === 'completed'
                        ? 'bg-green-500 text-white'
                        : 'bg-amber-500 text-white'
                    )}>
                      {status === 'completed' ? 'Lu' : 'À lire'}
                    </div>
                  )}

                  {/* Cover / card body — opens modal */}
                  <button
                    onClick={() => setModalVolume({ ...vol, status })}
                    className="flex flex-col flex-1 text-left"
                  >
                    <div className="aspect-[2/3] w-full bg-muted overflow-hidden">
                      {vol.coverUrl ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={vol.coverUrl}
                          alt={vol.title ?? `Tome ${vol.volume_number}`}
                          className="h-full w-full object-cover group-hover:scale-105 transition-transform duration-300"
                        />
                      ) : (
                        <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-pink-400 to-pink-600 text-2xl font-bold text-white">
                          {vol.volume_number}
                        </div>
                      )}
                    </div>
                    <div className="p-1.5">
                      <p className="text-[11px] font-semibold">Tome {vol.volume_number}</p>
                      {vol.title && <p className="text-[10px] text-muted-foreground line-clamp-1">{vol.title}</p>}
                    </div>
                  </button>

                  {/* Quick status toggle */}
                  <div className="flex border-t">
                    <button
                      onClick={() => setSingleStatus(vol.volume_number, status === 'backlog' ? 'clear' : 'backlog')}
                      className={cn(
                        'flex-1 py-1 text-[10px] font-medium transition-colors',
                        status === 'backlog'
                          ? 'bg-amber-100 dark:bg-amber-950 text-amber-700 dark:text-amber-300'
                          : 'hover:bg-muted text-muted-foreground'
                      )}
                      title="À lire"
                    >
                      📚
                    </button>
                    <button
                      onClick={() => setSingleStatus(vol.volume_number, status === 'completed' ? 'clear' : 'completed')}
                      className={cn(
                        'flex-1 py-1 text-[10px] font-medium border-l transition-colors',
                        status === 'completed'
                          ? 'bg-green-100 dark:bg-green-950 text-green-700 dark:text-green-300'
                          : 'hover:bg-muted text-muted-foreground'
                      )}
                      title="Terminé"
                    >
                      ✓
                    </button>
                  </div>
                </div>
              )
            })}
          </div>
        </>
      )}

      {/* Volume detail modal */}
      {modalVolume && (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center bg-black/70 p-4"
          onClick={() => setModalVolume(null)}
        >
          <div
            className="relative w-full max-w-sm rounded-2xl bg-background shadow-2xl overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              onClick={() => setModalVolume(null)}
              className="absolute right-3 top-3 z-10 rounded-full bg-black/20 p-1.5 text-white hover:bg-black/40 transition-colors"
            >
              <X className="h-4 w-4" />
            </button>

            <div className="flex gap-4 p-4">
              {/* Cover */}
              <div className="h-32 w-24 shrink-0 overflow-hidden rounded-lg bg-muted">
                {modalVolume.coverUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={modalVolume.coverUrl}
                    alt={modalVolume.title ?? `Tome ${modalVolume.volume_number}`}
                    className="h-full w-full object-cover"
                  />
                ) : (
                  <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-pink-400 to-pink-600 text-3xl font-bold text-white">
                    {modalVolume.volume_number}
                  </div>
                )}
              </div>

              {/* Info */}
              <div className="flex flex-1 flex-col gap-2">
                <div>
                  <p className="text-xs text-muted-foreground">Tome {modalVolume.volume_number}</p>
                  {modalVolume.title && (
                    <p className="font-semibold leading-snug">{modalVolume.title}</p>
                  )}
                </div>

                {modalVolume.status && (
                  <span className={cn(
                    'inline-flex w-fit items-center rounded-full px-2.5 py-0.5 text-xs font-medium',
                    modalVolume.status === 'completed'
                      ? 'bg-green-100 dark:bg-green-950 text-green-700 dark:text-green-300'
                      : 'bg-amber-100 dark:bg-amber-950 text-amber-700 dark:text-amber-300'
                  )}>
                    {modalVolume.status === 'completed' ? 'Lu' : 'À lire'}
                  </span>
                )}

                <div className="flex flex-col gap-1.5 mt-auto">
                  <button
                    onClick={() => {
                      const newStatus: VolumeStatus = 'backlog'
                      setSingleStatus(modalVolume.volume_number, modalVolume.status === 'backlog' ? 'clear' : newStatus)
                      setModalVolume((prev) => prev ? { ...prev, status: prev.status === 'backlog' ? undefined : 'backlog' } : null)
                    }}
                    className={cn(
                      'rounded-lg border px-3 py-1.5 text-sm font-medium transition-colors',
                      modalVolume.status === 'backlog'
                        ? 'border-amber-300 bg-amber-100 dark:bg-amber-950 text-amber-700 dark:text-amber-300'
                        : 'hover:bg-muted'
                    )}
                  >
                    📚 À lire
                  </button>
                  <button
                    onClick={() => {
                      const newStatus: VolumeStatus = 'completed'
                      setSingleStatus(modalVolume.volume_number, modalVolume.status === 'completed' ? 'clear' : newStatus)
                      setModalVolume((prev) => prev ? { ...prev, status: prev.status === 'completed' ? undefined : 'completed' } : null)
                    }}
                    className={cn(
                      'rounded-lg border px-3 py-1.5 text-sm font-medium transition-colors',
                      modalVolume.status === 'completed'
                        ? 'border-green-300 bg-green-100 dark:bg-green-950 text-green-700 dark:text-green-300'
                        : 'hover:bg-muted'
                    )}
                  >
                    ✓ Terminé
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
