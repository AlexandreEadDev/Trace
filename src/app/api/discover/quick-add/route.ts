import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { decodeCatalogId, catalogItemToSupabaseRow } from '@/lib/catalog/types'
import { resolveCatalogItem } from '@/lib/discover/resolveCatalogItem'

export async function POST(req: Request) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  let body: { itemId?: string; catalogId?: string }
  try {
    body = (await req.json()) as { itemId?: string; catalogId?: string }
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const { itemId, catalogId } = body
  const uuidRe =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

  if (itemId && uuidRe.test(itemId)) {
    const { data, error } = await supabase
      .from('user_libraries')
      .upsert(
        { user_id: user.id, item_id: itemId, status: 'backlog' },
        { onConflict: 'user_id,item_id' }
      )
      .select('id, item_id, status')
      .single()

    if (error) {
      console.error('[discover/quick-add] library', error.message)
      return NextResponse.json({ error: error.message }, { status: 400 })
    }
    return NextResponse.json({ ok: true, itemId, library: data })
  }

  if (catalogId) {
    const decoded = decodeCatalogId(decodeURIComponent(catalogId))
    if (!decoded) {
      return NextResponse.json({ error: 'Invalid catalogId' }, { status: 400 })
    }

    const catalogItem = await resolveCatalogItem(decoded.source, decoded.id)
    if (!catalogItem) {
      return NextResponse.json({ error: 'Catalog item not found' }, { status: 404 })
    }

    const row = catalogItemToSupabaseRow(catalogItem)
    const { data: itemRow, error: upErr } = await supabase
      .from('items')
      .upsert(row, { onConflict: 'external_source,external_id' })
      .select('id')
      .single()

    if (upErr || !itemRow) {
      console.error('[discover/quick-add] upsert item', upErr?.message)
      return NextResponse.json(
        { error: upErr?.message ?? 'Could not save item' },
        { status: 400 }
      )
    }

    const { data: lib, error: libErr } = await supabase
      .from('user_libraries')
      .upsert(
        { user_id: user.id, item_id: itemRow.id, status: 'backlog' },
        { onConflict: 'user_id,item_id' }
      )
      .select('id, item_id, status')
      .single()

    if (libErr) {
      console.error('[discover/quick-add] library', libErr.message)
      return NextResponse.json({ error: libErr.message }, { status: 400 })
    }

    return NextResponse.json({ ok: true, itemId: itemRow.id, library: lib })
  }

  return NextResponse.json(
    { error: 'Provide itemId (uuid) or catalogId' },
    { status: 400 }
  )
}
