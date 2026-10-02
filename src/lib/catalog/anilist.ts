/**
 * AniList GraphQL API — free, no API key required.
 * Rate limit: ~90 req/min (much more generous than Jikan's 3 req/s).
 * Used as a fallback when Jikan is rate-limited or unavailable.
 *
 * Docs: https://docs.anilist.co/
 */
import type { CatalogItem } from './types'
import { fetchJson, normalizeQuery } from './http'

const ENDPOINT = 'https://graphql.anilist.co'

const LIST_TTL_MS = 10 * 60 * 1000 // 10 min
const DETAIL_TTL_MS = 30 * 60 * 1000 // 30 min

/** AniList format enum → our internal type. We only care about MANGA / ONE_SHOT. */
const MANGA_FORMATS = new Set(['MANGA', 'ONE_SHOT'])

/** AniList genre label → our French genre labels (mirrors Jikan's map). */
const ANILIST_GENRE_MAP: Record<string, string> = {
  Action: 'Action',
  Adventure: 'Aventure',
  Comedy: 'Comédie',
  Drama: 'Drame',
  Mystery: 'Mystère',
  Sports: 'Sports',
  Supernatural: 'Surnaturel',
  'Slice of Life': 'Slice of Life',
}

/** Our French genre label → AniList genre enum. */
const GENRE_TO_ANILIST: Record<string, string> = {
  Action: 'Action',
  Aventure: 'Adventure',
  Comédie: 'Comedy',
  Drame: 'Drama',
  Mystère: 'Mystery',
  Sports: 'Sports',
  Surnaturel: 'Supernatural',
  'Slice of Life': 'Slice of Life',
}

/** Our demographic label → AniList tag/genre. AniList exposes these as tags. */
const DEMOGRAPHIC_MAP: Record<string, string> = {
  'Shōnen': 'Shounen',
  'Seinen': 'Seinen',
  'Shōjo': 'Shoujo',
  'Josei': 'Josei',
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
interface AniListMedia {
  id: number
  title?: { romaji?: string; english?: string; native?: string }
  coverImage?: { extraLarge?: string; large?: string; medium?: string }
  startDate?: { year?: number }
  genres?: string[]
  tags?: { name: string; rank?: number }[]
  description?: string
  staff?: { edges?: { role?: string; node?: { name?: { full?: string } } }[] }
  popularity?: number
  averageScore?: number
  chapters?: number
  volumes?: number
  status?: string
  format?: string
}

interface AniListPage {
  pageInfo?: { hasNextPage?: boolean }
  media?: AniListMedia[]
}

interface AniListResponse {
  data?: {
    Page?: AniListPage
    Media?: AniListMedia
  }
}

const MEDIA_FIELDS = `
  id
  title { romaji english native }
  coverImage { extraLarge large medium }
  startDate { year }
  genres
  tags { name rank }
  description(asHtml: false)
  popularity
  averageScore
  chapters
  volumes
  status
  format
  staff(perPage: 4) { edges { role node { name { full } } } }
`

/** Strip AniList HTML-ish markup from descriptions. */
function cleanDescription(raw: string | undefined): string | null {
  if (!raw) return null
  const text = raw
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/"/g, '"')
    .replace(/&/g, '&')
    .replace(/&#039;/g, "'")
    .trim()
  return text.length > 0 ? text : null
}

function anilistPopularity(m: AniListMedia): number {
  const popularity = typeof m.popularity === 'number' ? m.popularity : 0
  const score = typeof m.averageScore === 'number' ? m.averageScore : 0
  // popularity: log10(1 000 000) = 6 → [0, 60]
  const popScore = Math.min(Math.log10(popularity + 1) / 6, 1) * 60
  // averageScore 0–100 → [0, 40]
  const scoreScore = (score / 100) * 40
  return Math.round(popScore + scoreScore)
}

function anilistToItem(m: AniListMedia): CatalogItem | null {
  if (!m?.id) return null
  if (m.format && !MANGA_FORMATS.has(m.format)) return null

  const title = m.title?.english || m.title?.romaji || m.title?.native
  if (!title) return null

  const cover = m.coverImage?.extraLarge ?? m.coverImage?.large ?? m.coverImage?.medium ?? null

  const allGenres: string[] = [
    ...(m.genres ?? []),
    // Include high-ranked tags (e.g. Shounen, Seinen) as genre hints
    ...((m.tags ?? [])
      .filter((t) => t.rank != null && t.rank >= 60)
      .map((t) => t.name)
      .slice(0, 6)),
  ].filter(Boolean)

  const genre = allGenres.length > 0 ? allGenres.join(', ') : null

  const authors: string[] = (m.staff?.edges ?? [])
    .filter((e) => (e.role ?? '').toLowerCase().includes('story') || (e.role ?? '').toLowerCase().includes('art'))
    .map((e) => e.node?.name?.full ?? '')
    .filter(Boolean)

  const statusRaw = (m.status ?? '').toLowerCase()
  const mangaStatus: 'ongoing' | 'finished' | null =
    statusRaw === 'releasing' ? 'ongoing'
    : statusRaw === 'finished' ? 'finished'
    : null

  return {
    externalSource: 'anilist',
    externalId: String(m.id),
    title,
    type: 'manga',
    genre,
    genres: allGenres.length > 0 ? allGenres : undefined,
    coverUrl: cover,
    releaseYear: m.startDate?.year ?? null,
    authors: authors.length > 0 ? authors : undefined,
    popularityScore: anilistPopularity(m),
    description: cleanDescription(m.description),
    mangaStatus,
    volumes: typeof m.volumes === 'number' && m.volumes > 0 ? m.volumes : null,
    chapters: typeof m.chapters === 'number' && m.chapters > 0 ? m.chapters : null,
  }
}

/** Execute an AniList GraphQL query with retries/backoff + caching. */
async function anilistQuery<T = AniListResponse>(
  query: string,
  variables: Record<string, unknown>,
  cacheTtlMs = LIST_TTL_MS,
): Promise<T | null> {
  return fetchJson<T>(ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({ query, variables }),
    timeoutMs: 8000,
    retries: 3,
    backoffMs: 500,
    cacheTtlMs,
  })
}

export interface PagedResult {
  items: CatalogItem[]
  hasMore: boolean
}

/** Build the AniList `genre_in` / `tag_in` filter from our genre label. */
function buildGenreFilter(genre?: string): { genre_in?: string[]; tag_in?: string[] } {
  if (!genre) return {}
  const anilistGenre = GENRE_TO_ANILIST[genre]
  if (anilistGenre) return { genre_in: [anilistGenre] }
  const demographic = DEMOGRAPHIC_MAP[genre]
  if (demographic) return { tag_in: [demographic] }
  return {}
}

const LIST_QUERY = `
  query ($page: Int, $perPage: Int, $search: String, $genre_in: [String], $tag_in: [String], $sort: [MediaSort]) {
    Page(page: $page, perPage: $perPage) {
      pageInfo { hasNextPage }
      media(type: MANGA, search: $search, genre_in: $genre_in, tag_in: $tag_in, sort: $sort, isAdult: false) {
        ${MEDIA_FIELDS}
      }
    }
  }
`

/** Trending / popular manga (optionally filtered by genre). */
export async function getTrendingMangaAniList(limit = 24, page = 1, genre?: string): Promise<PagedResult> {
  const filter = buildGenreFilter(genre)
  const data = await anilistQuery<AniListResponse>(LIST_QUERY, {
    page,
    perPage: Math.min(limit, 50),
    sort: ['POPULARITY_DESC'],
    ...filter,
  })
  const media = data?.data?.Page?.media ?? []
  const items = media
    .map(anilistToItem)
    .filter((it): it is CatalogItem => it !== null)
    .slice(0, limit)
  return { items, hasMore: data?.data?.Page?.pageInfo?.hasNextPage ?? false }
}

/** Full-text manga search. */
export async function searchMangaAniList(query: string, limit = 24, page = 1, genre?: string): Promise<PagedResult> {
  const filter = buildGenreFilter(genre)
  const data = await anilistQuery<AniListResponse>(LIST_QUERY, {
    page,
    perPage: Math.min(limit, 50),
    search: normalizeQuery(query),
    sort: ['POPULARITY_DESC'],
    ...filter,
  })
  const media = data?.data?.Page?.media ?? []
  const items = media
    .map(anilistToItem)
    .filter((it): it is CatalogItem => it !== null)
    .slice(0, limit)
  return { items, hasMore: data?.data?.Page?.pageInfo?.hasNextPage ?? false }
}

const DETAIL_QUERY = `
  query ($id: Int) {
    Media(id: $id, type: MANGA) {
      ${MEDIA_FIELDS}
    }
  }
`

/** Resolve a single manga by its AniList id. */
export async function getMangaByExternalIdAniList(externalId: string): Promise<CatalogItem | null> {
  const id = Number(externalId)
  if (!Number.isFinite(id)) return null
  const data = await anilistQuery<AniListResponse>(DETAIL_QUERY, { id }, DETAIL_TTL_MS)
  const media = data?.data?.Media
  return media ? anilistToItem(media) : null
}

/** Recommendations for a manga (AniList exposes these on the Media node). */
const RECOMMENDATIONS_QUERY = `
  query ($id: Int) {
    Media(id: $id, type: MANGA) {
      recommendations(perPage: 10, sort: RATING_DESC) {
        nodes {
          mediaRecommendation {
            ${MEDIA_FIELDS}
          }
        }
      }
    }
  }
`

export async function getMangaRecommendationsAniList(externalId: string): Promise<CatalogItem[]> {
  const id = Number(externalId)
  if (!Number.isFinite(id)) return []
  const data = await anilistQuery<{
    data?: { Media?: { recommendations?: { nodes?: { mediaRecommendation?: AniListMedia }[] } } }
  }>(RECOMMENDATIONS_QUERY, { id }, DETAIL_TTL_MS)
  const nodes = data?.data?.Media?.recommendations?.nodes ?? []
  return nodes
    .map((n) => (n.mediaRecommendation ? anilistToItem(n.mediaRecommendation) : null))
    .filter((it): it is CatalogItem => it !== null)
}

/** Related manga (sequels/prequels/side stories) via AniList relations. */
const RELATIONS_QUERY = `
  query ($id: Int) {
    Media(id: $id, type: MANGA) {
      relations {
        edges {
          relationType
          node {
            ${MEDIA_FIELDS}
          }
        }
      }
    }
  }
`

const RELEVANT_RELATIONS = new Set(['SEQUEL', 'PREQUEL', 'SIDE_STORY', 'ALTERNATIVE', 'PARENT', 'SPIN_OFF'])

export async function getMangaRelationsAniList(externalId: string): Promise<CatalogItem[]> {
  const id = Number(externalId)
  if (!Number.isFinite(id)) return []
  const data = await anilistQuery<{
    data?: { Media?: { relations?: { edges?: { relationType?: string; node?: AniListMedia }[] } } }
  }>(RELATIONS_QUERY, { id }, DETAIL_TTL_MS)
  const edges = data?.data?.Media?.relations?.edges ?? []
  return edges
    .filter((e) => e.relationType != null && RELEVANT_RELATIONS.has(e.relationType))
    .map((e) => (e.node ? anilistToItem(e.node) : null))
    .filter((it): it is CatalogItem => it !== null)
    .slice(0, 8)
}

/** Exposed for the unified provider's genre mapping. */
export { ANILIST_GENRE_MAP }
