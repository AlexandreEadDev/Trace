'use client'

import { createContext, useContext, useEffect, useState } from 'react'
import type { ItemType } from '@/types'

type Mode = ItemType
type Accent = 'amber' | 'indigo' | 'rose'

interface ModeContextValue {
  mode: Mode
  setMode: (mode: Mode) => void
  accent: Accent
  accentHex: string
}

const ModeContext = createContext<ModeContextValue | null>(null)

const ACCENT_MAP: Record<Mode, Accent> = {
  book: 'amber',
  game: 'indigo',
  movie: 'rose',
}
const HEX_MAP: Record<Mode, string> = {
  book: '#D97706',
  game: '#4F46E5',
  movie: '#E11D48',
}

export function ModeProvider({ children }: { children: React.ReactNode }) {
  const [mode, setModeState] = useState<Mode>('book')

  useEffect(() => {
    const saved = localStorage.getItem('trace-mode') as Mode | null
    if (saved === 'book' || saved === 'game' || saved === 'movie') {
      setModeState(saved)
    }
  }, [])

  const setMode = (m: Mode) => {
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
