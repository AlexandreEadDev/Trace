'use client'

import { createContext, useContext, useEffect, useState } from 'react'
import type { ItemType } from '@/types'

// Manga is an ItemType (for DB storage) but not a navigation mode — it is
// merged with the 'book' mode across the app.
export type NavMode = 'book' | 'game' | 'movie'
type Accent = 'amber' | 'indigo' | 'rose'

interface ModeContextValue {
  mode: NavMode
  setMode: (mode: NavMode) => void
  accent: Accent
  accentHex: string
}

const ModeContext = createContext<ModeContextValue | null>(null)

const ACCENT_MAP: Record<NavMode, Accent> = {
  book: 'amber',
  game: 'indigo',
  movie: 'rose',
}
const HEX_MAP: Record<NavMode, string> = {
  book: '#D97706',
  game: '#4F46E5',
  movie: '#E11D48',
}

export function ModeProvider({ children }: { children: React.ReactNode }) {
  const [mode, setModeState] = useState<NavMode>('book')

  useEffect(() => {
    const saved = localStorage.getItem('trace-mode') as NavMode | null
    if (saved === 'book' || saved === 'game' || saved === 'movie') {
      setModeState(saved)
    }
  }, [])

  const setMode = (m: NavMode) => {
    setModeState(m)
    localStorage.setItem('trace-mode', m)
  }

  return (
    <ModeContext.Provider
      value={{
        mode,
        setMode,
        accent: ACCENT_MAP[mode],
        accentHex: HEX_MAP[mode],
      }}
    >
      {children}
    </ModeContext.Provider>
  )
}

export function useMode() {
  const ctx = useContext(ModeContext)
  if (!ctx) throw new Error('useMode must be used inside ModeProvider')
  return ctx
}
