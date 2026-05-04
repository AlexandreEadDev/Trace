/**
 * Shared genre taxonomy for catalog browsing and recommendations.
 * The `label` field is the value sent to the catalog API (`?genre=<label>`),
 * the `matches` field is a list of normalized substrings used to recognize
 * raw genre strings coming from heterogeneous external sources (TMDB, RAWG, Jikan…).
 */
export interface GenreDef {
  label: string
  matches: string[]
}

export type CatalogMode = 'book' | 'game' | 'movie'

export const BOOK_GENRES: GenreDef[] = [
  { label: 'Roman', matches: ['fiction', 'novel', 'roman', 'literary'] },
  { label: 'Fantasy', matches: ['fantasy', 'fantastique', 'fantaisie'] },
  { label: 'Science-Fiction', matches: ['science fiction', 'sci-fi', 'science-fiction'] },
  { label: 'Thriller / Policier', matches: ['thriller', 'mystery', 'crime', 'policier', 'detective'] },
  { label: 'Romance', matches: ['romance', 'love stories'] },
  { label: 'Biographie', matches: ['biography', 'memoir', 'autobiograph', 'biographie'] },
  { label: 'Histoire', matches: ['history', 'historical', 'histoire'] },
  { label: 'Horreur', matches: ['horror', 'horreur'] },
  { label: 'Jeunesse', matches: ['young adult', 'juvenile', 'children', 'jeunesse'] },
  { label: 'Humour', matches: ['humor', 'humour', 'comedy', 'comic'] },
]

export const GAME_GENRES: GenreDef[] = [
  { label: 'Action', matches: ['action'] },
  { label: 'RPG', matches: ['rpg', 'role-playing', 'role playing'] },
  { label: 'FPS / TPS', matches: ['shooter', 'fps', 'tps'] },
  { label: 'Stratégie', matches: ['strategy', 'stratégie'] },
  { label: 'Aventure', matches: ['adventure', 'aventure'] },
  { label: 'Sports', matches: ['sports', 'sport', 'racing', 'course'] },
  { label: 'Puzzle', matches: ['puzzle'] },
  { label: 'Simulation', matches: ['simulation'] },
  { label: 'Plateforme', matches: ['platform', 'platformer', 'plateforme'] },
  { label: 'Horreur', matches: ['horror', 'horreur'] },
  { label: 'Indie', matches: ['indie'] },
  { label: 'Arcade', matches: ['arcade'] },
  { label: 'MMO', matches: ['mmo', 'massively', 'mmorpg'] },
  { label: 'Combat', matches: ['fighting', 'combat'] },
]

export const MOVIE_GENRES: GenreDef[] = [
  { label: 'Action', matches: ['action'] },
  { label: 'Comédie', matches: ['comedy', 'comédie'] },
  { label: 'Drame', matches: ['drama', 'drame'] },
  { label: 'Science-Fiction', matches: ['science fiction', 'sci-fi', 'science-fiction'] },
  { label: 'Animation', matches: ['animation', 'animé', 'anime', 'animated'] },
  { label: 'Horreur', matches: ['horror', 'horreur'] },
  { label: 'Romance', matches: ['romance'] },
  { label: 'Thriller', matches: ['thriller'] },
  { label: 'Documentaire', matches: ['documentary', 'documentaire'] },
  { label: 'Aventure', matches: ['adventure', 'aventure'] },
  { label: 'Fantaisie', matches: ['fantasy', 'fantaisie', 'fantastique'] },
  { label: 'Crime / Policier', matches: ['crime', 'policier', 'detective'] },
  { label: 'Famille', matches: ['family', 'famille'] },
  { label: 'Historique', matches: ['history', 'historical', 'historique', 'histoire', 'war', 'guerre'] },
  { label: 'Mystère', matches: ['mystery', 'mystère', 'mystere'] },
  { label: 'Musical', matches: ['music', 'musical'] },
  { label: 'Western', matches: ['western'] },
]

export const GENRE_LISTS_BY_MODE: Record<CatalogMode, GenreDef[]> = {
  book: BOOK_GENRES,
  game: GAME_GENRES,
  movie: MOVIE_GENRES,
}

function normalize(s: string): string {
  return s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
}

/**
 * Map a raw item genre string (e.g. "Science Fiction", "Aventure", "Role-playing")
 * to the canonical catalog label. Returns null when no genre def matches.
 */
export function mapGenreToLabel(rawGenre: string, mode: CatalogMode): string | null {
  if (!rawGenre) return null
  const norm = normalize(rawGenre)
  for (const def of GENRE_LISTS_BY_MODE[mode]) {
    if (def.matches.some((m) => norm.includes(normalize(m)))) {
      return def.label
    }
  }
  return null
}
