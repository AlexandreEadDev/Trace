import { type NextRequest, NextResponse } from 'next/server'
import { searchTv, getTrendingTv, discoverTvByGenre } from '@/lib/catalog/tmdb-tv'
import { hasTmdbKey } from '@/lib/catalog/tmdb'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams.get('q')
  const genre = req.nextUrl.searchParams.get('genre')
  const page = Math.max(1, Number(req.nextUrl.searchParams.get('page') ?? '1'))
  const yearMin = req.nextUrl.searchParams.get('yearMin')
  const yearMax = req.nextUrl.searchParams.get('yearMax')
  const years = {
    yearMin: yearMin ? Number(yearMin) : undefined,
    yearMax: yearMax ? Number(yearMax) : undefined,
  }
  if (!hasTmdbKey()) {
    return NextResponse.json({ items: [], hasMore: false })
  }
  try {
    const result = q
      ? await searchTv(q, 24, page)
      : genre
        ? await discoverTvByGenre(genre, 24, page, years)
        : await getTrendingTv(24, page, years)
    return NextResponse.json(result)
  } catch {
    return NextResponse.json({ items: [], hasMore: false })
  }
}
