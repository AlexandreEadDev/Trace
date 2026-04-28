import type { CatalogItem } from './types'

const BASE = 'https://openlibrary.org'

const TRENDING_SUBJECTS = [
  'science_fiction',
  'fantasy',
  'thriller',
  'mystery',
  'historical_fiction',
]

function coverUrl(coverId: number | null | undefined): string | null {
  if (!coverId) return null
  return `https://covers.openlibrary.org/b/id/${coverId}-M.jpg`
}

async function fetchWithTimeout(url: string, ms = 12000): Promise<Response> {
  const controller = new AbortController()
  const id = setTimeout(() => controller.abort(), ms)
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      next: { revalidate: 3600 },
    })
    return res
  } finally {
    clearTimeout(id)
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function workToItem(work: any, fallbackGenre: string): CatalogItem {
  const id: string =
    typeof work.key === 'string'
      ? work.key.replace('/works/', '')
      : String(work.key)

  const rawSubject = Array.isArray(work.subject)
    ? work.subject[0]
    : Array.isArray(work.subjects)
    ? typeof work.subjects[0] === 'string'
      ? work.subjects[0]
      : null
    : null

  return {
    externalSource: 'openlibrary',
    externalId: id,
    title: work.title,
    type: 'book',
    genre: rawSubject ?? fallbackGenre.replace(/_/g, ' '),
    coverUrl: coverUrl(work.cover_id ?? work.cover_i),
    releaseYear: work.first_publish_year ?? null,
    authors: work.authors?.map((a: { name: string }) => a.name) ?? [],
  }
}

export async function getTrendingBooks(limit = 12): Promise<CatalogItem[]> {
  const subject =
    TRENDING_SUBJECTS[Math.floor(Math.random() * TRENDING_SUBJECTS.length)]

  try {
    const res = await fetchWithTimeout(
      `${BASE}/subjects/${subject}.json?limit=${limit}`
    )
    if (!res.ok) return []
    const data = await res.json()
    return (data.works ?? []).map((w: object) =>
      workToItem(w, subject)
    )
  } catch {
    return []
  }
}

export async function searchBooks(query: string, limit = 24): Promise<CatalogItem[]> {
  const url = new URL(`${BASE}/search.json`)
  url.searchParams.set('q', query)
  url.searchParams.set('limit', String(limit))
  url.searchParams.set('fields', 'key,title,cover_i,first_publish_year,subject,author_name')

  try {
    const res = await fetchWithTimeout(url.toString(), 15000)
    if (!res.ok) return []
    const data = await res.json()
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return (data.docs ?? []).map((doc: any) => ({
      externalSource: 'openlibrary' as const,
      externalId: (doc.key as string).replace('/works/', ''),
      title: doc.title,
      type: 'book' as const,
      genre: doc.subject?.[0] ?? null,
      coverUrl: coverUrl(doc.cover_i),
      releaseYear: doc.first_publish_year ?? null,
      authors: doc.author_name ?? [],
    }))
  } catch {
    return []
  }
}

export async function getBookByExternalId(externalId: string): Promise<CatalogItem | null> {
  try {
    const res = await fetchWithTimeout(
      `${BASE}/works/${externalId}.json`,
      12000
    )
    if (!res.ok) return null

    const work = await res.json()
    if (!work?.title) return null

    const coverId =
      Array.isArray(work.covers) && work.covers.length > 0
        ? work.covers[0]
        : null

    let releaseYear: number | null = null
    if (work.first_publish_date) {
      const match = String(work.first_publish_date).match(/\d{4}/)
      if (match) releaseYear = Number.parseInt(match[0], 10)
    }

    const rawSubjects: unknown[] = work.subjects ?? []
    const genre =
      typeof rawSubjects[0] === 'string'
        ? rawSubjects[0]
        : // some OL works return {type, value} objects
          typeof (rawSubjects[0] as { value?: string })?.value === 'string'
          ? (rawSubjects[0] as { value: string }).value
          : null

    return {
      externalSource: 'openlibrary',
      externalId,
      title: String(work.title),
      type: 'book',
      genre,
      coverUrl: coverUrl(coverId),
      releaseYear,
    }
  } catch {
    return null
  }
}
