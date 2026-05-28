'use client'

import { useState, useRef, useEffect, useMemo, useCallback } from 'react'
import Link from 'next/link'
import { Dices, Filter, ChevronDown, ChevronUp, ExternalLink, RefreshCw } from 'lucide-react'
import { cn } from '@/lib/utils'
import { MOVIE_GENRES } from '@/lib/catalog/genres'
import type { LibraryEntryWithItem } from '@/types'
import type { ModeAccent } from '@/context/ModeContext'

// ─── Constants ───────────────────────────────────────────────────────────────

const WHEEL_SIZE = 300
const CENTER = WHEEL_SIZE / 2
const RADIUS = CENTER - 6
const MAX_SEGMENTS = 16

const SEGMENT_COLORS = [
  '#E11D48', '#be123c', '#FB7185', '#9f1239',
  '#f43f5e', '#881337', '#fda4af', '#c0143c',
  '#ff4d6d', '#a3132b', '#ff6b81', '#b91c1c',
  '#fc8181', '#991b1b', '#fecaca', '#7f1d1d',
]

const ACCENT_STYLES: Record<ModeAccent, { bg: string; light: string; text: string; border: string; hex: string }> = {
  amber: { bg: 'bg-amber-600', light: 'bg-amber-50', text: 'text-amber-600', border: 'border-amber-300', hex: '#D97706' },
  violet: { bg: 'bg-violet-600', light: 'bg-violet-50', text: 'text-violet-600', border: 'border-violet-300', hex: '#7C3AED' },
  indigo: { bg: 'bg-indigo-600', light: 'bg-indigo-50', text: 'text-indigo-600', border: 'border-indigo-300', hex: '#4F46E5' },
  rose: { bg: 'bg-rose-600', light: 'bg-rose-50', text: 'text-rose-600', border: 'border-rose-300', hex: '#E11D48' },
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function truncate(str: string, max: number) {
  return str.length > max ? str.slice(0, max - 1) + '…' : str
}

function easeOut(t: number) {
  return 1 - Math.pow(1 - t, 4)
}

function matchesAnyGenre(genre: string | null, labels: string[]): boolean {
  if (!genre) return false
  const norm = genre.toLowerCase()
  return labels.some((label) => {
    const def = MOVIE_GENRES.find((g) => g.label === label)
    return def?.matches.some((m) => norm.includes(m.toLowerCase())) ?? false
  })
}

function isAnimation(genre: string | null): boolean {
  if (!genre) return false
  return genre.toLowerCase().includes('animation') || genre.toLowerCase().includes('animé')
}

// ─── Component ───────────────────────────────────────────────────────────────

interface Props {
  entries: LibraryEntryWithItem[]
  accent: ModeAccent
}

export function MovieWheel({ entries, accent }: Props) {
  const ac = ACCENT_STYLES[accent] ?? ACCENT_STYLES.rose

  // ── Filter state ──
  const [filterType, setFilterType] = useState<'all' | 'animation' | 'film'>('all')
  const [filterGenres, setFilterGenres] = useState<string[]>([])
  const [customIds, setCustomIds] = useState<Set<string> | null>(null)
  const [showFilters, setShowFilters] = useState(false)
  const [showCustom, setShowCustom] = useState(false)

  // ── Wheel state ──
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [spinning, setSpinning] = useState(false)
  const [result, setResult] = useState<LibraryEntryWithItem | null>(null)
  const angleRef = useRef(0)
  const animRef = useRef<number | undefined>(undefined)

  // ── Available genres across all backlog entries ──
  const availableGenres = useMemo(() => {
    const seen = new Set<string>()
    for (const e of entries) {
      if (!e.items.genre) continue
      for (const def of MOVIE_GENRES) {
        if (def.matches.some((m) => e.items.genre!.toLowerCase().includes(m.toLowerCase()))) {
          seen.add(def.label)
        }
      }
    }
    return Array.from(seen).sort()
  }, [entries])

  // ── Filtered pool ──
  const filteredPool = useMemo(() => {
    let pool = entries

    if (filterType === 'animation') {
      pool = pool.filter((e) => isAnimation(e.items.genre))
    } else if (filterType === 'film') {
      pool = pool.filter((e) => !isAnimation(e.items.genre))
    }

    if (filterGenres.length > 0) {
      pool = pool.filter((e) => matchesAnyGenre(e.items.genre, filterGenres))
    }

    if (customIds !== null) {
      pool = pool.filter((e) => customIds.has(e.id))
    }

    return pool
  }, [entries, filterType, filterGenres, customIds])

  // ── Wheel segments (stable sample when pool changes) ──
  const segments = useMemo(() => {
    if (filteredPool.length <= MAX_SEGMENTS) return filteredPool
    const shuffled = [...filteredPool].sort(() => Math.random() - 0.5)
    return shuffled.slice(0, MAX_SEGMENTS)
  }, [filteredPool])

  // ── Draw wheel ──
  const drawWheel = useCallback(
    (angle: number, highlight: number | null = null) => {
      const canvas = canvasRef.current
      if (!canvas) return
      const ctx = canvas.getContext('2d')
      if (!ctx) return

      ctx.clearRect(0, 0, WHEEL_SIZE, WHEEL_SIZE)

      if (segments.length === 0) {
        ctx.fillStyle = '#f1f5f9'
        ctx.beginPath()
        ctx.arc(CENTER, CENTER, RADIUS, 0, 2 * Math.PI)
        ctx.fill()
        return
      }

      const n = segments.length
      const slice = (2 * Math.PI) / n

      for (let i = 0; i < n; i++) {
        const start = angle + i * slice
        const end = start + slice
        const isHighlighted = highlight === i

        // Segment fill
        ctx.beginPath()
        ctx.moveTo(CENTER, CENTER)
        ctx.arc(CENTER, CENTER, RADIUS, start, end)
        ctx.closePath()
        ctx.fillStyle = isHighlighted
          ? '#fbbf24'
          : SEGMENT_COLORS[i % SEGMENT_COLORS.length]
        ctx.fill()

        // Segment border
        ctx.strokeStyle = 'rgba(255,255,255,0.6)'
        ctx.lineWidth = 1.5
        ctx.stroke()

        // Label
        ctx.save()
        ctx.translate(CENTER, CENTER)
        ctx.rotate(start + slice / 2)
        ctx.textAlign = 'right'
        ctx.fillStyle = isHighlighted ? '#1c1917' : 'rgba(255,255,255,0.95)'
        const fontSize = n <= 8 ? 12 : n <= 12 ? 10 : 9
        ctx.font = `600 ${fontSize}px ui-sans-serif, system-ui, sans-serif`
        const maxChars = n <= 6 ? 22 : n <= 10 ? 18 : 14
        ctx.fillText(truncate(segments[i].items.title, maxChars), RADIUS - 10, 4)
        ctx.restore()
      }

      // Center hub
      ctx.beginPath()
      ctx.arc(CENTER, CENTER, 22, 0, 2 * Math.PI)
      ctx.fillStyle = 'white'
      ctx.fill()
      ctx.strokeStyle = ac.hex
      ctx.lineWidth = 3
      ctx.stroke()

      // Center icon (small dice dots)
      ctx.fillStyle = ac.hex
      const dots = [[-4, -4], [0, -4], [4, -4], [-4, 0], [4, 0], [-4, 4], [0, 4], [4, 4]]
      for (const [dx, dy] of dots) {
        ctx.beginPath()
        ctx.arc(CENTER + dx, CENTER + dy, 1.5, 0, 2 * Math.PI)
        ctx.fill()
      }
    },
    [segments, ac.hex]
  )

  // Redraw on segment change
  useEffect(() => {
    drawWheel(angleRef.current)
  }, [drawWheel])

  // ── Spin ──
  const spin = useCallback(() => {
    if (spinning || segments.length === 0) return

    const winnerIdx = Math.floor(Math.random() * segments.length)
    const winner = segments[winnerIdx]
    setResult(null)
    setSpinning(true)

    const n = segments.length
    const slice = (2 * Math.PI) / n
    const startAngle = angleRef.current

    // Target angle so that winnerIdx segment center lands at the top pointer (-π/2)
    const targetBase = -Math.PI / 2 - winnerIdx * slice - slice / 2
    // Normalize difference so we always spin forward
    const currentNorm = ((startAngle % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI)
    const targetNorm = ((targetBase % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI)
    let delta = targetNorm - currentNorm
    if (delta <= 0) delta += 2 * Math.PI
    const fullSpins = 5 + Math.floor(Math.random() * 3)
    const totalDelta = fullSpins * 2 * Math.PI + delta
    const finalAngle = startAngle + totalDelta

    const duration = 4200 + Math.random() * 800
    const startTime = performance.now()

    const animate = (now: number) => {
      const t = Math.min((now - startTime) / duration, 1)
      const angle = startAngle + totalDelta * easeOut(t)
      angleRef.current = angle

      // Highlight winner segment when near end
      const highlight = t > 0.92 ? winnerIdx : null
      drawWheel(angle, highlight)

      if (t < 1) {
        animRef.current = requestAnimationFrame(animate)
      } else {
        drawWheel(finalAngle, winnerIdx)
        setSpinning(false)
        setResult(winner)
      }
    }

    animRef.current = requestAnimationFrame(animate)
  }, [spinning, segments, drawWheel])

  useEffect(() => {
    return () => {
      if (animRef.current !== undefined) cancelAnimationFrame(animRef.current)
    }
  }, [])

  if (entries.length === 0) return null

  const hasActiveFilters = filterType !== 'all' || filterGenres.length > 0 || customIds !== null
  const filterCount = (filterType !== 'all' ? 1 : 0) + filterGenres.length + (customIds !== null ? 1 : 0)

  return (
    <section className="space-y-4">
      {/* ── Header ── */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Dices className={cn('h-5 w-5', ac.text)} />
          <h2 className="text-lg font-bold">Roue du destin</h2>
          <span className="text-xs text-muted-foreground">
            ({filteredPool.length} film{filteredPool.length !== 1 ? 's' : ''})
          </span>
        </div>
        <button
          onClick={() => setShowFilters(!showFilters)}
          className={cn(
            'flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium border transition-all',
            showFilters || hasActiveFilters
              ? `${ac.light} ${ac.text} ${ac.border}`
              : 'bg-muted text-muted-foreground border-transparent hover:border-muted-foreground/30'
          )}
        >
          <Filter className="h-3 w-3" />
          Filtres
          {filterCount > 0 && (
            <span className={cn(
              'inline-flex h-4 min-w-4 items-center justify-center rounded-full px-1 text-[10px] font-bold',
              ac.bg, 'text-white'
            )}>
              {filterCount}
            </span>
          )}
          {showFilters ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
        </button>
      </div>

      {/* ── Filter panel ── */}
      {showFilters && (
        <div className="rounded-xl border bg-card p-4 space-y-4">

          {/* Type */}
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground mb-2">Type</p>
            <div className="flex gap-2">
              {(['all', 'film', 'animation'] as const).map((t) => (
                <button
                  key={t}
                  onClick={() => setFilterType(t)}
                  className={cn(
                    'rounded-full px-3 py-1 text-xs font-medium transition-all',
                    filterType === t
                      ? `${ac.bg} text-white shadow-sm`
                      : 'bg-muted text-muted-foreground hover:text-foreground'
                  )}
                >
                  {t === 'all' ? 'Tous' : t === 'film' ? '🎬 Film' : '🎨 Animation'}
                </button>
              ))}
            </div>
          </div>

          {/* Genres */}
          {availableGenres.length > 0 && (
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground mb-2">Genres</p>
              <div className="flex flex-wrap gap-2">
                {availableGenres.map((g) => (
                  <button
                    key={g}
                    onClick={() =>
                      setFilterGenres((prev) =>
                        prev.includes(g) ? prev.filter((x) => x !== g) : [...prev, g]
                      )
                    }
                    className={cn(
                      'rounded-full px-3 py-1 text-xs font-medium transition-all',
                      filterGenres.includes(g)
                        ? `${ac.bg} text-white shadow-sm`
                        : 'bg-muted text-muted-foreground hover:text-foreground'
                    )}
                  >
                    {g}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Custom selection */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                Sélection personnalisée
                {customIds !== null && (
                  <span className={cn('ml-1.5 normal-case font-normal', ac.text)}>
                    ({customIds.size} sélectionné{customIds.size !== 1 ? 's' : ''})
                  </span>
                )}
              </p>
              <div className="flex items-center gap-3">
                {customIds !== null && (
                  <button
                    onClick={() => setCustomIds(null)}
                    className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
                  >
                    <RefreshCw className="h-3 w-3" />
                    Tout réinitialiser
                  </button>
                )}
                <button
                  onClick={() => setShowCustom(!showCustom)}
                  className={cn('text-xs font-medium', ac.text)}
                >
                  {showCustom ? 'Masquer' : 'Choisir les films'}
                </button>
              </div>
            </div>

            {showCustom && (
              <div className="max-h-48 overflow-y-auto rounded-lg border divide-y">
                {entries.map((e) => {
                  const inPool = customIds === null || customIds.has(e.id)
                  return (
                    <label
                      key={e.id}
                      className="flex items-center gap-3 px-3 py-2 hover:bg-muted/50 cursor-pointer"
                    >
                      <input
                        type="checkbox"
                        checked={inPool}
                        onChange={() => {
                          setCustomIds((prev) => {
                            const current = prev ?? new Set(entries.map((x) => x.id))
                            const next = new Set(current)
                            if (next.has(e.id)) next.delete(e.id)
                            else next.add(e.id)
                            return next.size === entries.length ? null : next
                          })
                        }}
                        className="h-3.5 w-3.5 rounded accent-rose-600 cursor-pointer"
                      />
                      {e.items.cover_url && (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={e.items.cover_url}
                          alt=""
                          className="h-8 w-6 rounded object-cover shrink-0 border"
                        />
                      )}
                      <span className="text-sm truncate flex-1">{e.items.title}</span>
                      {e.items.release_year && (
                        <span className="text-xs text-muted-foreground shrink-0">{e.items.release_year}</span>
                      )}
                    </label>
                  )
                })}
              </div>
            )}
          </div>

          {/* Pool info */}
          <p className="text-xs text-muted-foreground">
            {filteredPool.length === 0
              ? 'Aucun film ne correspond à ces filtres.'
              : `${filteredPool.length} film${filteredPool.length !== 1 ? 's' : ''} dans le pool${segments.length < filteredPool.length ? ` · ${segments.length} affichés sur la roue` : ''}`
            }
          </p>
        </div>
      )}

      {/* ── Wheel area ── */}
      <div className="flex flex-col items-center gap-5 py-2">
        {/* Wheel + pointer */}
        <div className="relative flex flex-col items-center">
          {/* Top pointer */}
          <div
            className="z-10 mb-[-4px]"
            style={{
              width: 0,
              height: 0,
              borderLeft: '10px solid transparent',
              borderRight: '10px solid transparent',
              borderTop: `20px solid ${ac.hex}`,
              filter: 'drop-shadow(0 2px 4px rgba(0,0,0,0.2))',
            }}
          />
          <div className="relative">
            <canvas
              ref={canvasRef}
              width={WHEEL_SIZE}
              height={WHEEL_SIZE}
              className="rounded-full shadow-xl"
            />
            {segments.length === 0 && (
              <div className="absolute inset-0 flex items-center justify-center rounded-full bg-muted/80">
                <p className="text-sm text-muted-foreground text-center px-8 font-medium">
                  Aucun film ne correspond aux filtres
                </p>
              </div>
            )}
          </div>
        </div>

        {/* Spin button */}
        <button
          onClick={spin}
          disabled={spinning || segments.length === 0}
          className={cn(
            'flex items-center gap-2 rounded-full px-8 py-3 text-sm font-bold text-white shadow-md transition-all duration-200',
            spinning || segments.length === 0
              ? 'opacity-50 cursor-not-allowed bg-slate-400'
              : `${ac.bg} hover:scale-105 hover:shadow-lg active:scale-95`
          )}
        >
          <Dices className={cn('h-4 w-4', spinning && 'animate-spin')} />
          {spinning ? 'En cours…' : 'Tourner !'}
        </button>

        {/* Result card */}
        {result && !spinning && (
          <div
            className={cn(
              'w-full max-w-sm rounded-2xl border-2 overflow-hidden shadow-md',
              ac.border
            )}
          >
            <div className={cn('px-4 py-2 text-center text-xs font-bold text-white', ac.bg)}>
              Ce soir, tu regardes…
            </div>
            <div className={cn('p-4 flex gap-4 items-center', ac.light)}>
              {result.items.cover_url && (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={result.items.cover_url}
                  alt={result.items.title}
                  className="h-20 w-14 rounded-lg object-cover border shadow shrink-0"
                />
              )}
              <div className="flex-1 min-w-0">
                <p className="text-lg font-bold leading-tight">{result.items.title}</p>
                {result.items.genre && (
                  <p className="text-sm text-muted-foreground mt-0.5">{result.items.genre}</p>
                )}
                {result.items.release_year && (
                  <p className="text-xs text-muted-foreground">{result.items.release_year}</p>
                )}
                <Link
                  href={`/item/${result.items.id}`}
                  className={cn(
                    'mt-2 inline-flex items-center gap-1 text-sm font-semibold',
                    ac.text
                  )}
                >
                  Voir la fiche <ExternalLink className="h-3 w-3" />
                </Link>
              </div>
            </div>
          </div>
        )}
      </div>
    </section>
  )
}
