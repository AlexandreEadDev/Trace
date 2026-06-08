'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { BookOpen, Check, Clock, Loader2, RotateCcw, Star, X } from 'lucide-react'
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

interface VolumeProgress {
  status?: VolumeStatus
  rating?: number | null
}

type ProgressMap = Record<number, VolumeProgress>

function formatRating(rating: number): string {
  return Number.isInteger(rating) ? String(rating) : rating.toFixed(1)
}

function scoreClasses(score: number | null): string {
  if (score == null) return 'bg-muted/60 text-muted-foreground'
  if (score >= 9) return 'bg-green-200 text-green-900 dark:bg-green-900/60 dark:text-green-100'
  if (score >= 8) return 'bg-green-100 text-green-800 dark:bg-green-950 dark:text-green-300'
  if (score >= 7) return 'bg-violet-100 text-violet-800 dark:bg-violet-950 dark:text-violet-300'
  if (score >= 6) return 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300'
  return 'bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-300'
}

function statusClasses(status?: VolumeStatus, hasRating?: boolean): string {
  if (hasRating) return ''
  if (status === 'completed') return 'bg-green-100 text-green-800 dark:bg-green-950 dark:text-green-300'
  if (status === 'backlog') return 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300'
  return 'bg-muted/60 text-muted-foreground'
}

function VolumeStars({
  value,
  onChange,
}: {
  value: number
  onChange: (v: number) => void
}) {
  const [hovered, setHovered] = useState(0)
  const display = hovered || value

  return (
    <div className="flex items-center gap-0.5">
      {[1, 2, 3, 4, 5].map((s) => {
        const full = s <= Math.floor(display)
        const half = !full && s === Math.ceil(display) && display % 1 === 0.5
        return (
          <button
            key={s}
            type="button"
            className="relative h-7 w-7"
            onMouseLeave={() => setHovered(0)}
            onMouseEnter={() => setHovered(s)}
            onClick={() => onChange(s === value ? 0 : s)}
          >
            <Star className="h-7 w-7 fill-muted text-muted-foreground" />
            {(full || half) && (
              <div className={cn('absolute inset-0 overflow-hidden', half ? 'w-1/2' : 'w-full')}>
                <Star className="h-7 w-7 fill-violet-500 text-violet-500" />
              </div>
            )}
          </button>
        )
      })}
      {value > 0 && (
        <span className="ml-1 text-xs font-medium text-violet-600">{value}/5</span>
      )}
    </div>
  )
}

export function MangaVolumeList({
  mangaItemId,
  mangaExternalId,
  mangaCoverUrl,
  totalVolumes,
  totalChapters,
}: MangaVolumeListProps) {
  const [volumes, setVolumes] = useState<VolumeInfo[]>([])
  const [progress, setProgress] = useState<ProgressMap>({})
  const [loading, setLoading] = useState(true)
  const [modalVol, setModalVol] = useState<VolumeInfo | null>(null)
  const [modalRating, setModalRating] = useState(0)
  const [modalStatus, setModalStatus] = useState<VolumeStatus | undefined>()
  const [saving, setSaving] = useState(false)
  const [bulkLoading, setBulkLoading] = useState(false)

  const sortedVolumes = useMemo(
    () => [...volumes].sort((a, b) => a.volume_number - b.volume_number),
    [volumes],
  )

  const gridCols = `3.5rem repeat(${sortedVolumes.length}, 2.25rem)`

  const volumeRangeLabel = useMemo(() => {
    if (sortedVolumes.length === 0) return ''
    const first = sortedVolumes[0].volume_number
    const last = sortedVolumes[sortedVolumes.length - 1].volume_number
    return first === last ? `T${first}` : `T${first}–${last}`
  }, [sortedVolumes])

  const fetchVolumes = useCallback(async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams({ external_id: mangaExternalId })
      if (totalVolumes != null) params.set('total', String(totalVolumes))
      if (totalChapters != null) params.set('chapters', String(totalChapters))
      if (mangaCoverUrl) params.set('fallback_cover', mangaCoverUrl)
      const res = await fetch(`/api/manga/volumes/list?${params}`)
      if (res.ok) setVolumes(await res.json())
    } catch {
      // keep empty
    }
    setLoading(false)
  }, [mangaExternalId, totalVolumes, totalChapters, mangaCoverUrl])

  const fetchProgress = useCallback(async () => {
    try {
      const res = await fetch(`/api/manga/volumes?manga_item_id=${mangaItemId}`)
      if (!res.ok) return
      const rows: { volume_number: number; status: VolumeStatus; rating: number | null }[] = await res.json()
      const map: ProgressMap = {}
      for (const r of rows) {
        map[r.volume_number] = { status: r.status, rating: r.rating }
      }
      setProgress(map)
    } catch {
      // not logged in
    }
  }, [mangaItemId])

  useEffect(() => {
    fetchVolumes()
    fetchProgress()
  }, [fetchVolumes, fetchProgress])

  const avgUserRating = useMemo(() => {
    const rated = Object.values(progress).filter((p) => p.rating && p.rating > 0)
    if (rated.length === 0) return null
    return rated.reduce((s, p) => s + (p.rating ?? 0), 0) / rated.length
  }, [progress])

  const rankedVolumes = useMemo(() => {
    return sortedVolumes
      .filter((v) => {
        const r = progress[v.volume_number]?.rating
        return r != null && r > 0
      })
      .map((v) => ({ vol: v, score: progress[v.volume_number]!.rating! }))
  }, [sortedVolumes, progress])

  const highestRated = useMemo(
    () => [...rankedVolumes].sort((a, b) => b.score - a.score).slice(0, 3),
    [rankedVolumes],
  )

  const lowestRated = useMemo(
    () => [...rankedVolumes].sort((a, b) => a.score - b.score).slice(0, 3),
    [rankedVolumes],
  )

  const readCount = sortedVolumes.filter(
    (v) => progress[v.volume_number]?.status === 'completed',
  ).length

  const backlogCount = sortedVolumes.filter(
    (v) => progress[v.volume_number]?.status === 'backlog',
  ).length

  const openModal = (vol: VolumeInfo) => {
    const p = progress[vol.volume_number]
    setModalVol(vol)
    setModalRating(p?.rating ?? 0)
    setModalStatus(p?.status)
  }

  const bulkSetStatus = async (vols: VolumeInfo[], status: VolumeStatus | 'clear') => {
    if (vols.length === 0) return
    setBulkLoading(true)
    try {
      if (status === 'clear') {
        const res = await fetch('/api/manga/volumes', {
          method: 'DELETE',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            manga_item_id: mangaItemId,
            total_volumes: sortedVolumes.length,
            volume_numbers: vols.map((v) => v.volume_number),
          }),
        })
        if (!res.ok) return
      } else {
        const res = await fetch('/api/manga/volumes', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            manga_item_id: mangaItemId,
            total_volumes: sortedVolumes.length,
            volumes: vols.map((v) => {
              const existing = progress[v.volume_number]
              return {
                volume_number: v.volume_number,
                status,
                rating: existing?.rating ?? null,
              }
            }),
          }),
        })
        if (!res.ok) return
      }
      await fetchProgress()
    } finally {
      setBulkLoading(false)
    }
  }

  const saveVolume = async (
    vol: VolumeInfo,
    status: VolumeStatus | 'clear',
    rating?: number,
  ) => {
    setSaving(true)
    try {
      if (status === 'clear' && (!rating || rating === 0)) {
        await fetch('/api/manga/volumes', {
          method: 'DELETE',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            manga_item_id: mangaItemId,
            total_volumes: sortedVolumes.length,
            volume_number: vol.volume_number,
          }),
        })
        setProgress((prev) => {
          const next = { ...prev }
          delete next[vol.volume_number]
          return next
        })
      } else {
        await fetch('/api/manga/volumes', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            manga_item_id: mangaItemId,
            total_volumes: sortedVolumes.length,
            volume_number: vol.volume_number,
            status: status === 'clear' ? 'completed' : status,
            rating: rating && rating > 0 ? rating : null,
          }),
        })
        setProgress((prev) => ({
          ...prev,
          [vol.volume_number]: {
            status: status === 'clear' ? undefined : status,
            rating: rating && rating > 0 ? rating : null,
          },
        }))
      }
      await fetchProgress()
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return (
      <div className="flex items-center gap-2 text-sm text-muted-foreground py-4">
        <Loader2 className="h-4 w-4 animate-spin" />
        Chargement des tomes…
      </div>
    )
  }

  if (volumes.length === 0) return null

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-base font-semibold flex items-center gap-2">
          <BookOpen className="h-4 w-4" />
          Tomes ({sortedVolumes.length})
        </h2>
        <div className="flex flex-wrap items-center gap-2 text-xs">
          {avgUserRating != null && (
            <span className="rounded-full bg-violet-100 dark:bg-violet-950 px-2.5 py-0.5 font-medium text-violet-700 dark:text-violet-300">
              Tes notes · {formatRating(avgUserRating)}/5
            </span>
          )}
          {readCount > 0 && (
            <span className="rounded-full bg-green-100 dark:bg-green-950 px-2.5 py-0.5 font-medium text-green-700 dark:text-green-300">
              {readCount} lu{readCount > 1 ? 's' : ''}
            </span>
          )}
          {backlogCount > 0 && (
            <span className="rounded-full bg-amber-100 dark:bg-amber-950 px-2.5 py-0.5 font-medium text-amber-700 dark:text-amber-300">
              {backlogCount} à lire
            </span>
          )}
        </div>
      </div>

      {(highestRated.length > 0 || lowestRated.length > 0) && rankedVolumes.length > 3 && (
        <div className="grid gap-3 sm:grid-cols-2">
          {highestRated.length > 0 && (
            <div className="rounded-xl border bg-card p-3 space-y-2">
              <p className="text-xs font-semibold text-muted-foreground">Tes mieux notés</p>
              <ul className="space-y-1.5">
                {highestRated.map(({ vol, score }) => (
                  <li key={vol.volume_number}>
                    <button
                      type="button"
                      onClick={() => openModal(vol)}
                      className="flex w-full items-center gap-2 text-left text-sm hover:text-violet-600 transition-colors"
                    >
                      <span className="shrink-0 rounded-md bg-green-100 dark:bg-green-950 px-1.5 py-0.5 text-xs font-bold text-green-700 dark:text-green-300 tabular-nums">
                        {formatRating(score)}
                      </span>
                      <span className="truncate">
                        Tome {vol.volume_number}{vol.title ? ` · ${vol.title}` : ''}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}
          {lowestRated.length > 0 && (
            <div className="rounded-xl border bg-card p-3 space-y-2">
              <p className="text-xs font-semibold text-muted-foreground">Tes moins bien notés</p>
              <ul className="space-y-1.5">
                {lowestRated.map(({ vol, score }) => (
                  <li key={vol.volume_number}>
                    <button
                      type="button"
                      onClick={() => openModal(vol)}
                      className="flex w-full items-center gap-2 text-left text-sm hover:text-violet-600 transition-colors"
                    >
                      <span className="shrink-0 rounded-md bg-amber-100 dark:bg-amber-950 px-1.5 py-0.5 text-xs font-bold text-amber-700 dark:text-amber-300 tabular-nums">
                        {formatRating(score)}
                      </span>
                      <span className="truncate">
                        Tome {vol.volume_number}{vol.title ? ` · ${vol.title}` : ''}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}

      <div className="rounded-xl border bg-card p-4 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Notes par tome
          </p>
          {sortedVolumes.length > 1 && (
            <div className="flex flex-wrap items-center gap-1.5">
              <button
                type="button"
                disabled={bulkLoading}
                onClick={() => bulkSetStatus(sortedVolumes, 'backlog')}
                className="rounded-lg border border-amber-200 bg-amber-50 dark:bg-amber-950 px-2 py-0.5 text-[11px] font-medium text-amber-700 dark:text-amber-300 transition-colors hover:bg-amber-100 dark:hover:bg-amber-900 disabled:opacity-50"
                title="Marquer tous les tomes à lire"
              >
                Tout à lire
              </button>
              <button
                type="button"
                disabled={bulkLoading}
                onClick={() => bulkSetStatus(sortedVolumes, 'completed')}
                className="rounded-lg border border-green-200 bg-green-50 dark:bg-green-950 px-2 py-0.5 text-[11px] font-medium text-green-700 dark:text-green-300 transition-colors hover:bg-green-100 dark:hover:bg-green-900 disabled:opacity-50"
                title="Marquer tous les tomes comme lus"
              >
                Tout lu
              </button>
              <button
                type="button"
                disabled={bulkLoading}
                onClick={() => bulkSetStatus(sortedVolumes, 'clear')}
                className="rounded-lg border px-2 py-0.5 text-[11px] font-medium text-muted-foreground transition-colors hover:bg-muted disabled:opacity-50"
                title="Effacer le suivi de tous les tomes"
              >
                Effacer
              </button>
              {bulkLoading && <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />}
            </div>
          )}
        </div>

        <div className="overflow-x-auto -mx-1 px-1 pb-1">
          <div className="inline-block min-w-full">
            <div
              className="grid gap-0.5 mb-0.5"
              style={{ gridTemplateColumns: gridCols }}
            >
              <div />
              {sortedVolumes.map((vol) => (
                <div
                  key={vol.volume_number}
                  className="flex h-5 items-center justify-center text-[10px] font-medium text-muted-foreground tabular-nums"
                >
                  {vol.volume_number}
                </div>
              ))}
            </div>

            <div
              className="grid gap-0.5 mb-0.5"
              style={{ gridTemplateColumns: gridCols }}
            >
              <div className="flex flex-col items-center justify-center gap-0.5">
                <span
                  className="text-[9px] font-semibold text-muted-foreground leading-none text-center"
                  title={volumeRangeLabel}
                >
                  {volumeRangeLabel}
                </span>
                <div className="flex gap-0.5">
                  <button
                    type="button"
                    disabled={bulkLoading}
                    onClick={() => bulkSetStatus(sortedVolumes, 'backlog')}
                    title={`${volumeRangeLabel} — tout à lire`}
                    className="flex h-[18px] w-[18px] items-center justify-center rounded-sm border border-amber-200 bg-amber-50 text-amber-700 transition-colors hover:bg-amber-100 disabled:opacity-50 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-300 dark:hover:bg-amber-900"
                  >
                    <Clock className="h-2.5 w-2.5" />
                  </button>
                  <button
                    type="button"
                    disabled={bulkLoading}
                    onClick={() => bulkSetStatus(sortedVolumes, 'completed')}
                    title={`${volumeRangeLabel} — tout lu`}
                    className="flex h-[18px] w-[18px] items-center justify-center rounded-sm border border-green-200 bg-green-50 text-green-700 transition-colors hover:bg-green-100 disabled:opacity-50 dark:border-green-800 dark:bg-green-950 dark:text-green-300 dark:hover:bg-green-900"
                  >
                    <Check className="h-2.5 w-2.5" />
                  </button>
                  <button
                    type="button"
                    disabled={bulkLoading}
                    onClick={() => bulkSetStatus(sortedVolumes, 'clear')}
                    title={`${volumeRangeLabel} — effacer`}
                    className="flex h-[18px] w-[18px] items-center justify-center rounded-sm border text-muted-foreground transition-colors hover:bg-muted disabled:opacity-50"
                  >
                    <RotateCcw className="h-2.5 w-2.5" />
                  </button>
                </div>
              </div>

              {sortedVolumes.map((vol) => {
                const p = progress[vol.volume_number]
                const rating = p?.rating != null && p.rating > 0 ? p.rating : null
                const isRead = p?.status === 'completed'
                const isBacklog = p?.status === 'backlog'
                const displayScore = rating != null ? rating * 2 : null

                return (
                  <button
                    key={vol.volume_number}
                    type="button"
                    title={vol.title ?? `Tome ${vol.volume_number}`}
                    onClick={() => openModal(vol)}
                    className={cn(
                      'relative flex h-9 w-9 items-center justify-center rounded-md border text-[10px] font-semibold tabular-nums transition-all',
                      'hover:-translate-y-0.5 hover:shadow-sm focus:outline-none focus:ring-2 focus:ring-violet-500',
                      rating != null ? scoreClasses(displayScore) : statusClasses(p?.status, false),
                      isRead && 'border-green-400 dark:border-green-600',
                      isBacklog && 'border-amber-400 dark:border-amber-600',
                      !isRead && !isBacklog && 'border-transparent',
                    )}
                  >
                    {rating != null ? formatRating(rating) : '-'}
                    {rating != null && (
                      <Star className="absolute right-0.5 top-0.5 h-2 w-2 fill-violet-500 text-violet-500" />
                    )}
                  </button>
                )
              })}
            </div>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2 pt-1 border-t text-[10px] text-muted-foreground">
          <span>Tes notes /5</span>
          <span className="text-muted-foreground/40">·</span>
          <span className="flex items-center gap-1">
            <span className="inline-block h-3 w-3 rounded-sm bg-green-100 dark:bg-green-950 border" /> ≥4
          </span>
          <span className="flex items-center gap-1">
            <span className="inline-block h-3 w-3 rounded-sm bg-amber-100 dark:bg-amber-950 border" /> 3
          </span>
          <span className="flex items-center gap-1">
            <span className="inline-block h-3 w-3 rounded-sm bg-red-100 dark:bg-red-950 border" /> &lt;3
          </span>
          <span className="text-muted-foreground/40 hidden sm:inline">·</span>
          <span className="hidden sm:inline">Clic sur un tome pour détail · icônes à gauche = actions sur tous les tomes</span>
        </div>
      </div>

      {modalVol && (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center bg-black/70 p-4"
          onClick={() => setModalVol(null)}
        >
          <div
            className="relative w-full max-w-md rounded-2xl bg-background border shadow-2xl overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              type="button"
              onClick={() => setModalVol(null)}
              className="absolute right-3 top-3 z-10 rounded-full bg-black/20 p-1.5 text-white hover:bg-black/40"
            >
              <X className="h-4 w-4" />
            </button>

            <div className="flex gap-4 p-5">
              <div className="h-36 w-24 shrink-0 overflow-hidden rounded-lg border bg-muted">
                {modalVol.coverUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={modalVol.coverUrl}
                    alt={modalVol.title ?? `Tome ${modalVol.volume_number}`}
                    className="h-full w-full object-cover"
                  />
                ) : mangaCoverUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={mangaCoverUrl} alt="" className="h-full w-full object-cover opacity-80" />
                ) : (
                  <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-violet-400 to-violet-600 text-3xl font-bold text-white">
                    {modalVol.volume_number}
                  </div>
                )}
              </div>

              <div className="flex flex-1 flex-col gap-3 min-w-0">
                <div>
                  <p className="text-xs text-muted-foreground">Tome {modalVol.volume_number}</p>
                  <p className="text-lg font-semibold leading-snug truncate">
                    {modalVol.title ?? `Tome ${modalVol.volume_number}`}
                  </p>
                </div>

                <div className="space-y-2">
                  <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Ta note</p>
                  <VolumeStars value={modalRating} onChange={setModalRating} />
                </div>

                <div className="flex flex-col gap-2 mt-auto">
                  <button
                    type="button"
                    disabled={saving}
                    onClick={async () => {
                      const next = modalStatus === 'backlog' ? 'clear' : 'backlog'
                      await saveVolume(modalVol, next, modalRating)
                      setModalStatus(next === 'clear' ? undefined : 'backlog')
                    }}
                    className={cn(
                      'rounded-lg border px-3 py-2 text-sm font-medium transition-colors',
                      modalStatus === 'backlog'
                        ? 'border-amber-300 bg-amber-100 dark:bg-amber-950 text-amber-700'
                        : 'hover:bg-muted',
                    )}
                  >
                    À lire
                  </button>
                  <button
                    type="button"
                    disabled={saving}
                    onClick={async () => {
                      const next = modalStatus === 'completed' ? 'clear' : 'completed'
                      await saveVolume(modalVol, next, modalRating)
                      setModalStatus(next === 'clear' ? undefined : 'completed')
                    }}
                    className={cn(
                      'rounded-lg border px-3 py-2 text-sm font-medium transition-colors',
                      modalStatus === 'completed'
                        ? 'border-green-300 bg-green-100 dark:bg-green-950 text-green-700'
                        : 'hover:bg-muted',
                    )}
                  >
                    Lu
                  </button>
                  <button
                    type="button"
                    disabled={saving}
                    onClick={async () => {
                      await saveVolume(modalVol, modalStatus ?? 'completed', modalRating)
                      setModalVol(null)
                    }}
                    className="rounded-lg bg-violet-600 px-3 py-2 text-sm font-semibold text-white hover:bg-violet-700 disabled:opacity-60"
                  >
                    {saving ? 'Enregistrement…' : 'Enregistrer'}
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
