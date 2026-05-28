import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { resolveCatalogItem } from '@/lib/discover/resolveCatalogItem'
import type { CatalogSource } from '@/lib/catalog/types'

const VALID_SOURCES: CatalogSource[] = ['openlibrary', 'googlebooks', 'freetogame', 'rawg', 'tmdb', 'jikan']

function sleep(ms: number) {
  return new Promise<void>((resolve) => setTimeout(resolve, ms))
}

export async function POST() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // Fetch all unique items in the user's library that have an external source
  const { data: libData, error: libErr } = await supabase
    .from('user_libraries')
    .select('items(id, external_source, external_id, genre)')
    .eq('user_id', user.id)

  if (libErr) {
    return NextResponse.json({ error: libErr.message }, { status: 500 })
  }

  type RawItem = { id: string; external_source: string | null; external_id: string | null; genre: string | null }

  const items: RawItem[] = (libData ?? [])
    .flatMap((row) => (Array.isArray(row.items) ? row.items : row.items ? [row.items] : []))
    .filter(
      (item): item is RawItem & { external_source: string; external_id: string } =>
        !!item?.external_source &&
        !!item?.external_id &&
        VALID_SOURCES.includes(item.external_source as CatalogSource)
    )
    // Deduplicate by id
    .filter((item, idx, arr) => arr.findIndex((x) => x.id === item.id) === idx)

  let updated = 0
  let skipped = 0
  let errors = 0

  for (const item of items) {
    try {
      // Small delay to stay within external API rate limits
      await sleep(350)

      const catalogItem = await resolveCatalogItem(
        item.external_source as CatalogSource,
        item.external_id!
      )
      if (!catalogItem) {
        skipped++
        continue
      }

      const newGenre = catalogItem.genre
      if (newGenre === item.genre) {
        skipped++
        continue
      }

      const { error: updateErr } = await supabase
        .from('items')
        .update({ genre: newGenre })
        .eq('id', item.id)

      if (updateErr) {
        console.error('[refresh-genres] update error:', item.id, updateErr.message)
        errors++
        continue
      }

      updated++
    } catch (err) {
      console.error('[refresh-genres] unexpected error:', item.id, err)
      errors++
    }
  }

  return NextResponse.json({
    ok: true,
    total: items.length,
    updated,
    skipped,
    errors,
  })
}
