import { type NextRequest, NextResponse } from 'next/server'
import { getTvSeasonsAndEpisodes } from '@/lib/catalog/tmdb-tv'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  const externalId = req.nextUrl.searchParams.get('external_id')
  if (!externalId) return NextResponse.json({ error: 'external_id required' }, { status: 400 })

  const seasons = await getTvSeasonsAndEpisodes(externalId)
  return NextResponse.json(seasons)
}
