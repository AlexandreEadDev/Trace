'use client'

import { createContext, useContext, useEffect, useState } from 'react'

export type NavMode = 'book' | 'manga' | 'game' | 'movie'
export type ModeAccent = 'amber' | 'violet' | 'indigo' | 'rose'

interface ModeContextValue {
  mode: NavMode
  setMode: (mode: NavMode) => void
  accent: ModeAccent
  accentHex: string
}

const ModeContext = createContext<ModeContextValue | null>(null)

const ACCENT_MAP: Record<NavMode, ModeAccent> = {
  book: 'amber',
  manga: 'violet',
  game: 'indigo',
  movie: 'rose',
}
const HEX_MAP: Record<NavMode, string> = {
  book: '#D97706',
  manga: '#7C3AED',
  game: '#4F46E5',
  movie: '#E11D48',
}

export function ModeProvider({ children }: { children: React.ReactNode }) {
  const [mode, setModeState] = useState<NavMode>('book')

  useEffect(() => {
    const saved = localStorage.getItem('trace-mode') as NavMode | null
    if (saved === 'book' || saved === 'manga' || saved === 'game' || saved === 'movie') {
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
