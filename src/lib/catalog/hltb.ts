import { calculateSimilarity } from 'howlongtobeat-core'

export interface HltbData {
  mainStory: number | null
  mainExtra: number | null
  completionist: number | null
  searchUrl: string
}

const HLTB_ORIGIN = 'https://howlongtobeat.com'
const HLTB_BLEED_INIT = `${HLTB_ORIGIN}/api/bleed/init`
const HLTB_BLEED = `${HLTB_ORIGIN}/api/bleed`
const USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36'

const MIN_SIMILARITY = 0.4
const AUTO_FILTER_TIMES = true
const SIMILARITY_ALGORITHM = 'gestalt' as const

const similarityFn = (a: string, b: string) => calculateSimilarity(a, b, SIMILARITY_ALGORITHM)

/** Raw row from HLTB `/api/bleed` search `data` array (subset used for parsing). */
interface HltbBleedGameRow {
  game_id: number
  game_name?: string | null
  game_alias?: string | null
  game_image?: string | null
  comp_lvl_combine?: number
  comp_lvl_sp?: number
  comp_lvl_co?: number
  comp_lvl_mp?: number
  comp_main?: number
  comp_plus?: number
  comp_100?: number
  comp_all?: number
  invested_co?: number
  invested_mp?: number
}

interface ParsedBleedEntry {
  similarity: number
  mainStory: number | null
  mainExtra: number | null
  completionist: number | null
  gameWebLink: string
}

function secondsToHours(seconds: number | undefined): number | null {
  if (seconds === undefined || seconds <= 0) return null
  return Math.round((seconds / 3600) * 10) / 10
}

function parseBleedGameRow(raw: HltbBleedGameRow, similarity: number, autoFilterTimes: boolean): ParsedBleedEntry {
  const complexityLvlCombine = raw.comp_lvl_combine === 1
  const complexityLvlSp = raw.comp_lvl_sp === 1
  const complexityLvlCo = raw.comp_lvl_co === 1
  const complexityLvlMp = raw.comp_lvl_mp === 1

  let mainStory = secondsToHours(raw.comp_main)
  let mainExtra = secondsToHours(raw.comp_plus)
  let completionist = secondsToHours(raw.comp_100)

  if (autoFilterTimes) {
    if (!complexityLvlSp && !complexityLvlCombine) {
      mainStory = null
      mainExtra = null
      completionist = null
    }
  }

  return {
    similarity,
    mainStory,
    mainExtra,
    completionist,
    gameWebLink: `${HLTB_ORIGIN}/game/${raw.game_id}`,
  }
}

function parseBleedEntries(
  rawGames: HltbBleedGameRow[],
  searchQuery: string,
  autoFilterTimes: boolean,
): ParsedBleedEntry[] {
  const normalizedQuery = searchQuery.toLowerCase().trim()
  return rawGames.map((raw) => {
    const nameSimilarity = raw.game_name
      ? similarityFn(normalizedQuery, raw.game_name.toLowerCase())
      : 0
    const aliasSimilarity = raw.game_alias
      ? similarityFn(normalizedQuery, String(raw.game_alias).toLowerCase())
      : 0
    const similarity = Math.max(nameSimilarity, aliasSimilarity)
    return parseBleedGameRow(raw, similarity, autoFilterTimes)
  })
}

function filterBySimilarity(entries: ParsedBleedEntry[], minimumSimilarity: number): ParsedBleedEntry[] {
  return entries
    .filter((entry) => entry.similarity >= minimumSimilarity)
    .sort((a, b) => b.similarity - a.similarity)
}

function buildSearchBody(searchTerms: string[], modifier = '', page = 1, size = 20) {
  return {
    searchType: 'games' as const,
    searchTerms,
    searchPage: page,
    size,
    searchOptions: {
      games: {
        userId: 0,
        platform: '',
        sortCategory: 'popular',
        rangeCategory: 'main',
        rangeTime: { min: 0, max: 0 },
        gameplay: {
          perspective: '',
          flow: '',
          genre: '',
          difficulty: '',
        },
        rangeYear: { max: '', min: '' },
        modifier,
      },
      users: { sortCategory: 'postcount' },
      lists: { sortCategory: 'follows' },
      filter: '',
      sort: 0,
      randomizer: 0,
    },
    useCache: true,
  }
}

interface BleedAuth {
  token: string
  hpKey: string
  hpVal: string
}

let bleedAuthCache: (BleedAuth & { expiresAt: number }) | null = null
const BLEED_AUTH_TTL_MS = 5 * 60 * 1000

async function fetchBleedAuth(forceRefresh = false): Promise<BleedAuth | null> {
  if (!forceRefresh && bleedAuthCache && Date.now() < bleedAuthCache.expiresAt) {
    const { token, hpKey, hpVal } = bleedAuthCache
    return { token, hpKey, hpVal }
  }

  const response = await fetch(`${HLTB_BLEED_INIT}?t=${Date.now()}`, {
    headers: {
      'User-Agent': USER_AGENT,
      Referer: HLTB_ORIGIN,
    },
  })

  if (!response.ok) {
    return null
  }

  const data = (await response.json()) as { token?: string; hpKey?: string; hpVal?: string }
  const token = data.token
  const hpKey = data.hpKey
  const hpVal = data.hpVal
  if (!token || !hpKey || !hpVal) {
    return null
  }

  bleedAuthCache = {
    token,
    hpKey,
    hpVal,
    expiresAt: Date.now() + BLEED_AUTH_TTL_MS,
  }
  return { token, hpKey, hpVal }
}

async function postBleedSearch(body: Record<string, unknown>, auth: BleedAuth): Promise<Response> {
  return fetch(HLTB_BLEED, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'User-Agent': USER_AGENT,
      Referer: HLTB_ORIGIN,
      'x-auth-token': auth.token,
      'x-hp-key': auth.hpKey,
      'x-hp-val': auth.hpVal,
    },
    body: JSON.stringify(body),
  })
}

async function searchBleed(gameName: string, modifier = '') {
  const searchTerms = gameName.split(' ').filter((term) => term.length > 0)
  const baseBody = buildSearchBody(searchTerms, modifier)

  let auth = await fetchBleedAuth(false)
  if (!auth) return null

  const body: Record<string, unknown> = { ...baseBody, [auth.hpKey]: auth.hpVal }
  let response = await postBleedSearch(body, auth)

  if (response.status === 403) {
    bleedAuthCache = null
    auth = await fetchBleedAuth(true)
    if (!auth) return null
    const retryBody: Record<string, unknown> = { ...baseBody, [auth.hpKey]: auth.hpVal }
    response = await postBleedSearch(retryBody, auth)
  }

  if (!response.ok) {
    return null
  }

  return (await response.json()) as { data?: HltbBleedGameRow[] }
}

interface CacheEntry {
  data: HltbData
  expiresAt: number
}

const CACHE_TTL_MS = 24 * 60 * 60 * 1000
const cache = new Map<string, CacheEntry>()

function normalizeKey(title: string): string {
  return title
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function readCache(key: string): HltbData | null {
  const hit = cache.get(key)
  if (!hit) return null
  if (hit.expiresAt < Date.now()) {
    cache.delete(key)
    return null
  }
  return hit.data
}

function writeCache(key: string, data: HltbData): void {
  cache.set(key, { data, expiresAt: Date.now() + CACHE_TTL_MS })
}

function roundOrNull(v: unknown): number | null {
  return typeof v === 'number' && Number.isFinite(v) && v > 0 ? Math.round(v) : null
}

export async function getHltbData(title: string): Promise<HltbData> {
  const searchUrl = `${HLTB_ORIGIN}/?q=${encodeURIComponent(title)}`
  const empty: HltbData = { mainStory: null, mainExtra: null, completionist: null, searchUrl }

  if (!title) return empty

  const cacheKey = normalizeKey(title)
  const cached = readCache(cacheKey)
  if (cached) return cached

  try {
    const json = await searchBleed(title.trim(), '')
    const rawGames = json?.data
    if (!rawGames || rawGames.length === 0) {
      writeCache(cacheKey, empty)
      return empty
    }

    const entries = parseBleedEntries(rawGames, title, AUTO_FILTER_TIMES)
    const filtered = filterBySimilarity(entries, MIN_SIMILARITY)
    if (filtered.length === 0) {
      writeCache(cacheKey, empty)
      return empty
    }

    const best = filtered[0]
    if (!best) {
      writeCache(cacheKey, empty)
      return empty
    }

    const data: HltbData = {
      mainStory: roundOrNull(best.mainStory),
      mainExtra: roundOrNull(best.mainExtra),
      completionist: roundOrNull(best.completionist),
      searchUrl: best.gameWebLink || searchUrl,
    }

    writeCache(cacheKey, data)
    return data
  } catch {
    return empty
  }
}
