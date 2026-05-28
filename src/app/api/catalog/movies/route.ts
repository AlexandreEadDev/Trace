import { type NextRequest, NextResponse } from 'next/server'
import { searchMovies, getTrendingMovies, discoverMoviesByGenre, hasTmdbKey } from '@/lib/catalog/tmdb'

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
    let result
    if (q) {
      result = await searchMovies(q, 24, page)
    } else if (genre) {
      result = await discoverMoviesByGenre(genre, 24, page, years)
    } else {
      result = await getTrendingMovies(24, page, years)
    }
    return NextResponse.json(result)
  } catch {
    return NextResponse.json({ items: [], hasMore: false })
  }
}
