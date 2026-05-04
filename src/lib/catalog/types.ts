export type CatalogSource = 'openlibrary' | 'googlebooks' | 'freetogame' | 'rawg' | 'tmdb' | 'jikan'

export interface CatalogItem {
  externalSource: CatalogSource
  externalId: string
  title: string
  type: 'book' | 'game' | 'movie' | 'manga'
  genre: string | null
  /** All genre/demographic tags from the source (used for filter matching) */
  genres?: string[]
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
  /** Synopsis / back-cover description (books, manga) */
  description?: string | null
  /** Manga publication status */
  mangaStatus?: 'ongoing' | 'finished' | null
  /** Total volume count (manga) */
  volumes?: number | null
  /** Total chapter count (manga) */
  chapters?: number | null
  /** ISO date string of first publication (manga) */
  publishedFrom?: string | null
  /** ISO date string of last publication (manga) */
  publishedTo?: string | null
  /** TMDB collection id for movies */
  collectionId?: string | null
  /** TMDB collection name for movies */
  collectionName?: string | null
  /** Google Books series id */
  seriesId?: string | null
  /** Human-readable series name (Google Books shortSeriesBookTitle) */
  seriesTitle?: string | null
  /**
   * Composite popularity score 0–100 computed from external signals
   * (added count, rating, metacritic, vote count…). Higher = more popular.
   * Used for default catalog sort before Trace click data is available.
   */
  popularityScore?: number
  /** YouTube trailer key for movies (use https://www.youtube.com/embed/{key}) */
  trailerKey?: string | null
  /** Gameplay screenshots URLs (games) */
  screenshots?: string[]
  /** Short gameplay clip URL (games via RAWG) */
  clipUrl?: string | null
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
  const valid: CatalogSource[] = ['openlibrary', 'googlebooks', 'freetogame', 'rawg', 'tmdb', 'jikan']
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
