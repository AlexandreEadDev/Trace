'use client'

import { useCallback, useRef, useState } from 'react'
import { useLongPress } from '@/hooks/useLongPress'

interface OpenState {
  x: number
  y: number
}

interface UseCardContextMenuOptions {
  /**
   * Controlled mode: the id of the card whose menu is currently open across
   * the whole list (or `null`). When provided, only the card whose `id`
   * matches will report `open`, guaranteeing a single menu at a time.
   */
  activeId?: string | null
  /** The id of the card this hook instance belongs to (controlled mode). */
  id?: string
  /** Called when this card requests to open/close its menu (controlled mode). */
  onOpenChange?: (id: string | null) => void
}

/**
 * Manages the open/position state of a card context menu and exposes the
 * pointer handlers (long-press + right-click) to spread onto the card.
 *
 * Supports two modes:
 * - Uncontrolled (default): each card owns its own open state.
 * - Controlled: pass `activeId` + `id` + `onOpenChange` so a parent can keep
 *   only one menu open at a time across a list.
 *
 * Also suppresses the click navigation that would otherwise fire right after
 * a long press or right-click, so the menu does not conflict with the card's
 * existing `<Link>` navigation.
 */
export function useCardContextMenu(options: UseCardContextMenuOptions = {}) {
  const { activeId, id, onOpenChange } = options
  const controlled = activeId !== undefined && id !== undefined && !!onOpenChange

  const [internalOpen, setInternalOpen] = useState<OpenState | null>(null)
  const suppressClickRef = useRef(false)

  const open = controlled ? (activeId === id ? { x: 0, y: 0 } : null) : internalOpen

  const openAt = useCallback(
    (position: { x: number; y: number }) => {
      suppressClickRef.current = true
      if (controlled) {
        onOpenChange?.(id ?? null)
      } else {
        setInternalOpen(position)
      }
    },
    [controlled, onOpenChange, id]
  )

  const close = useCallback(() => {
    if (controlled) {
      onOpenChange?.(null)
    } else {
      setInternalOpen(null)
    }
  }, [controlled, onOpenChange])

  const longPressHandlers = useLongPress(openAt)

  /**
   * Attach to the card's `onClickCapture`. Prevents the click navigation that
   * would otherwise fire right after a long press or right-click.
   */
  const onClickCapture = useCallback((e: React.MouseEvent) => {
    if (suppressClickRef.current) {
      e.preventDefault()
      e.stopPropagation()
      suppressClickRef.current = false
    }
  }, [])

  return {
    open,
    openAt,
    close,
    longPressHandlers,
    onClickCapture,
  }
}
