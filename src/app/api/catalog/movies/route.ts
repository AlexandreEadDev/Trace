import { type NextRequest, NextResponse } from 'next/server'
import { searchMovies, getTrendingMovies, hasTmdbKey } from '@/lib/catalog/tmdb'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams.get('q')
  const page = Math.max(1, Number(req.nextUrl.searchParams.get('page') ?? '1'))
  if (!hasTmdbKey()) {
    return NextResponse.json({ items: [], hasMore: false })
  }
  try {
    const result = q ? await searchMovies(q, 24, page) : await getTrendingMovies(24, page)
    return NextResponse.json(result)
  } catch {
    return NextResponse.json({ items: [], hasMore: false })
  }
}
