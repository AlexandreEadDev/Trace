'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { Check, Clapperboard, Clock, Loader2, RotateCcw, Star, X } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { EpisodeInfo, SeasonInfo } from '@/lib/catalog/tmdb-tv'

interface TvEpisodeListProps {
  showItemId: string
  showExternalId: string
  seriesTmdbScore?: number | null
  seriesTmdbVotes?: number | null
}

type EpisodeStatus = 'backlog' | 'completed'

interface EpisodeProgress {
  status?: EpisodeStatus
  rating?: number | null
}

type ProgressKey = string
type ProgressMap = Record<ProgressKey, EpisodeProgress>

function epKey(season: number, episode: number): ProgressKey {
  return `${season}-${episode}`
}

function formatScore(score: number): string {
  return Number.isInteger(score) ? String(score) : score.toFixed(1)
}

function episodeLabel(ep: EpisodeInfo): string {
  return `S${ep.season_number}E${ep.episode_number}`
}

/** Pastel heatmap classes aligned with Trace (light + dark). */
function scoreClasses(score: number | null): string {
  if (score == null) return 'bg-muted/60 text-muted-foreground'
  if (score >= 9) return 'bg-green-200 text-green-900 dark:bg-green-900/60 dark:text-green-100'
  if (score >= 8) return 'bg-green-100 text-green-800 dark:bg-green-950 dark:text-green-300'
  if (score >= 7) return 'bg-teal-100 text-teal-800 dark:bg-teal-950 dark:text-teal-300'
  if (score >= 6) return 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300'
  return 'bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-300'
}

function EpisodeStars({
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
                <Star className="h-7 w-7 fill-teal-500 text-teal-500" />
              </div>
            )}
          </button>
        )
      })}
      {value > 0 && (
        <span className="ml-1 text-xs font-medium text-teal-600">{value}/5</span>
      )}
    </div>
  )
}

export function TvEpisodeList({
  showItemId,
  showExternalId,
  seriesTmdbScore,
  seriesTmdbVotes,
}: TvEpisodeListProps) {
  const [seasons, setSeasons] = useState<SeasonInfo[]>([])
  const [progress, setProgress] = useState<ProgressMap>({})
  const [loading, setLoading] = useState(true)
  const [modalEp, setModalEp] = useState<EpisodeInfo | null>(null)
  const [modalRating, setModalRating] = useState(0)
  const [modalStatus, setModalStatus] = useState<EpisodeStatus | undefined>()
  const [saving, setSaving] = useState(false)
  const [bulkLoading, setBulkLoading] = useState(false)

  const allEpisodes = useMemo(
    () => seasons.flatMap((s) => s.episodes),
    [seasons],
  )

  const episodeMap = useMemo(() => {
    const map = new Map<ProgressKey, EpisodeInfo>()
    for (const ep of allEpisodes) {
      map.set(epKey(ep.season_number, ep.episode_number), ep)
    }
    return map
  }, [allEpisodes])

  const maxEpisode = useMemo(
    () => allEpisodes.reduce((m, e) => Math.max(m, e.episode_number), 0),
    [allEpisodes],
  )

  const displaySeasons = useMemo(
    () => seasons.filter((s) => s.episodes.length > 0).sort((a, b) => a.season_number - b.season_number),
    [seasons],
  )

  const gridCols = `3.5rem repeat(${maxEpisode}, 2.25rem)`

  const fetchCatalog = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch(`/api/tv/episodes/list?external_id=${showExternalId}`)
      if (res.ok) setSeasons(await res.json())
    } catch {
      // keep empty
    }
    setLoading(false)
  }, [showExternalId])

  const fetchProgress = useCallback(async () => {
    try {
      const res = await fetch(`/api/tv/episodes?show_item_id=${showItemId}`)
      if (!res.ok) return
      const rows: {
        season_number: number
        episode_number: number
        status: EpisodeStatus
        rating: number | null
      }[] = await res.json()
      const map: ProgressMap = {}
      for (const r of rows) {
        map[epKey(r.season_number, r.episode_number)] = {
          status: r.status,
          rating: r.rating,
        }
      }
      setProgress(map)
    } catch {
      // not logged in
    }
  }, [showItemId])

  useEffect(() => {
    fetchCatalog()
    fetchProgress()
  }, [fetchCatalog, fetchProgress])

  const avgEpisodeScore = useMemo(() => {
    const rated = allEpisodes.filter((e) => e.tmdbRating != null)
    if (rated.length === 0) return seriesTmdbScore ?? null
    return rated.reduce((s, e) => s + (e.tmdbRating ?? 0), 0) / rated.length
  }, [allEpisodes, seriesTmdbScore])

  const rankedEpisodes = useMemo(() => {
    return allEpisodes
      .filter((e) => e.tmdbRating != null)
      .map((e) => ({ ep: e, score: e.tmdbRating! }))
  }, [allEpisodes])

  const highestRated = useMemo(
    () => [...rankedEpisodes].sort((a, b) => b.score - a.score).slice(0, 3),
    [rankedEpisodes],
  )

  const lowestRated = useMemo(
    () => [...rankedEpisodes].sort((a, b) => a.score - b.score).slice(0, 3),
    [rankedEpisodes],
  )

  const watchedCount = allEpisodes.filter(
    (e) => progress[epKey(e.season_number, e.episode_number)]?.status === 'completed',
  ).length

  const backlogCount = allEpisodes.filter(
    (e) => progress[epKey(e.season_number, e.episode_number)]?.status === 'backlog',
  ).length

  const openModal = (ep: EpisodeInfo) => {
    const key = epKey(ep.season_number, ep.episode_number)
    const p = progress[key]
    setModalEp(ep)
    setModalRating(p?.rating ?? 0)
    setModalStatus(p?.status)
  }

  const bulkSetStatus = async (episodes: EpisodeInfo[], status: EpisodeStatus | 'clear') => {
    if (episodes.length === 0) return
    setBulkLoading(true)
    try {
      if (status === 'clear') {
        const res = await fetch('/api/tv/episodes', {
          method: 'DELETE',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            show_item_id: showItemId,
            total_episodes: allEpisodes.length,
            episodes: episodes.map((ep) => ({
              season_number: ep.season_number,
              episode_number: ep.episode_number,
            })),
          }),
        })
        if (!res.ok) return
      } else {
        const res = await fetch('/api/tv/episodes', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            show_item_id: showItemId,
            total_episodes: allEpisodes.length,
            episodes: episodes.map((ep) => {
              const key = epKey(ep.season_number, ep.episode_number)
              const existing = progress[key]
              return {
                season_number: ep.season_number,
                episode_number: ep.episode_number,
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

  const seasonLabel = (seasonNumber: number) =>
    seasonNumber === 0 ? 'Spéciaux' : `Saison ${seasonNumber}`

  const saveEpisode = async (
    ep: EpisodeInfo,
    status: EpisodeStatus | 'clear',
    rating?: number,
  ) => {
    setSaving(true)
    try {
      if (status === 'clear' && (!rating || rating === 0)) {
        await fetch('/api/tv/episodes', {
          method: 'DELETE',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            show_item_id: showItemId,
            total_episodes: allEpisodes.length,
            season_number: ep.season_number,
            episode_number: ep.episode_number,
          }),
        })
        setProgress((prev) => {
          const next = { ...prev }
          delete next[epKey(ep.season_number, ep.episode_number)]
          return next
        })
      } else {
        await fetch('/api/tv/episodes', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            show_item_id: showItemId,
            total_episodes: allEpisodes.length,
            season_number: ep.season_number,
            episode_number: ep.episode_number,
            status: status === 'clear' ? 'completed' : status,
            rating: rating && rating > 0 ? rating : null,
          }),
        })
        setProgress((prev) => ({
          ...prev,
          [epKey(ep.season_number, ep.episode_number)]: {
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
        Chargement des épisodes…
      </div>
    )
  }

  if (seasons.length === 0) return null

  return (
    <div className="space-y-4">
      {/* Header — same pattern as MangaVolumeList */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-base font-semibold flex items-center gap-2">
          <Clapperboard className="h-4 w-4" />
          Épisodes ({allEpisodes.length})
        </h2>
        <div className="flex flex-wrap items-center gap-2 text-xs">
          {avgEpisodeScore != null && (
            <span className="rounded-full bg-teal-100 dark:bg-teal-950 px-2.5 py-0.5 font-medium text-teal-700 dark:text-teal-300">
              Moyenne · {formatScore(avgEpisodeScore)}/10
            </span>
          )}
          {seriesTmdbVotes != null && seriesTmdbVotes > 0 && (
            <span className="rounded-full bg-muted px-2.5 py-0.5 font-medium text-muted-foreground">
              {seriesTmdbVotes.toLocaleString('fr-FR')} votes
            </span>
          )}
          {watchedCount > 0 && (
            <span className="rounded-full bg-green-100 dark:bg-green-950 px-2.5 py-0.5 font-medium text-green-700 dark:text-green-300">
              {watchedCount} vu{watchedCount > 1 ? 's' : ''}
            </span>
          )}
          {backlogCount > 0 && (
            <span className="rounded-full bg-amber-100 dark:bg-amber-950 px-2.5 py-0.5 font-medium text-amber-700 dark:text-amber-300">
              {backlogCount} à voir
            </span>
          )}
        </div>
      </div>

      {/* Highlights */}
      {(highestRated.length > 0 || lowestRated.length > 0) && rankedEpisodes.length > 3 && (
        <div className="grid gap-3 sm:grid-cols-2">
          {highestRated.length > 0 && (
            <div className="rounded-xl border bg-card p-3 space-y-2">
              <p className="text-xs font-semibold text-muted-foreground">Mieux notés</p>
              <ul className="space-y-1.5">
                {highestRated.map(({ ep, score }) => (
                  <li key={epKey(ep.season_number, ep.episode_number)}>
                    <button
                      type="button"
                      onClick={() => openModal(ep)}
                      className="flex w-full items-center gap-2 text-left text-sm hover:text-teal-600 transition-colors"
                    >
                      <span className="shrink-0 rounded-md bg-green-100 dark:bg-green-950 px-1.5 py-0.5 text-xs font-bold text-green-700 dark:text-green-300 tabular-nums">
                        {formatScore(score)}
                      </span>
                      <span className="truncate">{ep.title ?? episodeLabel(ep)}</span>
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}
          {lowestRated.length > 0 && (
            <div className="rounded-xl border bg-card p-3 space-y-2">
              <p className="text-xs font-semibold text-muted-foreground">Moins bien notés</p>
              <ul className="space-y-1.5">
                {lowestRated.map(({ ep, score }) => (
                  <li key={epKey(ep.season_number, ep.episode_number)}>
                    <button
                      type="button"
                      onClick={() => openModal(ep)}
                      className="flex w-full items-center gap-2 text-left text-sm hover:text-teal-600 transition-colors"
                    >
                      <span className="shrink-0 rounded-md bg-amber-100 dark:bg-amber-950 px-1.5 py-0.5 text-xs font-bold text-amber-700 dark:text-amber-300 tabular-nums">
                        {formatScore(score)}
                      </span>
                      <span className="truncate">{ep.title ?? episodeLabel(ep)}</span>
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}

      {/* Rating grid */}
      <div className="rounded-xl border bg-card p-4 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Notes par épisode
          </p>
          {allEpisodes.length > 1 && (
            <div className="flex flex-wrap items-center gap-1.5">
              <button
                type="button"
                disabled={bulkLoading}
                onClick={() => bulkSetStatus(allEpisodes, 'backlog')}
                className="rounded-lg border border-amber-200 bg-amber-50 dark:bg-amber-950 px-2 py-0.5 text-[11px] font-medium text-amber-700 dark:text-amber-300 transition-colors hover:bg-amber-100 dark:hover:bg-amber-900 disabled:opacity-50"
                title="Marquer toute la série à voir"
              >
                Tout à voir
              </button>
              <button
                type="button"
                disabled={bulkLoading}
                onClick={() => bulkSetStatus(allEpisodes, 'completed')}
                className="rounded-lg border border-green-200 bg-green-50 dark:bg-green-950 px-2 py-0.5 text-[11px] font-medium text-green-700 dark:text-green-300 transition-colors hover:bg-green-100 dark:hover:bg-green-900 disabled:opacity-50"
                title="Marquer toute la série comme vue"
              >
                Tout vu
              </button>
              <button
                type="button"
                disabled={bulkLoading}
                onClick={() => bulkSetStatus(allEpisodes, 'clear')}
                className="rounded-lg border px-2 py-0.5 text-[11px] font-medium text-muted-foreground transition-colors hover:bg-muted disabled:opacity-50"
                title="Effacer le suivi de toute la série"
              >
                Effacer
              </button>
              {bulkLoading && <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />}
            </div>
          )}
        </div>

        <div className="overflow-x-auto -mx-1 px-1 pb-1">
          <div className="inline-block min-w-full">
            {/* Episode column headers */}
            <div
              className="grid gap-0.5 mb-0.5"
              style={{ gridTemplateColumns: gridCols }}
            >
              <div />
              {Array.from({ length: maxEpisode }, (_, i) => i + 1).map((n) => (
                <div
                  key={n}
                  className="flex h-5 items-center justify-center text-[10px] font-medium text-muted-foreground tabular-nums"
                >
                  {n}
                </div>
              ))}
            </div>

            {/* Season rows */}
            {displaySeasons.map((season) => (
              <div
                key={season.season_number}
                className="grid gap-0.5 mb-0.5"
                style={{ gridTemplateColumns: gridCols }}
              >
                <div className="flex flex-col items-center justify-center gap-0.5">
                  <span
                    className="text-[10px] font-semibold text-muted-foreground tabular-nums leading-none"
                    title={seasonLabel(season.season_number)}
                  >
                    {season.season_number === 0 ? 'Sp.' : `S${season.season_number}`}
                  </span>
                  {season.episodes.length > 0 && (
                    <div className="flex gap-0.5">
                      <button
                        type="button"
                        disabled={bulkLoading}
                        onClick={() => bulkSetStatus(season.episodes, 'backlog')}
                        title={`${seasonLabel(season.season_number)} — tout à voir`}
                        className="flex h-[18px] w-[18px] items-center justify-center rounded-sm border border-amber-200 bg-amber-50 text-amber-700 transition-colors hover:bg-amber-100 disabled:opacity-50 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-300 dark:hover:bg-amber-900"
                      >
                        <Clock className="h-2.5 w-2.5" />
                      </button>
                      <button
                        type="button"
                        disabled={bulkLoading}
                        onClick={() => bulkSetStatus(season.episodes, 'completed')}
                        title={`${seasonLabel(season.season_number)} — tout vu`}
                        className="flex h-[18px] w-[18px] items-center justify-center rounded-sm border border-green-200 bg-green-50 text-green-700 transition-colors hover:bg-green-100 disabled:opacity-50 dark:border-green-800 dark:bg-green-950 dark:text-green-300 dark:hover:bg-green-900"
                      >
                        <Check className="h-2.5 w-2.5" />
                      </button>
                      <button
                        type="button"
                        disabled={bulkLoading}
                        onClick={() => bulkSetStatus(season.episodes, 'clear')}
                        title={`${seasonLabel(season.season_number)} — effacer`}
                        className="flex h-[18px] w-[18px] items-center justify-center rounded-sm border text-muted-foreground transition-colors hover:bg-muted disabled:opacity-50"
                      >
                        <RotateCcw className="h-2.5 w-2.5" />
                      </button>
                    </div>
                  )}
                </div>

                {Array.from({ length: maxEpisode }, (_, i) => i + 1).map((epNum) => {
                  const ep = episodeMap.get(epKey(season.season_number, epNum))

                  if (!ep) {
                    return <div key={epNum} className="h-9 w-9 rounded-md bg-muted/30" />
                  }

                  const score = ep.tmdbRating
                  const p = progress[epKey(season.season_number, epNum)]
                  const isWatched = p?.status === 'completed'
                  const isBacklog = p?.status === 'backlog'
                  const hasUserRating = p?.rating != null && p.rating > 0

                  return (
                    <button
                      key={epNum}
                      type="button"
                      title={ep.title ?? `Épisode ${epNum}`}
                      onClick={() => openModal(ep)}
                      className={cn(
                        'relative flex h-9 w-9 items-center justify-center rounded-md border text-[10px] font-semibold tabular-nums transition-all',
                        'hover:-translate-y-0.5 hover:shadow-sm focus:outline-none focus:ring-2 focus:ring-teal-500',
                        scoreClasses(score),
                        isWatched && 'border-green-400 dark:border-green-600',
                        isBacklog && 'border-amber-400 dark:border-amber-600',
                        !isWatched && !isBacklog && 'border-transparent',
                      )}
                    >
                      {score != null ? formatScore(score) : '—'}
                      {hasUserRating && (
                        <Star className="absolute right-0.5 top-0.5 h-2 w-2 fill-teal-500 text-teal-500" />
                      )}
                    </button>
                  )
                })}
              </div>
            ))}
          </div>
        </div>

        {/* Legend */}
        <div className="flex flex-wrap items-center gap-2 pt-1 border-t text-[10px] text-muted-foreground">
          <span>Notes TMDB /10</span>
          <span className="text-muted-foreground/40">·</span>
          <span className="flex items-center gap-1">
            <span className="inline-block h-3 w-3 rounded-sm bg-green-100 dark:bg-green-950 border" /> ≥8
          </span>
          <span className="flex items-center gap-1">
            <span className="inline-block h-3 w-3 rounded-sm bg-amber-100 dark:bg-amber-950 border" /> 6–8
          </span>
          <span className="flex items-center gap-1">
            <span className="inline-block h-3 w-3 rounded-sm bg-red-100 dark:bg-red-950 border" /> &lt;6
          </span>
          <span className="text-muted-foreground/40 hidden sm:inline">·</span>
          <span className="hidden sm:inline">Clic sur un épisode pour détail · icônes à gauche = actions par saison</span>
        </div>
      </div>

      {modalEp && (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center bg-black/70 p-4"
          onClick={() => setModalEp(null)}
        >
          <div
            className="relative w-full max-w-md rounded-2xl bg-background border shadow-2xl overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              type="button"
              onClick={() => setModalEp(null)}
              className="absolute right-3 top-3 z-10 rounded-full bg-black/20 p-1.5 text-white hover:bg-black/40"
            >
              <X className="h-4 w-4" />
            </button>

            {modalEp.stillUrl && (
              <div className="aspect-video w-full bg-muted">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={modalEp.stillUrl} alt="" className="h-full w-full object-cover" />
              </div>
            )}

            <div className="p-5 space-y-4">
              <div>
                <p className="text-xs text-muted-foreground">
                  Saison {modalEp.season_number} · Épisode {modalEp.episode_number}
                </p>
                <p className="text-lg font-semibold leading-snug">
                  {modalEp.title ?? `Épisode ${modalEp.episode_number}`}
                </p>
                {modalEp.tmdbRating != null && (
                  <p className="text-sm text-muted-foreground mt-1">
                    Note TMDB · {formatScore(modalEp.tmdbRating)}/10
                  </p>
                )}
              </div>

              <div className="space-y-2">
                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Ta note</p>
                <EpisodeStars value={modalRating} onChange={setModalRating} />
              </div>

              <div className="flex flex-col gap-2">
                <button
                  type="button"
                  disabled={saving}
                  onClick={async () => {
                    const next = modalStatus === 'backlog' ? 'clear' : 'backlog'
                    await saveEpisode(modalEp, next, modalRating)
                    setModalStatus(next === 'clear' ? undefined : 'backlog')
                  }}
                  className={cn(
                    'rounded-lg border px-3 py-2 text-sm font-medium transition-colors',
                    modalStatus === 'backlog'
                      ? 'border-amber-300 bg-amber-100 dark:bg-amber-950 text-amber-700'
                      : 'hover:bg-muted',
                  )}
                >
                  À voir
                </button>
                <button
                  type="button"
                  disabled={saving}
                  onClick={async () => {
                    const next = modalStatus === 'completed' ? 'clear' : 'completed'
                    await saveEpisode(modalEp, next, modalRating)
                    setModalStatus(next === 'clear' ? undefined : 'completed')
                  }}
                  className={cn(
                    'rounded-lg border px-3 py-2 text-sm font-medium transition-colors',
                    modalStatus === 'completed'
                      ? 'border-green-300 bg-green-100 dark:bg-green-950 text-green-700'
                      : 'hover:bg-muted',
                  )}
                >
                  Vu
                </button>
                <button
                  type="button"
                  disabled={saving}
                  onClick={async () => {
                    await saveEpisode(modalEp, modalStatus ?? 'completed', modalRating)
                    setModalEp(null)
                  }}
                  className="rounded-lg bg-teal-600 px-3 py-2 text-sm font-semibold text-white hover:bg-teal-700 disabled:opacity-60"
                >
                  {saving ? 'Enregistrement…' : 'Enregistrer'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
