'use client'

import { useState, useCallback } from 'react'
import { ChevronLeft, ChevronRight, Play, X, Maximize2 } from 'lucide-react'
import { cn } from '@/lib/utils'

interface MediaEntry {
  type: 'video' | 'image'
  url: string
  thumb?: string
}

interface GameMediaProps {
  screenshots?: string[]
  clipUrl?: string | null
  title: string
}

export function GameMedia({ screenshots = [], clipUrl, title }: GameMediaProps) {
  // Trailer is rendered separately above; this gallery focuses on screenshots
  // and (optionally) the RAWG short gameplay clip.
  const media: MediaEntry[] = [
    ...(clipUrl ? [{ type: 'video' as const, url: clipUrl }] : []),
    ...screenshots.map((url) => ({ type: 'image' as const, url })),
  ]

  const [activeIdx, setActiveIdx] = useState(0)
  const [lightboxIdx, setLightboxIdx] = useState<number | null>(null)

  const goTo = useCallback((idx: number) => {
    setActiveIdx(Math.max(0, Math.min(idx, media.length - 1)))
  }, [media.length])

  const prev = () => goTo(activeIdx - 1)
  const next = () => goTo(activeIdx + 1)

  if (media.length === 0) return null

  const active = media[activeIdx]

  return (
    <div className="space-y-3">
      {/* Main display */}
      <div className="relative aspect-video w-full overflow-hidden rounded-xl bg-black group">
        {active.type === 'video' ? (
          <video
            key={active.url}
            src={active.url}
            controls
            autoPlay={false}
            className="h-full w-full object-contain"
          />
        ) : (
          <>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={active.url}
              alt={`${title} screenshot ${activeIdx + 1}`}
              className="h-full w-full object-contain"
            />
            <button
              onClick={() => setLightboxIdx(activeIdx)}
              className="absolute bottom-2 right-2 rounded-lg bg-black/50 p-1.5 text-white opacity-0 transition-opacity group-hover:opacity-100 hover:bg-black/70"
            >
              <Maximize2 className="h-4 w-4" />
            </button>
          </>
        )}

        {/* Prev / Next arrows */}
        {media.length > 1 && (
          <>
            <button
              onClick={prev}
              disabled={activeIdx === 0}
              className="absolute left-2 top-1/2 -translate-y-1/2 rounded-full bg-black/60 p-2 text-white opacity-0 transition-opacity group-hover:opacity-100 hover:bg-black/80 disabled:opacity-0"
            >
              <ChevronLeft className="h-5 w-5" />
            </button>
            <button
              onClick={next}
              disabled={activeIdx === media.length - 1}
              className="absolute right-2 top-1/2 -translate-y-1/2 rounded-full bg-black/60 p-2 text-white opacity-0 transition-opacity group-hover:opacity-100 hover:bg-black/80 disabled:opacity-0"
            >
              <ChevronRight className="h-5 w-5" />
            </button>
          </>
        )}

        {/* Counter pill */}
        {media.length > 1 && (
          <div className="absolute bottom-2 left-2 rounded-full bg-black/60 px-2 py-0.5 text-xs text-white">
            {activeIdx + 1} / {media.length}
          </div>
        )}
      </div>

      {/* Thumbnail strip */}
      {media.length > 1 && (
        <div className="flex gap-2 overflow-x-auto pb-1">
          {media.map((m, i) => (
            <button
              key={`${m.url}-${i}`}
              onClick={() => goTo(i)}
              className={cn(
                'relative h-14 w-24 shrink-0 overflow-hidden rounded-lg border-2 transition-all',
                i === activeIdx ? 'border-indigo-500 opacity-100' : 'border-transparent opacity-60 hover:opacity-90'
              )}
            >
              {m.type === 'video' ? (
                <div className="flex h-full w-full items-center justify-center bg-black">
                  <Play className="h-5 w-5 fill-white text-white" />
                </div>
              ) : (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={m.url} alt={`thumb ${i}`} className="h-full w-full object-cover" />
              )}
            </button>
          ))}
        </div>
      )}

      {/* Lightbox */}
      {lightboxIdx !== null && media[lightboxIdx]?.type === 'image' && (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center bg-black/90"
          onClick={() => setLightboxIdx(null)}
        >
          <button
            className="absolute right-4 top-4 rounded-full bg-white/10 p-2 text-white hover:bg-white/20"
            onClick={() => setLightboxIdx(null)}
          >
            <X className="h-5 w-5" />
          </button>

          <button
            onClick={(e) => { e.stopPropagation(); setLightboxIdx(Math.max(0, lightboxIdx - 1)) }}
            disabled={lightboxIdx === 0}
            className="absolute left-4 top-1/2 -translate-y-1/2 rounded-full bg-white/10 p-3 text-white hover:bg-white/20 disabled:opacity-20"
          >
            <ChevronLeft className="h-6 w-6" />
          </button>

          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={media[lightboxIdx].url}
            alt={`${title} screenshot ${lightboxIdx + 1}`}
            className="max-h-[90vh] max-w-[90vw] rounded-lg object-contain"
            onClick={(e) => e.stopPropagation()}
          />

          <button
            onClick={(e) => { e.stopPropagation(); setLightboxIdx(Math.min(media.length - 1, lightboxIdx + 1)) }}
            disabled={lightboxIdx === media.length - 1}
            className="absolute right-4 top-1/2 -translate-y-1/2 rounded-full bg-white/10 p-3 text-white hover:bg-white/20 disabled:opacity-20"
          >
            <ChevronRight className="h-6 w-6" />
          </button>

          <div className="absolute bottom-4 text-sm text-white/70">
            {lightboxIdx + 1} / {media.length}
          </div>
        </div>
      )}
    </div>
  )
}
