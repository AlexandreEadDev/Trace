'use client'

import { useCallback, useRef } from 'react'

interface LongPressOptions {
  /** Delay in ms before the long press fires. Default: 500. */
  delay?: number
  /** Movement tolerance in px before the press is cancelled. Default: 10. */
  moveTolerance?: number
}

interface LongPressHandlers {
  onPointerDown: (e: React.PointerEvent) => void
  onPointerMove: (e: React.PointerEvent) => void
  onPointerUp: (e: React.PointerEvent) => void
  onPointerLeave: (e: React.PointerEvent) => void
  onPointerCancel: (e: React.PointerEvent) => void
  onContextMenu: (e: React.MouseEvent) => void
}

/**
 * Detects a touch long-press and a right-click (context menu) on an element.
 *
 * - Touch: fires `onLongPress` after `delay` ms without significant movement.
 * - Mouse: fires `onLongPress` on right-click (contextmenu event).
 *
 * The returned handlers should be spread onto the target element. When the
 * long press fires, the native context menu is prevented and the default
 * click navigation is suppressed via `onClickCapture` on the consumer side.
 */
export function useLongPress(
  onLongPress: (position: { x: number; y: number }) => void,
  options: LongPressOptions = {}
): LongPressHandlers {
  const { delay = 500, moveTolerance = 10 } = options

  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const startRef = useRef<{ x: number; y: number } | null>(null)
  const firedRef = useRef(false)

  const clear = useCallback(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current)
      timerRef.current = null
    }
    startRef.current = null
  }, [])

  const onPointerDown = useCallback(
    (e: React.PointerEvent) => {
      // Only handle touch/pen here; mouse right-click is handled by onContextMenu.
      if (e.pointerType === 'mouse') return
      firedRef.current = false
      startRef.current = { x: e.clientX, y: e.clientY }
      const { clientX, clientY } = e
      timerRef.current = setTimeout(() => {
        firedRef.current = true
        onLongPress({ x: clientX, y: clientY })
      }, delay)
    },
    [delay, onLongPress]
  )

  const onPointerMove = useCallback(
    (e: React.PointerEvent) => {
      if (!startRef.current) return
      const dx = Math.abs(e.clientX - startRef.current.x)
      const dy = Math.abs(e.clientY - startRef.current.y)
      if (dx > moveTolerance || dy > moveTolerance) clear()
    },
    [clear, moveTolerance]
  )

  const onPointerUp = useCallback(() => {
    clear()
  }, [clear])

  const onPointerLeave = useCallback(() => {
    clear()
  }, [clear])

  const onPointerCancel = useCallback(() => {
    clear()
  }, [clear])

  const onContextMenu = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault()
      firedRef.current = true
      onLongPress({ x: e.clientX, y: e.clientY })
    },
    [onLongPress]
  )

  return {
    onPointerDown,
    onPointerMove,
    onPointerUp,
    onPointerLeave,
    onPointerCancel,
    onContextMenu,
  }
}
