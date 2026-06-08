import { type NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'

type ProgressStatus = 'backlog' | 'completed'

async function syncLibraryFromVolumes(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string,
  mangaItemId: string,
  totalVolumes?: number | null,
) {
  const { data: progressRows, error: progressError } = await supabase
    .from('manga_volume_progress')
    .select('status')
    .eq('user_id', userId)
    .eq('manga_item_id', mangaItemId)

  if (progressError) return { error: progressError.message }

  const rows = progressRows ?? []
  if (rows.length === 0) {
    const { error } = await supabase
      .from('user_libraries')
      .delete()
      .eq('user_id', userId)
      .eq('item_id', mangaItemId)
    if (error) return { error: error.message }
    return { ok: true as const }
  }

  const completedCount = rows.filter((r) => r.status === 'completed').length
  const total = totalVolumes != null && totalVolumes > 0 ? totalVolumes : null
  const status: ProgressStatus =
    total != null && completedCount >= total ? 'completed' : 'backlog'

  const { error } = await supabase
    .from('user_libraries')
    .upsert(
      { user_id: userId, item_id: mangaItemId, status },
      { onConflict: 'user_id,item_id' },
    )
  if (error) return { error: error.message }
  return { ok: true as const }
}

export async function GET(req: NextRequest) {
  const mangaItemId = req.nextUrl.searchParams.get('manga_item_id')
  if (!mangaItemId) return NextResponse.json({ error: 'manga_item_id required' }, { status: 400 })

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json([])

  const { data, error } = await supabase
    .from('manga_volume_progress')
    .select('volume_number, status, rating')
    .eq('user_id', user.id)
    .eq('manga_item_id', mangaItemId)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data ?? [])
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null)
  if (!body?.manga_item_id) {
    return NextResponse.json({ error: 'manga_item_id required' }, { status: 400 })
  }

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const entries: { volume_number: number; status: string; rating: number | null }[] = Array.isArray(body.volumes)
    ? body.volumes.map((v: { volume_number: number; status?: string; rating?: number | null }) => ({
        volume_number: Number(v.volume_number),
        status: v.status ?? 'completed',
        rating: v.rating ?? null,
      }))
    : [{
        volume_number: Number(body.volume_number),
        status: body.status ?? 'completed',
        rating: body.rating ?? null,
      }]

  if (entries.length === 0 || entries.some((e) => !e.volume_number || Number.isNaN(e.volume_number))) {
    return NextResponse.json({ error: 'volume_number required' }, { status: 400 })
  }

  const rows = entries.map((e) => ({
    user_id: user.id,
    manga_item_id: body.manga_item_id,
    volume_number: e.volume_number,
    status: e.status,
    rating: e.rating,
  }))

  const { error } = await supabase
    .from('manga_volume_progress')
    .upsert(rows, { onConflict: 'user_id,manga_item_id,volume_number' })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const totalVolumes = body.total_volumes != null ? Number(body.total_volumes) : null
  const syncResult = await syncLibraryFromVolumes(
    supabase,
    user.id,
    body.manga_item_id,
    Number.isNaN(totalVolumes as number) ? null : totalVolumes,
  )
  if ('error' in syncResult) return NextResponse.json({ error: syncResult.error }, { status: 500 })
  return NextResponse.json({ ok: true })
}

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

  const totalVolumes = body.total_volumes != null ? Number(body.total_volumes) : null
  const syncResult = await syncLibraryFromVolumes(
    supabase,
    user.id,
    body.manga_item_id,
    Number.isNaN(totalVolumes as number) ? null : totalVolumes,
  )
  if ('error' in syncResult) return NextResponse.json({ error: syncResult.error }, { status: 500 })
  return NextResponse.json({ ok: true })
}
