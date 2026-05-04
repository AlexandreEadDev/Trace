import { type NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'

const TYPE_PREFIXES: Record<string, string[]> = {
  book: ['googlebooks__'],
  manga: ['jikan__'],
  game: ['rawg__', 'freetogame__'],
  movie: ['tmdb__'],
}

const DAY_MS = 24 * 60 * 60 * 1000

/** Recency weight: clicks within last 7 days count 3, last 30 days count 2, older 1. */
function recencyWeight(clickedAtMs: number, nowMs: number): number {
  const ageDays = (nowMs - clickedAtMs) / DAY_MS
  if (ageDays <= 7) return 3
  if (ageDays <= 30) return 2
  return 1
}

export async function GET(req: NextRequest) {
  const type = req.nextUrl.searchParams.get('type') ?? ''
  const limit = Math.min(200, Math.max(10, Number(req.nextUrl.searchParams.get('limit') ?? '100')))

  try {
    const supabase = await createClient()

    // Pull recent clicks (last 90 days) ordered by recency. Up to 5000 rows.
    const since = new Date(Date.now() - 90 * DAY_MS).toISOString()
    const { data, error } = await supabase
      .from('item_clicks')
      .select('item_id, created_at')
      .gte('created_at', since)
      .order('created_at', { ascending: false })
      .limit(5000)

    if (error) {
      console.error('[api/analytics/trending] supabase:', error.message, error)
      return NextResponse.json([])
    }
    if (!data) return NextResponse.json([])

    // Filtrer par préfixe d’id en JS : `.or('item_id.like....%')` casse souvent PostgREST
    // (underscores LIKE, encodage `%`) et peut provoquer des 500 côté API.
    const prefixes = type && TYPE_PREFIXES[type] ? TYPE_PREFIXES[type] : null
    const rows = prefixes
      ? data.filter((row) => {
          const id = row.item_id
          return typeof id === 'string' && prefixes.some((p) => id.startsWith(p))
        })
      : data

    const now = Date.now()
    const weighted = new Map<string, number>()
    const rawCounts = new Map<string, number>()

    for (const row of rows) {
      const id: string = row.item_id
      if (!id) continue
      const clickedAt = row.created_at ? new Date(row.created_at).getTime() : now
      const weight = recencyWeight(clickedAt, now)
      weighted.set(id, (weighted.get(id) ?? 0) + weight)
      rawCounts.set(id, (rawCounts.get(id) ?? 0) + 1)
    }

    // Sort by weighted score desc, tie-breaker: raw click count desc, then id asc.
    const sorted = Array.from(weighted.entries())
      .sort(([idA, scoreA], [idB, scoreB]) => {
        if (scoreB !== scoreA) return scoreB - scoreA
        const rawDiff = (rawCounts.get(idB) ?? 0) - (rawCounts.get(idA) ?? 0)
        if (rawDiff !== 0) return rawDiff
        return idA.localeCompare(idB)
      })
      .slice(0, limit)
      .map(([id]) => ({ id, count: rawCounts.get(id) ?? 0 }))

    return NextResponse.json(sorted)
  } catch {
    return NextResponse.json([])
  }
}
