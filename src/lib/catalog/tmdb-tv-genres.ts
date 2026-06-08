/**
 * TMDB TV uses a different genre taxonomy than movies (no native "Horreur" genre).
 * @see https://developer.themoviedb.org/reference/genre-tv-list
 */

/** TMDB TV genre ID → French display label */
export const TMDB_TV_GENRE_MAP: Record<number, string> = {
  10759: 'Action & Aventure',
  16: 'Animation',
  35: 'Comédie',
  80: 'Crime / Policier',
  99: 'Documentaire',
  18: 'Drame',
  10751: 'Famille',
  10762: 'Jeunesse',
  9648: 'Mystère',
  10763: 'Actualités',
  10764: 'Télé-réalité',
  10765: 'Science-Fiction & Fantastique',
  10766: 'Soap',
  10767: 'Talk-show',
  10768: 'Guerre & Politique',
  37: 'Western',
}

/** Catalog filter label → TMDB discover/tv `with_genres` */
const TV_GENRE_DISCOVER: Record<string, number> = {
  'Action': 10759,
  'Aventure': 10759,
  'Animation': 16,
  'Comédie': 35,
  'Crime / Policier': 80,
  'Documentaire': 99,
  'Drame': 18,
  'Famille': 10751,
  'Fantaisie': 10765,
  'Guerre': 10768,
  'Historique': 10768,
  'Mystère': 9648,
  'Science-Fiction': 10765,
  'Western': 37,
  'Thriller': 9648,
}

/** Catalog labels discovered via `with_keywords` (no TV genre equivalent). */
const TV_KEYWORD_DISCOVER: Record<string, number> = {
  'Horreur': 315058,
}

/** Keyword IDs / names that imply horror for display enrichment. */
const HORROR_KEYWORD_IDS = new Set([
  315058, // horror
  256183, // supernatural horror
  209568, // folk horror
  10292, // gore
])

const HORROR_KEYWORD_SUBSTRINGS = ['horror', 'horreur', 'slasher', 'lovecraft']

export function resolveTvDiscoverFilter(
  genreLabel: string,
): { withGenres?: number; withKeywords?: number } | null {
  const keyword = TV_KEYWORD_DISCOVER[genreLabel]
  if (keyword) return { withKeywords: keyword }
  const genre = TV_GENRE_DISCOVER[genreLabel]
  if (genre) return { withGenres: genre }
  return null
}

export function tvGenreIdToLabel(id: number): string | null {
  return TMDB_TV_GENRE_MAP[id] ?? null
}

export function enrichTvGenresWithKeywords(
  genres: string[],
  keywords: { id: number; name: string }[],
): string[] {
  const result = [...genres]
  const norm = (s: string) => s.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
  const hasHorrorLabel = result.some((g) => norm(g).includes('horreur'))
  const hasHorrorKeyword = keywords.some(
    (k) => HORROR_KEYWORD_IDS.has(k.id) || HORROR_KEYWORD_SUBSTRINGS.some((h) => norm(k.name).includes(h)),
  )
  if (hasHorrorKeyword && !hasHorrorLabel) {
    result.push('Horreur')
  }
  return result
}
