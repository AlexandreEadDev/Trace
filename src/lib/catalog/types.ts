export type CatalogSource = 'openlibrary' | 'freetogame' | 'rawg' | 'tmdb'

export interface CatalogItem {
  externalSource: CatalogSource
  externalId: string
  title: string
  type: 'book' | 'game' | 'movie'
  genre: string | null
  coverUrl: string | null
  releaseYear: number | null
  authors?: string[]
}

export function encodeCatalogId(source: CatalogSource, id: string): string {
  return `${source}__${encodeURIComponent(id)}`
}

export function decodeCatalogId(
  encoded: string
): { source: CatalogSource; id: string } | null {
  const idx = encoded.indexOf('__')
  if (idx === -1) return null
  const source = encoded.slice(0, idx) as CatalogSource
  const id = decodeURIComponent(encoded.slice(idx + 2))
  const valid: CatalogSource[] = ['openlibrary', 'freetogame', 'rawg', 'tmdb']
  if (!valid.includes(source)) return null
  return { source, id }
}

export function catalogItemToSupabaseRow(item: CatalogItem) {
  return {
    title: item.title,
    type: item.type,
    genre: item.genre,
    cover_url: item.coverUrl,
    release_year: item.releaseYear,
    external_source: item.externalSource,
    external_id: item.externalId,
  }
}
