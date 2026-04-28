import { type NextRequest, NextResponse } from 'next/server'
import { getTrendingBooks } from '@/lib/catalog/openlibrary'
import { searchBooks } from '@/lib/catalog/googlebooks'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams.get('q')
  const page = Math.max(1, Number(req.nextUrl.searchParams.get('page') ?? '1'))
  try {
    if (q) {
      const result = await searchBooks(q, 24, page)
      return NextResponse.json(result)
    }

    // Trending: try Open Library first, fall back to Google Books popular titles
    const olResult = await getTrendingBooks(24, page)
    if (olResult.items.length > 0) {
      return NextResponse.json(olResult)
    }

    // OL timed out or returned nothing — fall back to Google Books popular fiction
    const fallback = await searchBooks('popular fiction novels', 24, page)
    return NextResponse.json(fallback)
  } catch {
    return NextResponse.json({ items: [], hasMore: false })
  }
}
