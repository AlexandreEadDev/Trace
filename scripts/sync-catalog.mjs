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

const OPEN_LIBRARY_SUBJECTS = [
  'fantasy',
  'science_fiction',
  'mystery',
  'historical_fiction',
  'romance',
]

async function fetchOpenLibraryBooks(limitPerSubject = 80) {
  const books = []

  for (const subject of OPEN_LIBRARY_SUBJECTS) {
    const url = new URL(`https://openlibrary.org/subjects/${subject}.json`)
    url.searchParams.set('limit', String(limitPerSubject))

    const response = await fetch(url)
    if (!response.ok) {
      console.warn(
        `Open Library subject ${subject} failed with status ${response.status}`
      )
      continue
    }

    const payload = await response.json()
    const works = payload.works ?? []

    for (const work of works) {
      if (!work?.key || !work?.title) continue

      const releaseYear =
        typeof work.first_publish_year === 'number'
          ? work.first_publish_year
          : null
      const coverUrl =
        typeof work.cover_id === 'number'
          ? `https://covers.openlibrary.org/b/id/${work.cover_id}-L.jpg`
          : null
      const primaryGenre =
        Array.isArray(work.subject) && work.subject.length > 0
          ? work.subject[0]
          : subject.replaceAll('_', ' ')

      books.push({
        title: work.title,
        type: 'book',
        genre: primaryGenre,
        cover_url: coverUrl,
        release_year: releaseYear,
        external_source: 'openlibrary',
        external_id: work.key,
      })
    }
  }

  return books
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
  console.log('Sync started...')

  const [books, games] = await Promise.all([
    fetchOpenLibraryBooks(),
    fetchFreeToGameCatalog(),
  ])

  await upsertItems(books, 'book')
  await upsertItems(games, 'game')

  console.log('Sync completed.')
}

run().catch((error) => {
  console.error('Catalog sync failed:', error)
  process.exit(1)
})
