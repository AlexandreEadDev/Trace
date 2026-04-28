export type CatalogSource = 'openlibrary' | 'googlebooks' | 'freetogame' | 'rawg' | 'tmdb'

export interface CatalogItem {
  externalSource: CatalogSource
  externalId: string
  title: string
  type: 'book' | 'game' | 'movie'
  genre: string | null
  coverUrl: string | null
  releaseYear: number | null
  authors?: string[]
  /** For games: avg playtime in hours × 60. For movies: runtime in minutes. */
  durationMinutes?: number | null
  /** Metacritic score 0-100 (games via RAWG) */
  metacritic?: number | null
  /** TMDB vote average 0-10 (movies) */
  tmdbScore?: number | null
  /** TMDB vote count (movies) */
  tmdbVoteCount?: number | null
  /**
   * Composite popularity score 0–100 computed from external signals
   * (added count, rating, metacritic, vote count…). Higher = more popular.
   * Used for default catalog sort before Trace click data is available.
   */
  popularityScore?: number
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
  const valid: CatalogSource[] = ['openlibrary', 'googlebooks', 'freetogame', 'rawg', 'tmdb']
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
    duration_minutes: item.durationMinutes ?? null,
    external_source: item.externalSource,
    external_id: item.externalId,
  }
}
