import type { CatalogItem, CatalogSource } from '@/lib/catalog/types'
import { getBookByExternalId as getOlBook } from '@/lib/catalog/openlibrary'
import { getBookByExternalId as getGbBook } from '@/lib/catalog/googlebooks'
import { getGameByExternalId as getFtgGame } from '@/lib/catalog/freetogame'
import { getGameByExternalId as getRawgGame } from '@/lib/catalog/rawg'
import { getMovieByExternalId } from '@/lib/catalog/tmdb'
import { getMangaByExternalId } from '@/lib/catalog/jikan'

export async function resolveCatalogItem(
  source: CatalogSource,
  externalId: string
): Promise<CatalogItem | null> {
  switch (source) {
    case 'openlibrary':
      return getOlBook(externalId)
    case 'googlebooks':
      return getGbBook(externalId)
    case 'freetogame':
      return getFtgGame(externalId)
    case 'rawg':
      return getRawgGame(externalId)
    case 'tmdb':
      return getMovieByExternalId(externalId)
    case 'jikan':
      return getMangaByExternalId(externalId)
    default:
      return null
  }
}
