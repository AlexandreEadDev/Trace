import { type NextRequest, NextResponse } from 'next/server'
import { getTrendingManga, searchManga } from '@/lib/catalog/jikan'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams.get('q')
  const genre = req.nextUrl.searchParams.get('genre')
  const page = Math.max(1, Number(req.nextUrl.searchParams.get('page') ?? '1'))
  try {
    const result = q
      ? await searchManga(q, 24, page, genre ?? undefined)
      : await getTrendingManga(24, page, genre ?? undefined)
    return NextResponse.json(result)
  } catch {
    return NextResponse.json({ items: [], hasMore: false })
  }
}
