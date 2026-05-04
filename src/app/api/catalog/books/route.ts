import { type NextRequest, NextResponse } from 'next/server'
import { getTrendingBooks } from '@/lib/catalog/openlibrary'
import { searchBooks } from '@/lib/catalog/googlebooks'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams.get('q')
  const genre = req.nextUrl.searchParams.get('genre')
  const page = Math.max(1, Number(req.nextUrl.searchParams.get('page') ?? '1'))
  try {
    if (q) {
      // Search query: pass genre as filter alongside query
      const result = await searchBooks(q, 24, page, genre ?? undefined)
      return NextResponse.json(result)
    }

    if (genre) {
      // Genre browse: Google Books subject search (OL trending doesn't support genre filtering)
      const result = await searchBooks('', 24, page, genre)
      return NextResponse.json(result)
    }

    // Trending: race OL (cached) and Google Books fallback in parallel.
    // OL result is preferred (real-time popularity); Google Books is the safety net.
    const gbFallback = searchBooks('popular fiction novels', 24, page)
    const olResult = await getTrendingBooks(24, page)

    if (olResult.items.length > 0) {
      return NextResponse.json(olResult)
    }

    return NextResponse.json(await gbFallback)
  } catch {
    return NextResponse.json({ items: [], hasMore: false })
  }
}
