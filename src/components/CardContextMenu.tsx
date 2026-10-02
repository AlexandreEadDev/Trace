'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { BookmarkPlus, Eye, Loader2, RotateCcw, Star, Trash2, X } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { cn } from '@/lib/utils'
import type { ModeAccent } from '@/context/ModeContext'
import type { StatusType } from '@/types'

export interface CardContextMenuTarget {
  /** Real Supabase item UUID when known (dashboard entries). */
  itemId?: string
  /** Encoded catalog id (e.g. `tmdb__123`) for catalog cards. */
  catalogId?: string
  title: string
  /** Existing user rating (0 when none). */
  rating?: number
  /** Existing library status when known (dashboard entries). */
  status?: StatusType | null
}

interface CardContextMenuProps {
  target: CardContextMenuTarget
  accent: ModeAccent
  onClose: () => void
  /**
   * Called after a successful quick action so the parent can refresh. May
   * return a promise; the menu awaits it so the refreshed data is visible
   * before the banner settles.
   */
  onChanged?: () => void | Promise<void>
}

/**
 * Inline action banner rendered inside a card when the user right-clicks or
 * long-presses it. Offers "À voir", "Vu" and a quick rating, reflecting the
 * user's existing state and allowing it to be updated or removed.
 *
 * Dismisses on Escape. Outside-click dismissal is handled by the parent card
 * (which owns the open state and the pointer handlers).
 */
export function CardContextMenu({
  target,
  accent,
  onClose,
  onChanged,
}: CardContextMenuProps) {
  const bannerRef = useRef<HTMLDivElement>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [rating, setRating] = useState(target.rating ?? 0)
  const [status, setStatus] = useState<StatusType | null>(target.status ?? null)
  const [hovered, setHovered] = useState(0)
  const [loadingState, setLoadingState] = useState(!target.itemId)

  // ── Escape dismissal ──
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  // Focus the banner for keyboard accessibility.
  useEffect(() => {
    bannerRef.current?.focus()
  }, [])

  /**
   * Resolve a real item UUID for the card this menu belongs to.
   *
   * When `resolveOnly` is true the item row is created/returned **without**
   * touching the user's library, so merely opening the menu never changes the
   * item's status. Mutations pass `resolveOnly: false` so the item exists
   * before the library/review write.
   */
  const resolveItemId = useCallback(
    async (resolveOnly = true): Promise<string | null> => {
      if (target.itemId) return target.itemId
      if (!target.catalogId) return null
      const res = await fetch('/api/discover/quick-add', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ catalogId: target.catalogId, resolveOnly }),
      })
      if (!res.ok) return null
      const json = (await res.json()) as { itemId?: string }
      return json.itemId ?? null
    },
    [target.itemId, target.catalogId]
  )

  // ── Load existing user state (status + rating) ──
  useEffect(() => {
    let cancelled = false
    async function loadState() {
      try {
        const supabase = createClient()
        const {
          data: { user },
        } = await supabase.auth.getUser()
        if (!user) {
          if (!cancelled) setLoadingState(false)
          return
        }
        const itemId = await resolveItemId()
        if (!itemId) {
          if (!cancelled) setLoadingState(false)
          return
        }
        const [libRes, revRes] = await Promise.all([
          supabase
            .from('user_libraries')
            .select('status')
            .eq('user_id', user.id)
            .eq('item_id', itemId)
            .maybeSingle(),
          supabase
            .from('reviews')
            .select('rating')
            .eq('user_id', user.id)
            .eq('item_id', itemId)
            .maybeSingle(),
        ])
        if (cancelled) return
        const libStatus = (libRes.data?.status as StatusType | undefined) ?? null
        setStatus(libStatus)
        if (typeof revRes.data?.rating === 'number') setRating(revRes.data.rating)
      } catch {
        /* ignore — banner still usable */
      } finally {
        if (!cancelled) setLoadingState(false)
      }
    }
    void loadState()
    return () => {
      cancelled = true
    }
  }, [resolveItemId])

  /** Upsert a library status ('backlog' | 'completed'). */
  const setLibraryStatus = useCallback(
    async (next: StatusType) => {
      setBusy(true)
      setError(null)
      try {
        const supabase = createClient()
        const {
          data: { user },
        } = await supabase.auth.getUser()
        if (!user) {
          setError('Connecte-toi pour utiliser cette action.')
          return
        }
        const itemId = await resolveItemId(false)
        if (!itemId) {
          setError('Impossible de résoudre cet élément.')
          return
        }
        const { data: saved, error: upErr } = await supabase
          .from('user_libraries')
          .upsert(
            { user_id: user.id, item_id: itemId, status: next },
            { onConflict: 'user_id,item_id' }
          )
          .select('status')
          .single()
        if (upErr || !saved) {
          setError(upErr?.message ?? 'Enregistrement impossible.')
          return
        }
        setStatus(saved.status as StatusType)
        await onChanged?.()
        // Intentionally keep the menu open so the user can chain actions
        // (e.g. mark "vu" then set a rating). It closes on outside click,
        // Escape, the X button, or when another card's menu becomes active.
      } catch {
        setError('Une erreur est survenue.')
      } finally {
        setBusy(false)
      }
    },
    [resolveItemId, onChanged]
  )

  /** Remove the library entry entirely. */
  const removeStatus = useCallback(async () => {
    setBusy(true)
    setError(null)
    try {
      const supabase = createClient()
      const {
        data: { user },
      } = await supabase.auth.getUser()
      if (!user) {
        setError('Connecte-toi pour utiliser cette action.')
        return
      }
      const itemId = await resolveItemId(false)
      if (!itemId) {
        setError('Impossible de résoudre cet élément.')
        return
      }
      const { error: delErr } = await supabase
        .from('user_libraries')
        .delete()
        .eq('user_id', user.id)
        .eq('item_id', itemId)
      if (delErr) {
        setError(delErr.message)
        return
      }
      setStatus(null)
      await onChanged?.()
      // Keep the menu open; see note in setLibraryStatus.
    } catch {
      setError('Une erreur est survenue.')
    } finally {
      setBusy(false)
    }
  }, [resolveItemId, onChanged])

  const submitRating = useCallback(
    async (value: number) => {
      setBusy(true)
      setError(null)
      try {
        const supabase = createClient()
        const {
          data: { user },
        } = await supabase.auth.getUser()
        if (!user) {
          setError('Connecte-toi pour noter.')
          return
        }
        const itemId = await resolveItemId(false)
        if (!itemId) {
          setError('Impossible de résoudre cet élément.')
          return
        }
        const { data: saved, error: revErr } = await supabase
          .from('reviews')
          .upsert(
            { user_id: user.id, item_id: itemId, rating: value },
            { onConflict: 'user_id,item_id' }
          )
          .select('rating')
          .single()
        if (revErr || !saved) {
          setError(revErr?.message ?? 'Enregistrement impossible.')
          return
        }
        setRating(saved.rating as number)
        await onChanged?.()
      } catch {
        setError('Une erreur est survenue.')
      } finally {
        setBusy(false)
      }
    },
    [resolveItemId, onChanged]
  )

  /** Remove the user's rating. */
  const removeRating = useCallback(async () => {
    setBusy(true)
    setError(null)
    try {
      const supabase = createClient()
      const {
        data: { user },
      } = await supabase.auth.getUser()
      if (!user) {
        setError('Connecte-toi pour noter.')
        return
      }
      const itemId = await resolveItemId(false)
      if (!itemId) {
        setError('Impossible de résoudre cet élément.')
        return
      }
      const { error: delErr } = await supabase
        .from('reviews')
        .delete()
        .eq('user_id', user.id)
        .eq('item_id', itemId)
      if (delErr) {
        setError(delErr.message)
        return
      }
      setRating(0)
      await onChanged?.()
    } catch {
      setError('Une erreur est survenue.')
    } finally {
      setBusy(false)
    }
  }, [resolveItemId, onChanged])

  const displayRating = hovered || rating

  const canRate = status === 'completed'

  return (
    <div
      ref={bannerRef}
      role="menu"
      tabIndex={-1}
      aria-label={`Actions rapides pour ${target.title}`}
      onClick={(e) => {
        // Keep clicks inside the banner from triggering the card navigation.
        e.preventDefault()
        e.stopPropagation()
      }}
      onContextMenu={(e) => e.preventDefault()}
      className="absolute inset-x-0 bottom-0 z-20 animate-in slide-in-from-bottom-2 fade-in duration-200 rounded-b-xl border-t bg-card/95 p-2.5 shadow-lg backdrop-blur-md outline-none"
    >
      {/* Header */}
      <div className="mb-2 flex items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-1.5">
          <p className="truncate text-xs font-semibold">{target.title}</p>
          {loadingState ? (
            <Loader2 className="h-3 w-3 shrink-0 animate-spin text-muted-foreground" />
          ) : status ? (
            <span
              className={cn(
                'shrink-0 rounded-full px-1.5 py-0.5 text-[10px] font-semibold',
                status === 'completed'
                  ? `bg-${accent}-100 text-${accent}-700`
                  : 'bg-muted text-muted-foreground'
              )}
            >
              {status === 'completed' ? 'Vu' : 'À voir'}
            </span>
          ) : null}
        </div>
        <button
          type="button"
          aria-label="Fermer"
          onClick={(e) => {
            e.preventDefault()
            e.stopPropagation()
            onClose()
          }}
          className="shrink-0 rounded-md p-0.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>

      {/*
        Status actions — the two states are mutually exclusive:
        - no status  → only "À voir"
        - "à voir"   → only "Vu"
        - "vu"       → only "Revoir" (moves back to "à voir")
        The menu stays open after a press; it closes on outside click, Escape,
        the X button, or when another card's menu becomes active.
      */}
      <div className="flex items-center gap-1.5">
        {status === null ? (
          <button
            type="button"
            role="menuitem"
            disabled={busy}
            onClick={(e) => {
              e.preventDefault()
              e.stopPropagation()
              void setLibraryStatus('backlog')
            }}
            className="flex flex-1 items-center justify-center gap-1.5 rounded-lg border px-2 py-1.5 text-xs font-medium transition-colors hover:bg-muted/60 disabled:opacity-50"
          >
            {busy ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <BookmarkPlus className="h-3.5 w-3.5" />
            )}
            À voir
          </button>
        ) : status === 'backlog' ? (
          <button
            type="button"
            role="menuitem"
            disabled={busy}
            onClick={(e) => {
              e.preventDefault()
              e.stopPropagation()
              void setLibraryStatus('completed')
            }}
            className="flex flex-1 items-center justify-center gap-1.5 rounded-lg border px-2 py-1.5 text-xs font-medium transition-colors hover:bg-muted/60 disabled:opacity-50"
          >
            {busy ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Eye className="h-3.5 w-3.5" />
            )}
            Vu
          </button>
        ) : (
          <button
            type="button"
            role="menuitem"
            disabled={busy}
            onClick={(e) => {
              e.preventDefault()
              e.stopPropagation()
              void setLibraryStatus('backlog')
            }}
            className={cn(
              'flex flex-1 items-center justify-center gap-1.5 rounded-lg border px-2 py-1.5 text-xs font-medium transition-colors disabled:opacity-50',
              `border-${accent}-300 bg-${accent}-50 text-${accent}-700`
            )}
          >
            {busy ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <RotateCcw className="h-3.5 w-3.5" />
            )}
            Revoir
          </button>
        )}

        {status && (
          <button
            type="button"
            role="menuitem"
            aria-label="Retirer de ma bibliothèque"
            disabled={busy}
            onClick={(e) => {
              e.preventDefault()
              e.stopPropagation()
              void removeStatus()
            }}
            className="flex shrink-0 items-center justify-center rounded-lg border px-2 py-1.5 text-red-600 transition-colors hover:bg-red-50 disabled:opacity-50"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        )}
      </div>

      {/* Quick rating — only available once the item is marked as "vu". */}
      {canRate ? (
        <div className="mt-2 flex items-center justify-between gap-2">
          <div className="flex items-center gap-0.5">
            {[1, 2, 3, 4, 5].map((star) => {
              const full = star <= Math.floor(displayRating)
              const half = !full && star === Math.ceil(displayRating) && displayRating % 1 === 0.5
              return (
                <div key={star} className="relative h-5 w-5">
                  <Star className="h-5 w-5 fill-muted text-muted-foreground" />
                  {(full || half) && (
                    <div className={cn('absolute inset-0 overflow-hidden', half ? 'w-1/2' : 'w-full')}>
                      <Star className={cn('h-5 w-5', `fill-${accent}-500 text-${accent}-500`)} />
                    </div>
                  )}
                  <button
                    type="button"
                    role="menuitem"
                    aria-label={`${star - 0.5} étoiles`}
                    disabled={busy}
                    className="absolute inset-y-0 left-0 w-1/2 focus:outline-none disabled:cursor-not-allowed"
                    onMouseEnter={() => setHovered(star - 0.5)}
                    onMouseLeave={() => setHovered(0)}
                    onClick={(e) => {
                      e.preventDefault()
                      e.stopPropagation()
                      void submitRating(star - 0.5)
                    }}
                  />
                  <button
                    type="button"
                    role="menuitem"
                    aria-label={`${star} étoiles`}
                    disabled={busy}
                    className="absolute inset-y-0 right-0 w-1/2 focus:outline-none disabled:cursor-not-allowed"
                    onMouseEnter={() => setHovered(star)}
                    onMouseLeave={() => setHovered(0)}
                    onClick={(e) => {
                      e.preventDefault()
                      e.stopPropagation()
                      void submitRating(star)
                    }}
                  />
                </div>
              )
            })}
          </div>
          {rating > 0 ? (
            <button
              type="button"
              role="menuitem"
              disabled={busy}
              onClick={(e) => {
                e.preventDefault()
                e.stopPropagation()
                void removeRating()
              }}
              className={cn('text-[11px] font-semibold tabular-nums hover:underline disabled:opacity-50', `text-${accent}-600`)}
            >
              {rating % 1 === 0 ? rating : rating.toFixed(1)}/5 · Effacer
            </button>
          ) : (
            <span className="text-[11px] text-muted-foreground">Note</span>
          )}
        </div>
      ) : (
        <p className="mt-2 text-[11px] text-muted-foreground">
          Marque comme « Vu » pour noter.
        </p>
      )}

      {error && <p className="mt-1.5 text-[11px] text-red-600">{error}</p>}
    </div>
  )
}
