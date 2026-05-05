import { type NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'

type ProgressStatus = 'backlog' | 'completed'

async function syncLibraryFromVolumes(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string,
  mangaItemId: string,
) {
  const { data: progressRows, error: progressError } = await supabase
    .from('manga_volume_progress')
    .select('status')
    .eq('user_id', userId)
    .eq('manga_item_id', mangaItemId)

  if (progressError) return { error: progressError.message }

  const statuses = (progressRows ?? []).map((r) => r.status as ProgressStatus)
  if (statuses.length === 0) {
    const { error } = await supabase
      .from('user_libraries')
      .delete()
      .eq('user_id', userId)
      .eq('item_id', mangaItemId)
    if (error) return { error: error.message }
    return { ok: true as const }
  }

  const hasBacklog = statuses.includes('backlog')
  const status: ProgressStatus = hasBacklog ? 'backlog' : 'completed'
  const { error } = await supabase
    .from('user_libraries')
    .upsert(
      {
        user_id: userId,
        item_id: mangaItemId,
        status,
      },
      { onConflict: 'user_id,item_id' },
    )
  if (error) return { error: error.message }
  return { ok: true as const }
}

// GET /api/manga/volumes?manga_item_id=...
// Returns all volume progress rows for the current user and given manga item.
export async function GET(req: NextRequest) {
  const mangaItemId = req.nextUrl.searchParams.get('manga_item_id')
  if (!mangaItemId) return NextResponse.json({ error: 'manga_item_id required' }, { status: 400 })

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json([])

  const { data, error } = await supabase
    .from('manga_volume_progress')
    .select('volume_number, status')
    .eq('user_id', user.id)
    .eq('manga_item_id', mangaItemId)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data ?? [])
}

// POST /api/manga/volumes
// Single:  { manga_item_id, volume_number, status }
// Bulk:    { manga_item_id, volumes: [{ volume_number, status }] }
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null)
  if (!body?.manga_item_id) {
    return NextResponse.json({ error: 'manga_item_id required' }, { status: 400 })
  }

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  // Normalize to array of { volume_number, status }
  const entries: { volume_number: number; status: string }[] = Array.isArray(body.volumes)
    ? body.volumes.map((v: { volume_number: number; status?: string }) => ({
        volume_number: Number(v.volume_number),
        status: v.status ?? 'completed',
      }))
    : [{ volume_number: Number(body.volume_number), status: body.status ?? 'completed' }]

  if (entries.length === 0 || entries.some((e) => !e.volume_number)) {
    return NextResponse.json({ error: 'volume_number required' }, { status: 400 })
  }

  const rows = entries.map((e) => ({
    user_id: user.id,
    manga_item_id: body.manga_item_id,
    volume_number: e.volume_number,
    status: e.status,
  }))

  const { error } = await supabase
    .from('manga_volume_progress')
    .upsert(rows, { onConflict: 'user_id,manga_item_id,volume_number' })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  const syncResult = await syncLibraryFromVolumes(supabase, user.id, body.manga_item_id)
  if ('error' in syncResult) return NextResponse.json({ error: syncResult.error }, { status: 500 })
  return NextResponse.json({ ok: true })
}

// DELETE /api/manga/volumes
// Single:  { manga_item_id, volume_number }
// Bulk:    { manga_item_id, volume_numbers: [1, 2, 3] }
export async function DELETE(req: NextRequest) {
  const body = await req.json().catch(() => null)
  if (!body?.manga_item_id) {
    return NextResponse.json({ error: 'manga_item_id required' }, { status: 400 })
  }

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  if (Array.isArray(body.volume_numbers) && body.volume_numbers.length > 0) {
    const { error } = await supabase
      .from('manga_volume_progress')
      .delete()
      .eq('user_id', user.id)
      .eq('manga_item_id', body.manga_item_id)
      .in('volume_number', body.volume_numbers.map(Number))
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  } else {
    if (!body.volume_number) return NextResponse.json({ error: 'volume_number required' }, { status: 400 })
    const { error } = await supabase
      .from('manga_volume_progress')
      .delete()
      .eq('user_id', user.id)
      .eq('manga_item_id', body.manga_item_id)
      .eq('volume_number', Number(body.volume_number))
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  }

  const syncResult = await syncLibraryFromVolumes(supabase, user.id, body.manga_item_id)
  if ('error' in syncResult) return NextResponse.json({ error: syncResult.error }, { status: 500 })
  return NextResponse.json({ ok: true })
}
