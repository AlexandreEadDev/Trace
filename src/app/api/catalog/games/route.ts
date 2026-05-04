import { type NextRequest, NextResponse } from 'next/server'
import { searchGames as rawgSearch, getTrendingGames, hasRawgKey } from '@/lib/catalog/rawg'
import { searchGames as ftgSearch, getTrendingGames as ftgTrending } from '@/lib/catalog/freetogame'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams.get('q')
  const genre = req.nextUrl.searchParams.get('genre')
  const page = Math.max(1, Number(req.nextUrl.searchParams.get('page') ?? '1'))
  try {
    if (hasRawgKey()) {
      const result = q
        ? await rawgSearch(q, 24, page, genre ?? undefined)
        : await getTrendingGames(24, page, genre ?? undefined)
      return NextResponse.json(result)
    }
    // Fallback: FreeToGame (no API key needed, no pagination)
    const items = q ? await ftgSearch(q) : await ftgTrending()
    return NextResponse.json({ items, hasMore: false })
  } catch {
    return NextResponse.json({ items: [], hasMore: false })
  }
}
