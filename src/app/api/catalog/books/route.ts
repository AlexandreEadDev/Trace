import { type NextRequest, NextResponse } from 'next/server'
import { searchBooks, getTrendingBooks } from '@/lib/catalog/openlibrary'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams.get('q')
  try {
    const items = q ? await searchBooks(q) : await getTrendingBooks()
    return NextResponse.json(items)
  } catch {
    return NextResponse.json([], { status: 500 })
  }
}
