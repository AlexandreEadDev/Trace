'use client'

import { useState, useRef, useEffect, useMemo, useCallback } from 'react'
import Link from 'next/link'
import {
  Dices, X, ArrowLeft, ExternalLink, RefreshCw, ChevronDown, ChevronUp,
} from 'lucide-react'
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
  '#fc8181', '#991b1b', '#f9a8d4', '#7f1d1d',
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

function genreMatchesLabel(genre: string, label: string): boolean {
  const def = MOVIE_GENRES.find((g) => g.label === label)
  if (!def) return false
  const norm = genre.toLowerCase()
  return def.matches.some((m) => norm.includes(m.toLowerCase()))
}

function isAnimation(genre: string | null): boolean {
  if (!genre) return false
  return genreMatchesLabel(genre, 'Animation')
}

function matchesGenres(genre: string | null, labels: string[], mode: 'or' | 'and'): boolean {
  if (labels.length === 0) return true
  if (!genre) return false
  if (mode === 'or') return labels.some((l) => genreMatchesLabel(genre, l))
  return labels.every((l) => genreMatchesLabel(genre, l))
}

// ─── Wheel canvas logic ───────────────────────────────────────────────────────

function drawWheelCanvas(
  canvas: HTMLCanvasElement,
  segments: LibraryEntryWithItem[],
  angle: number,
  highlight: number | null,
  accentHex: string
) {
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
    const isHl = highlight === i

    ctx.beginPath()
    ctx.moveTo(CENTER, CENTER)
    ctx.arc(CENTER, CENTER, RADIUS, start, end)
    ctx.closePath()
    ctx.fillStyle = isHl ? '#fbbf24' : SEGMENT_COLORS[i % SEGMENT_COLORS.length]
    ctx.fill()
    ctx.strokeStyle = 'rgba(255,255,255,0.55)'
    ctx.lineWidth = 1.5
    ctx.stroke()

    ctx.save()
    ctx.translate(CENTER, CENTER)
    ctx.rotate(start + slice / 2)
    ctx.textAlign = 'right'
    ctx.fillStyle = isHl ? '#1c1917' : 'rgba(255,255,255,0.95)'
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
  ctx.strokeStyle = accentHex
  ctx.lineWidth = 3
  ctx.stroke()

  ctx.fillStyle = accentHex
  for (const [dx, dy] of [[-4, -4], [0, -4], [4, -4], [-4, 0], [4, 0], [-4, 4], [0, 4], [4, 4]] as [number, number][]) {
    ctx.beginPath()
    ctx.arc(CENTER + dx, CENTER + dy, 1.5, 0, 2 * Math.PI)
    ctx.fill()
  }
}

// ─── Filter step ─────────────────────────────────────────────────────────────

interface FilterState {
  type: 'all' | 'animation' | 'film'
  genres: string[]
  genreMode: 'or' | 'and'
  customIds: Set<string> | null
}

function FilterStep({
  entries,
  state,
  onChange,
  onValidate,
  onClose,
  accent,
}: {
  entries: LibraryEntryWithItem[]
  state: FilterState
  onChange: (s: FilterState) => void
  onValidate: () => void
  onClose: () => void
  accent: ModeAccent
}) {
  const ac = ACCENT_STYLES[accent] ?? ACCENT_STYLES.rose
  const [showCustom, setShowCustom] = useState(false)

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

  const filteredCount = useMemo(() => {
    let pool = entries
    if (state.type === 'animation') pool = pool.filter((e) => isAnimation(e.items.genre))
    else if (state.type === 'film') pool = pool.filter((e) => !isAnimation(e.items.genre))
    if (state.genres.length > 0) pool = pool.filter((e) => matchesGenres(e.items.genre, state.genres, state.genreMode))
    if (state.customIds !== null) pool = pool.filter((e) => state.customIds!.has(e.id))
    return pool.length
  }, [entries, state])

  const setType = (type: FilterState['type']) => onChange({ ...state, type })
  const toggleGenre = (g: string) =>
    onChange({ ...state, genres: state.genres.includes(g) ? state.genres.filter((x) => x !== g) : [...state.genres, g] })
  const setGenreMode = (genreMode: 'or' | 'and') => onChange({ ...state, genreMode })
  const setCustomIds = (fn: (prev: Set<string> | null) => Set<string> | null) =>
    onChange({ ...state, customIds: fn(state.customIds) })

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className={cn('flex items-center justify-between px-5 py-4 border-b', ac.light)}>
        <div className="flex items-center gap-2">
          <Dices className={cn('h-5 w-5', ac.text)} />
          <h2 className="font-bold text-base">Roue du destin</h2>
        </div>
        <button onClick={onClose} className="rounded-full p-1.5 hover:bg-black/10 transition-colors">
          <X className="h-4 w-4" />
        </button>
      </div>

      {/* Body — scrollable */}
      <div className="flex-1 overflow-y-auto px-5 py-4 space-y-5">

        {/* Type */}
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground mb-2">Type</p>
          <div className="flex gap-2">
            {(['all', 'film', 'animation'] as const).map((t) => (
              <button
                key={t}
                onClick={() => setType(t)}
                className={cn(
                  'rounded-full px-3 py-1.5 text-sm font-medium transition-all',
                  state.type === t ? `${ac.bg} text-white shadow-sm` : 'bg-muted text-muted-foreground hover:text-foreground'
                )}
              >
                {t === 'all' ? 'Tous' : t === 'film' ? '🎬 Film' : '🎨 Animation'}
              </button>
            ))}
          </div>
        </div>

        {/* Genres + AND/OR */}
        {availableGenres.length > 0 && (
          <div>
            <div className="flex items-center justify-between mb-2">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Genres</p>
              {state.genres.length >= 2 && (
                <div className="flex items-center gap-1 rounded-full bg-muted p-0.5">
                  {(['or', 'and'] as const).map((m) => (
                    <button
                      key={m}
                      onClick={() => setGenreMode(m)}
                      className={cn(
                        'rounded-full px-2.5 py-0.5 text-xs font-bold transition-all',
                        state.genreMode === m ? `${ac.bg} text-white` : 'text-muted-foreground'
                      )}
                    >
                      {m === 'or' ? 'OU' : 'ET'}
                    </button>
                  ))}
                </div>
              )}
            </div>
            <div className="flex flex-wrap gap-2">
              {availableGenres.map((g) => (
                <button
                  key={g}
                  onClick={() => toggleGenre(g)}
                  className={cn(
                    'rounded-full px-3 py-1.5 text-sm font-medium transition-all',
                    state.genres.includes(g)
                      ? `${ac.bg} text-white shadow-sm`
                      : 'bg-muted text-muted-foreground hover:text-foreground'
                  )}
                >
                  {g}
                </button>
              ))}
            </div>
            {state.genres.length >= 2 && (
              <p className="mt-2 text-xs text-muted-foreground">
                Mode&nbsp;
                <span className={cn('font-semibold', ac.text)}>
                  {state.genreMode === 'or' ? 'OU' : 'ET'}
                </span>
                {state.genreMode === 'or'
                  ? ' — films correspondant à au moins un des genres sélectionnés'
                  : ' — films correspondant à tous les genres sélectionnés'}
              </p>
            )}
          </div>
        )}

        {/* Custom selection */}
        <div className="rounded-xl border overflow-hidden">
          <button
            onClick={() => setShowCustom((v) => !v)}
            className="w-full flex items-center justify-between px-4 py-3 text-sm font-medium hover:bg-muted/50 transition-colors"
          >
            <span className="flex items-center gap-2">
              Sélection personnalisée
              {state.customIds !== null && (
                <span className={cn('text-xs font-normal', ac.text)}>
                  {state.customIds.size} film{state.customIds.size !== 1 ? 's' : ''} sélectionné{state.customIds.size !== 1 ? 's' : ''}
                </span>
              )}
            </span>
            <span className="flex items-center gap-2">
              {state.customIds !== null && (
                <span
                  role="button"
                  tabIndex={0}
                  onClick={(ev) => { ev.stopPropagation(); onChange({ ...state, customIds: null }) }}
                  onKeyDown={(ev) => { if (ev.key === 'Enter') { ev.stopPropagation(); onChange({ ...state, customIds: null }) } }}
                  className="text-xs text-muted-foreground underline hover:text-foreground"
                >
                  Réinitialiser
                </span>
              )}
              {showCustom ? <ChevronUp className="h-4 w-4 text-muted-foreground" /> : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
            </span>
          </button>

          {showCustom && (
            <div className="border-t">
              {/* Select all / deselect all */}
              <div className="flex items-center justify-between px-4 py-2 bg-muted/30">
                <span className="text-xs text-muted-foreground">
                  {state.customIds === null ? entries.length : state.customIds.size}/{entries.length} sélectionné{entries.length !== 1 ? 's' : ''}
                </span>
                <div className="flex items-center gap-3">
                  <button
                    onClick={() => onChange({ ...state, customIds: null })}
                    className={cn('text-xs font-medium transition-colors', ac.text, 'hover:underline')}
                  >
                    Tout cocher
                  </button>
                  <span className="text-muted-foreground/40">·</span>
                  <button
                    onClick={() => onChange({ ...state, customIds: new Set() })}
                    className="text-xs font-medium text-muted-foreground hover:text-foreground transition-colors hover:underline"
                  >
                    Tout décocher
                  </button>
                </div>
              </div>
              <div className="max-h-52 overflow-y-auto divide-y">
              {entries.map((e) => {
                const checked = state.customIds === null || state.customIds.has(e.id)
                return (
                  <label key={e.id} className="flex items-center gap-3 px-4 py-2 hover:bg-muted/40 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() =>
                        setCustomIds((prev) => {
                          const current = prev ?? new Set(entries.map((x) => x.id))
                          const next = new Set(current)
                          if (next.has(e.id)) next.delete(e.id)
                          else next.add(e.id)
                          return next.size === entries.length ? null : next
                        })
                      }
                      className="h-4 w-4 rounded cursor-pointer accent-rose-600 shrink-0"
                    />
                    {e.items.cover_url && (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={e.items.cover_url} alt="" className="h-9 w-6 rounded object-cover border shrink-0" />
                    )}
                    <span className="text-sm truncate flex-1">{e.items.title}</span>
                    {e.items.release_year && (
                      <span className="text-xs text-muted-foreground shrink-0">{e.items.release_year}</span>
                    )}
                  </label>
                )
              })}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Footer */}
      <div className="px-5 py-4 border-t bg-card flex items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground">
          {filteredCount === 0
            ? 'Aucun film trouvé'
            : <><span className={cn('font-semibold', ac.text)}>{filteredCount}</span> film{filteredCount !== 1 ? 's' : ''} dans le pool</>
          }
        </p>
        <button
          onClick={onValidate}
          disabled={filteredCount === 0}
          className={cn(
            'flex items-center gap-2 rounded-full px-6 py-2.5 text-sm font-bold text-white transition-all',
            filteredCount === 0
              ? 'bg-muted-foreground/40 cursor-not-allowed'
              : `${ac.bg} hover:scale-105 hover:shadow-md active:scale-95`
          )}
        >
          <Dices className="h-4 w-4" />
          Lancer la roue !
        </button>
      </div>
    </div>
  )
}

// ─── Wheel step ───────────────────────────────────────────────────────────────

function WheelStep({
  segments,
  onBack,
  onClose,
  accent,
}: {
  segments: LibraryEntryWithItem[]
  onBack: () => void
  onClose: () => void
  accent: ModeAccent
}) {
  const ac = ACCENT_STYLES[accent] ?? ACCENT_STYLES.rose
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const angleRef = useRef(0)
  const animRef = useRef<number | undefined>(undefined)
  const [spinning, setSpinning] = useState(false)
  const [result, setResult] = useState<LibraryEntryWithItem | null>(null)

  const draw = useCallback(
    (angle: number, highlight: number | null = null) => {
      if (canvasRef.current) drawWheelCanvas(canvasRef.current, segments, angle, highlight, ac.hex)
    },
    [segments, ac.hex]
  )

  const spin = useCallback(() => {
    if (spinning || segments.length === 0) return
    const winnerIdx = Math.floor(Math.random() * segments.length)
    const winner = segments[winnerIdx]
    setResult(null)
    setSpinning(true)

    const n = segments.length
    const slice = (2 * Math.PI) / n
    const startAngle = angleRef.current
    const targetBase = -Math.PI / 2 - winnerIdx * slice - slice / 2
    const currentNorm = ((startAngle % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI)
    const targetNorm = ((targetBase % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI)
    let delta = targetNorm - currentNorm
    if (delta <= 0) delta += 2 * Math.PI
    const fullSpins = 5 + Math.floor(Math.random() * 3)
    const totalDelta = fullSpins * 2 * Math.PI + delta
    const duration = 4000 + Math.random() * 1000
    const startTime = performance.now()

    const animate = (now: number) => {
      const t = Math.min((now - startTime) / duration, 1)
      const angle = startAngle + totalDelta * easeOut(t)
      angleRef.current = angle
      draw(angle, t > 0.92 ? winnerIdx : null)
      if (t < 1) {
        animRef.current = requestAnimationFrame(animate)
      } else {
        draw(startAngle + totalDelta, winnerIdx)
        setSpinning(false)
        setResult(winner)
      }
    }
    animRef.current = requestAnimationFrame(animate)
  }, [spinning, segments, draw])

  // Initial draw + auto-spin
  useEffect(() => {
    draw(angleRef.current)
    const t = setTimeout(() => spin(), 200)
    return () => clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    return () => { if (animRef.current !== undefined) cancelAnimationFrame(animRef.current) }
  }, [])

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className={cn('flex items-center justify-between px-5 py-4 border-b', ac.light)}>
        <button
          onClick={onBack}
          className="flex items-center gap-1.5 text-sm font-medium text-muted-foreground hover:text-foreground transition-colors"
        >
          <ArrowLeft className="h-4 w-4" />
          Filtres
        </button>
        <button onClick={onClose} className="rounded-full p-1.5 hover:bg-black/10 transition-colors">
          <X className="h-4 w-4" />
        </button>
      </div>

      {/* Wheel */}
      <div className="flex-1 flex flex-col items-center justify-center gap-4 px-5 py-6">
        <div className="flex flex-col items-center">
          {/* Pointer */}
          <div
            style={{
              width: 0, height: 0,
              borderLeft: '10px solid transparent',
              borderRight: '10px solid transparent',
              borderTop: `20px solid ${ac.hex}`,
              filter: 'drop-shadow(0 2px 3px rgba(0,0,0,0.25))',
              marginBottom: '-3px',
              zIndex: 10,
              position: 'relative',
            }}
          />
          <canvas
            ref={canvasRef}
            width={WHEEL_SIZE}
            height={WHEEL_SIZE}
            className="rounded-full shadow-2xl"
          />
        </div>

        {/* Spin / result */}
        {!spinning && !result && (
          <button
            onClick={spin}
            className={cn(
              'flex items-center gap-2 rounded-full px-8 py-3 text-sm font-bold text-white shadow-md transition-all',
              `${ac.bg} hover:scale-105 hover:shadow-lg active:scale-95`
            )}
          >
            <Dices className="h-4 w-4" />
            Tourner !
          </button>
        )}

        {spinning && (
          <p className="text-sm text-muted-foreground animate-pulse">La roue tourne…</p>
        )}

        {result && !spinning && (
          <div className={cn('w-full rounded-2xl border-2 overflow-hidden shadow-lg', ac.border)}>
            <div className={cn('px-4 py-2 text-center text-xs font-bold text-white tracking-wide', ac.bg)}>
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
                {result.items.genre && <p className="text-sm text-muted-foreground mt-0.5">{result.items.genre}</p>}
                {result.items.release_year && <p className="text-xs text-muted-foreground">{result.items.release_year}</p>}
                <Link
                  href={`/item/${result.items.id}`}
                  className={cn('mt-2 inline-flex items-center gap-1 text-sm font-semibold', ac.text)}
                  onClick={onClose}
                >
                  Voir la fiche <ExternalLink className="h-3 w-3" />
                </Link>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Footer */}
      {result && !spinning && (
        <div className="px-5 py-4 border-t bg-card flex items-center justify-between gap-3">
          <button
            onClick={onBack}
            className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            Modifier les filtres
          </button>
          <button
            onClick={spin}
            className={cn(
              'flex items-center gap-2 rounded-full px-5 py-2 text-sm font-semibold text-white transition-all',
              `${ac.bg} hover:scale-105 active:scale-95`
            )}
          >
            <RefreshCw className="h-3.5 w-3.5" />
            Relancer
          </button>
        </div>
      )}
    </div>
  )
}

// ─── Main export ─────────────────────────────────────────────────────────────

interface Props {
  entries: LibraryEntryWithItem[]
  accent: ModeAccent
}

const DEFAULT_FILTERS: FilterState = {
  type: 'all',
  genres: [],
  genreMode: 'or',
  customIds: null,
}

export function MovieWheel({ entries, accent }: Props) {
  const ac = ACCENT_STYLES[accent] ?? ACCENT_STYLES.rose
  const [open, setOpen] = useState(false)
  const [step, setStep] = useState<'filters' | 'wheel'>('filters')
  const [filters, setFilters] = useState<FilterState>(DEFAULT_FILTERS)
  const [segments, setSegments] = useState<LibraryEntryWithItem[]>([])

  const openModal = () => {
    setStep('filters')
    setOpen(true)
  }

  const closeModal = () => setOpen(false)

  const handleValidate = () => {
    // Compute filtered pool
    let pool = entries
    if (filters.type === 'animation') pool = pool.filter((e) => isAnimation(e.items.genre))
    else if (filters.type === 'film') pool = pool.filter((e) => !isAnimation(e.items.genre))
    if (filters.genres.length > 0) pool = pool.filter((e) => matchesGenres(e.items.genre, filters.genres, filters.genreMode))
    if (filters.customIds !== null) pool = pool.filter((e) => filters.customIds!.has(e.id))

    // Sample segments
    const sample = pool.length <= MAX_SEGMENTS ? pool : [...pool].sort(() => Math.random() - 0.5).slice(0, MAX_SEGMENTS)
    setSegments(sample)
    setStep('wheel')
  }

  if (entries.length === 0) return null

  // Lock body scroll while modal is open
  useEffect(() => {
    if (open) {
      document.body.style.overflow = 'hidden'
    } else {
      document.body.style.overflow = ''
    }
    return () => { document.body.style.overflow = '' }
  }, [open])

  const hasFilters = filters.type !== 'all' || filters.genres.length > 0 || filters.customIds !== null

  return (
    <>
      {/* Trigger button */}
      <button
        onClick={openModal}
        title="Roue du destin"
        className={cn(
          'relative flex items-center justify-center rounded-full text-white shadow-md transition-all hover:scale-105 hover:shadow-lg active:scale-95',
          'h-8 w-8',
          ac.bg
        )}
      >
        <Dices className="h-4 w-4" />
        {hasFilters && (
          <span className="absolute -top-0.5 -right-0.5 h-2.5 w-2.5 rounded-full bg-white border-2 border-white" style={{ backgroundColor: ac.hex }} />
        )}
      </button>

      {/* Modal */}
      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          {/* Backdrop */}
          <div
            className="absolute inset-0 bg-black/50 backdrop-blur-sm"
            onClick={closeModal}
          />

          {/* Panel */}
          <div className="relative z-10 w-full max-w-md bg-background rounded-2xl shadow-2xl border overflow-hidden flex flex-col max-h-[90vh]">
            {step === 'filters' ? (
              <FilterStep
                entries={entries}
                state={filters}
                onChange={setFilters}
                onValidate={handleValidate}
                onClose={closeModal}
                accent={accent}
              />
            ) : (
              <WheelStep
                key={segments.map((s) => s.id).join(',')}
                segments={segments}
                onBack={() => setStep('filters')}
                onClose={closeModal}
                accent={accent}
              />
            )}
          </div>
        </div>
      )}
    </>
  )
}
