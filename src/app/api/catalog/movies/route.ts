import { type NextRequest, NextResponse } from 'next/server'
import { searchMovies, getTrendingMovies, hasTmdbKey } from '@/lib/catalog/tmdb'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams.get('q')
  if (!hasTmdbKey()) {
    return NextResponse.json(
      { error: 'TMDB_API_KEY not configured', items: [] },
      { status: 503 }
    )
  }
  try {
    const items = q ? await searchMovies(q) : await getTrendingMovies()
    return NextResponse.json(items)
  } catch {
    return NextResponse.json([], { status: 500 })
  }
}
