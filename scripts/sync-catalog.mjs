import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL =
  process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error(
    'Missing env vars: SUPABASE_URL (or NEXT_PUBLIC_SUPABASE_URL) and SUPABASE_SERVICE_ROLE_KEY are required.'
  )
  process.exit(1)
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
})

// Même clé que Next.js (`GOOGLE_BOOKS_API_KEY`) pour éviter le 429 sur le sync.
const GOOGLE_KEY = process.env.GOOGLE_BOOKS_API_KEY?.trim()

const GOOGLE_SUBJECTS = [
  'fiction',
  'fantasy',
  'science+fiction',
  'romance',
  'mystery',
  'thriller',
  'biography',
  'history',
  'juvenile',
  'horror',
]

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms))
}

function volumeToBookRow(v) {
  const info = v?.volumeInfo
  if (!info?.title) return null
  if (!Array.isArray(info.authors) || info.authors.length === 0) return null
  const cover = info.imageLinks?.thumbnail ?? info.imageLinks?.smallThumbnail ?? null
  if (!cover) return null
  const year = info.publishedDate
    ? Number.parseInt(String(info.publishedDate).slice(0, 4), 10)
    : null
  const rawCategories = Array.isArray(info.categories) ? info.categories : []
  const genre =
    rawCategories.length > 0 ? String(rawCategories[0]).split(' / ')[0].trim() : null

  return {
    title: info.title,
    type: 'book',
    genre,
    cover_url: cover.replace(/^http:\/\//, 'https://'),
    release_year: Number.isNaN(year) ? null : year,
    external_source: 'googlebooks',
    external_id: String(v.id),
  }
}

async function fetchGoogleBooksCatalog() {
  const byId = new Map()
  for (const subject of GOOGLE_SUBJECTS) {
    const url = new URL('https://www.googleapis.com/books/v1/volumes')
    url.searchParams.set('q', `subject:${subject}`)
    url.searchParams.set('maxResults', '40')
    url.searchParams.set('printType', 'books')
    url.searchParams.set('orderBy', 'relevance')
    if (GOOGLE_KEY) url.searchParams.set('key', GOOGLE_KEY)

    const response = await fetch(url.toString())
    if (!response.ok) {
      console.warn(`Google Books subject "${subject}" failed: ${response.status}`)
      await sleep(300)
      continue
    }
    const payload = await response.json()
    for (const v of payload.items ?? []) {
      const row = volumeToBookRow(v)
      if (row) byId.set(row.external_id, row)
    }
    await sleep(250)
  }
  return [...byId.values()]
}

function mangaToRow(m) {
  if (!m?.mal_id) return null
  const rating = m.rating ?? ''
  if (rating.includes('Rx') || String(rating).toLowerCase().includes('hentai')) return null
  const genreNames = [
    ...(m.genres ?? []).map((g) => g.name),
    ...(m.explicit_genres ?? []).map((g) => g.name),
  ]
  if (genreNames.some((g) => ['Hentai', 'Erotica'].includes(g))) return null

  const title = m.title_english || m.title
  const cover = m.images?.jpg?.large_image_url ?? m.images?.jpg?.image_url ?? null
  if (!title || !cover) return null

  const year = m.published?.prop?.from?.year ?? m.year ?? null

  const demographic =
    Array.isArray(m.demographics) && m.demographics.length > 0
      ? m.demographics[0].name
      : null
  const genre =
    demographic ??
    (Array.isArray(m.genres) && m.genres.length > 0 ? m.genres[0].name : null)

  return {
    title,
    type: 'manga',
    genre,
    cover_url: cover,
    release_year: typeof year === 'number' && !Number.isNaN(year) ? year : null,
    external_source: 'jikan',
    external_id: String(m.mal_id),
  }
}

async function fetchJikanTopManga(maxPages = 10) {
  const rows = []
  const seen = new Set()
  for (let page = 1; page <= maxPages; page++) {
    const url = new URL('https://api.jikan.moe/v4/top/manga')
    url.searchParams.set('type', 'manga')
    url.searchParams.set('sfw', 'true')
    url.searchParams.set('limit', '25')
    url.searchParams.set('page', String(page))

    const response = await fetch(url.toString())
    if (!response.ok) {
      console.warn(`Jikan top/manga page ${page} failed: ${response.status}`)
      break
    }
    const payload = await response.json()
    for (const m of payload.data ?? []) {
      const row = mangaToRow(m)
      if (row && !seen.has(row.external_id)) {
        seen.add(row.external_id)
        rows.push(row)
      }
    }
    if (!payload.pagination?.has_next_page) break
    await sleep(400)
  }
  return rows
}

async function fetchFreeToGameCatalog() {
  const response = await fetch('https://www.freetogame.com/api/games')
  if (!response.ok) {
    throw new Error(`FreeToGame API failed with status ${response.status}`)
  }

  const payload = await response.json()
  if (!Array.isArray(payload)) return []

  return payload
    .filter((game) => game?.id && game?.title)
    .map((game) => {
      const year = Number.parseInt(String(game.release_date).slice(0, 4), 10)
      return {
        title: game.title,
        type: 'game',
        genre: game.genre ?? null,
        cover_url: game.thumbnail ?? null,
        release_year: Number.isNaN(year) ? null : year,
        external_source: 'freetogame',
        external_id: String(game.id),
      }
    })
}

async function upsertItems(items, label) {
  if (items.length === 0) {
    console.log(`No ${label} items to upsert.`)
    return
  }

  const { error } = await supabase.from('items').upsert(items, {
    onConflict: 'external_source,external_id',
    ignoreDuplicates: false,
  })

  if (error) throw error
  console.log(`Upserted ${items.length} ${label} items.`)
}

async function run() {
  console.log('Sync started (Google Books romans + Jikan mangas + jeux FreeToGame)...')

  const novelRows = await fetchGoogleBooksCatalog()
  const mangaRows = await fetchJikanTopManga()
  const games = await fetchFreeToGameCatalog()

  await upsertItems(novelRows, 'book (googlebooks)')
  await upsertItems(mangaRows, 'manga (jikan)')
  await upsertItems(games, 'game')

  console.log('Sync completed.')
}

run().catch((error) => {
  console.error('Catalog sync failed:', error)
  process.exit(1)
})
