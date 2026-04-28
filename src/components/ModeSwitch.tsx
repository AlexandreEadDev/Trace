'use client'

import { BookOpen, Gamepad2, Film } from 'lucide-react'
import { useMode } from '@/context/ModeContext'
import { cn } from '@/lib/utils'
import type { ItemType } from '@/types'

const MODES: {
  value: ItemType
  label: string
  Icon: React.ComponentType<{ className?: string }>
  activeClass: string
}[] = [
  { value: 'book', label: 'Livres', Icon: BookOpen, activeClass: 'bg-amber-600' },
  { value: 'game', label: 'Jeux', Icon: Gamepad2, activeClass: 'bg-indigo-600' },
  { value: 'movie', label: 'Films', Icon: Film, activeClass: 'bg-rose-600' },
]

export function ModeSwitch() {
  const { mode, setMode } = useMode()

  return (
    <div
      role="group"
      aria-label="Mode de navigation"
      className="flex items-center justify-center gap-1 rounded-full bg-muted p-1"
    >
      {MODES.map(({ value, label, Icon, activeClass }) => (
        <button
          key={value}
          onClick={() => setMode(value)}
          className={cn(
            'flex items-center justify-center gap-1.5 rounded-full px-2.5 py-1.5 text-xs font-medium transition-all duration-250 sm:px-4 sm:text-sm',
            mode === value
              ? `${activeClass} text-white shadow-sm scale-[1.03]`
              : 'text-muted-foreground hover:text-foreground'
          )}
        >
          <Icon className="h-4 w-4 shrink-0" />
          <span className="hidden sm:inline">{label}</span>
        </button>
      ))}
    </div>
  )
}
