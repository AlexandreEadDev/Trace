import { type NextRequest, NextResponse } from 'next/server'
import { getMangaVolumes } from '@/lib/catalog/jikan'

export const dynamic = 'force-dynamic'

// GET /api/manga/volumes/list?external_id=...&total=...&chapters=...
// Returns volume info from Jikan for the given manga external (MAL) id.
export async function GET(req: NextRequest) {
  const externalId = req.nextUrl.searchParams.get('external_id')
  if (!externalId) return NextResponse.json({ error: 'external_id required' }, { status: 400 })

  const totalStr = req.nextUrl.searchParams.get('total')
  const total = totalStr ? Number.parseInt(totalStr, 10) : null

  const chaptersStr = req.nextUrl.searchParams.get('chapters')
  const chapters = chaptersStr ? Number.parseInt(chaptersStr, 10) : null
  const fallbackCover = req.nextUrl.searchParams.get('fallback_cover')

  const volumes = await getMangaVolumes(
    externalId,
    total !== null && !Number.isNaN(total) ? total : null,
    chapters !== null && !Number.isNaN(chapters) ? chapters : null,
    fallbackCover,
  )
  return NextResponse.json(volumes)
}
