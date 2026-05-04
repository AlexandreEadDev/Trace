'use client'

import Link from 'next/link'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { Loader2, Search } from 'lucide-react'
import { useMode } from '@/context/ModeContext'
import type { DiscoverSearchResult } from '@/lib/discover/types'
import { discoverSearchHref } from '@/lib/discover/href'
import { cn } from '@/lib/utils'
import { Input } from '@/components/ui/input'

const DEBOUNCE_MS = 320

type SearchApiResponse = {
  query: string
  local: DiscoverSearchResult[]
  external: DiscoverSearchResult[]
  source?: string
}

export function DiscoverSearchBar() {
  const { accent } = useMode()
  const [q, setQ] = useState('')
  const [debounced, setDebounced] = useState('')
  const [loading, setLoading] = useState(false)
  const [open, setOpen] = useState(false)
  const [local, setLocal] = useState<DiscoverSearchResult[]>([])
  const [external, setExternal] = useState<DiscoverSearchResult[]>([])

  useEffect(() => {
    const t = window.setTimeout(() => setDebounced(q.trim()), DEBOUNCE_MS)
    return () => window.clearTimeout(t)
  }, [q])

  const runSearch = useCallback(async (query: string) => {
    if (query.length < 1) {
      setLocal([])
      setExternal([])
      setLoading(false)
      return
    }
    setLoading(true)
    try {
      const res = await fetch(
        `/api/discover/search?${new URLSearchParams({ q: query })}`,
        { cache: 'no-store' }
      )
      const json = (await res.json()) as SearchApiResponse
      setLocal(Array.isArray(json.local) ? json.local : [])
      setExternal(Array.isArray(json.external) ? json.external : [])
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    if (debounced.length < 1) {
      setLocal([])
      setExternal([])
      return
    }
    void runSearch(debounced)
  }, [debounced, runSearch])

  const hasResults = local.length > 0 || external.length > 0
  const showPanel = open && debounced.length > 0

  const sections = useMemo(() => {
    const out: { title: string; rows: DiscoverSearchResult[] }[] = []
    if (local.length) out.push({ title: 'Dans Trace', rows: local })
    if (external.length) out.push({ title: 'Catalogues externes', rows: external })
    return out
  }, [local, external])

  return (
    <div className="relative z-20 w-full max-w-2xl">
      <label htmlFor="discover-search" className="sr-only">
        Rechercher livres, mangas, jeux et films
      </label>
      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          id="discover-search"
          value={q}
          onChange={(e) => {
            setQ(e.target.value)
            setOpen(true)
          }}
          onFocus={() => setOpen(true)}
          onBlur={() => {
            window.setTimeout(() => setOpen(false), 180)
          }}
          placeholder="Rechercher (Trace + catalogues)…"
          autoComplete="off"
          className={cn('h-11 pl-9 pr-10', `focus-visible:ring-${accent}-500`)}
        />
        {loading && debounced.length > 0 && (
          <Loader2 className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin text-muted-foreground" />
        )}
      </div>

      {showPanel && (
        <div
          className="absolute left-0 right-0 top-full mt-1 max-h-[min(70vh,24rem)] overflow-y-auto rounded-xl border bg-popover shadow-lg"
          role="listbox"
        >
          {!loading && !hasResults && (
            <p className="px-4 py-6 text-center text-sm text-muted-foreground">Aucun résultat.</p>
          )}
          {sections.map((sec) => (
            <div key={sec.title} className="border-b last:border-b-0">
              <p
                className={cn(
                  'sticky top-0 z-10 bg-popover px-3 py-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground'
                )}
              >
                {sec.title}
              </p>
              <ul className="pb-1">
                {sec.rows.map((row) => {
                  const href = discoverSearchHref(row)
                  const sub =
                    row.communityAvg != null && row.communityAvg > 0
                      ? `Moyenne ${row.communityAvg.toFixed(1)}/5`
                      : row.kind === 'external'
                        ? 'Pas encore sur Trace'
                        : ''
                  return (
                    <li key={href}>
                      <Link
                        href={href}
                        className="flex flex-col gap-0.5 px-3 py-2.5 text-sm hover:bg-muted/80"
                        role="option"
                      >
                        <span className="font-medium leading-tight">{row.title}</span>
                        <span className="text-xs text-muted-foreground">
                          <span className="capitalize">{row.type}</span>
                          {sub ? ` · ${sub}` : ''}
                        </span>
                      </Link>
                    </li>
                  )
                })}
              </ul>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
