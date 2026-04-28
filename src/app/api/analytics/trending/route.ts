import { type NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'

// Prefixes for each content type
const TYPE_PREFIXES: Record<string, string[]> = {
  book: ['googlebooks__', 'openlibrary__'],
  game: ['rawg__', 'freetogame__'],
  movie: ['tmdb__'],
}

export async function GET(req: NextRequest) {
  const type = req.nextUrl.searchParams.get('type') ?? ''
  const limit = Math.min(200, Math.max(10, Number(req.nextUrl.searchParams.get('limit') ?? '100')))

  try {
    const supabase = await createClient()

    // Fetch recent clicks (last 90 days for relevance, up to 5000 rows)
    const since = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString()
    const { data, error } = await supabase
      .from('item_clicks')
      .select('item_id')
      .gte('created_at', since)
      .limit(5000)

    if (error || !data) return NextResponse.json([])

    // Count clicks per item_id
    const counts = new Map<string, number>()
    for (const row of data) {
      const id: string = row.item_id
      if (!id) continue
      // Filter by type if requested
      if (type && TYPE_PREFIXES[type]) {
        const prefixes = TYPE_PREFIXES[type]
        if (!prefixes.some((p) => id.startsWith(p))) continue
      }
      counts.set(id, (counts.get(id) ?? 0) + 1)
    }

    // Sort by count descending, return top N
    const sorted = Array.from(counts.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, limit)
      .map(([id, count]) => ({ id, count }))

    return NextResponse.json(sorted)
  } catch {
    return NextResponse.json([])
  }
}
