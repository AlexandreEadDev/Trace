'use client'

import { useState } from 'react'
import { cn } from '@/lib/utils'

interface ExpandableTextProps {
  text: string
  className?: string
}

export function ExpandableText({ text, className }: ExpandableTextProps) {
  const [expanded, setExpanded] = useState(false)

  // Strip [Source] footnotes common in Open Library descriptions
  const clean = text.replace(/\s*\[.*?\]\s*/g, ' ').trim()

  return (
    <div className={cn('space-y-1', className)}>
      <p
        className={cn(
          'text-sm text-foreground/80 leading-relaxed whitespace-pre-line',
          !expanded && 'line-clamp-4'
        )}
      >
        {clean}
      </p>
      {clean.length > 280 && (
        <button
          onClick={() => setExpanded((v) => !v)}
          className="text-xs font-medium text-muted-foreground hover:text-foreground transition-colors underline underline-offset-2"
        >
          {expanded ? 'Voir moins' : 'Voir plus'}
        </button>
      )}
    </div>
  )
}
