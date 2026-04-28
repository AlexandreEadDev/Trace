import { type NextRequest, NextResponse } from 'next/server'
import { searchGames as rawgSearch, getTrendingGames, hasRawgKey } from '@/lib/catalog/rawg'
import { searchGames as ftgSearch, getTrendingGames as ftgTrending } from '@/lib/catalog/freetogame'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams.get('q')
  try {
    if (hasRawgKey()) {
      const items = q ? await rawgSearch(q) : await getTrendingGames()
      return NextResponse.json(items)
    }
    // Fallback: FreeToGame (free-to-play only, no API key needed)
    const items = q ? await ftgSearch(q) : await ftgTrending()
    return NextResponse.json(items)
  } catch {
    return NextResponse.json([], { status: 500 })
  }
}
