import { type NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'

type ProgressStatus = 'backlog' | 'completed'

async function syncLibraryFromEpisodes(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string,
  showItemId: string,
  totalEpisodes?: number | null,
) {
  const { data: progressRows, error: progressError } = await supabase
    .from('tv_episode_progress')
    .select('status')
    .eq('user_id', userId)
    .eq('show_item_id', showItemId)

  if (progressError) return { error: progressError.message }

  const rows = progressRows ?? []
  if (rows.length === 0) {
    const { error } = await supabase
      .from('user_libraries')
      .delete()
      .eq('user_id', userId)
      .eq('item_id', showItemId)
    if (error) return { error: error.message }
    return { ok: true as const }
  }

  const completedCount = rows.filter((r) => r.status === 'completed').length
  const total = totalEpisodes != null && totalEpisodes > 0 ? totalEpisodes : null
  // « Vu » uniquement quand tous les épisodes de la série sont marqués vus ; sinon « À voir ».
  const status: ProgressStatus =
    total != null && completedCount >= total ? 'completed' : 'backlog'
  const { error } = await supabase
    .from('user_libraries')
    .upsert(
      { user_id: userId, item_id: showItemId, status },
      { onConflict: 'user_id,item_id' },
    )
  if (error) return { error: error.message }
  return { ok: true as const }
}

export async function GET(req: NextRequest) {
  const showItemId = req.nextUrl.searchParams.get('show_item_id')
  if (!showItemId) return NextResponse.json({ error: 'show_item_id required' }, { status: 400 })

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json([])

  const { data, error } = await supabase
    .from('tv_episode_progress')
    .select('season_number, episode_number, status, rating')
    .eq('user_id', user.id)
    .eq('show_item_id', showItemId)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data ?? [])
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null)
  if (!body?.show_item_id) {
    return NextResponse.json({ error: 'show_item_id required' }, { status: 400 })
  }

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const isBulk = Array.isArray(body.episodes)
  const entries = isBulk
    ? body.episodes.map((e: {
        season_number: number
        episode_number: number
        status?: string
        rating?: number | null
      }) => ({
        season_number: Number(e.season_number),
        episode_number: Number(e.episode_number),
        status: e.status ?? 'completed',
        rating: e.rating ?? null,
      }))
    : [{
        season_number: Number(body.season_number),
        episode_number: Number(body.episode_number),
        status: body.status ?? 'completed',
        rating: body.rating ?? null,
      }]

  if (entries.some((e: { season_number: number }) => Number.isNaN(e.season_number) || e.season_number < 0)) {
    return NextResponse.json({ error: 'season_number required' }, { status: 400 })
  }
  if (entries.some((e: { episode_number: number }) => !e.episode_number || Number.isNaN(e.episode_number))) {
    return NextResponse.json({ error: 'episode_number required' }, { status: 400 })
  }

  const rows = entries.map((e: {
    season_number: number
    episode_number: number
    status: string
    rating: number | null
  }) => ({
    user_id: user.id,
    show_item_id: body.show_item_id,
    season_number: e.season_number,
    episode_number: e.episode_number,
    status: e.status,
    rating: e.rating,
  }))

  const { error } = await supabase
    .from('tv_episode_progress')
    .upsert(rows, { onConflict: 'user_id,show_item_id,season_number,episode_number' })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  const totalEpisodes = body.total_episodes != null ? Number(body.total_episodes) : null
  const syncResult = await syncLibraryFromEpisodes(
    supabase,
    user.id,
    body.show_item_id,
    Number.isNaN(totalEpisodes as number) ? null : totalEpisodes,
  )
  if ('error' in syncResult) return NextResponse.json({ error: syncResult.error }, { status: 500 })
  return NextResponse.json({ ok: true })
}

export async function DELETE(req: NextRequest) {
  const body = await req.json().catch(() => null)
  if (!body?.show_item_id) {
    return NextResponse.json({ error: 'show_item_id required' }, { status: 400 })
  }

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  if (Array.isArray(body.episodes) && body.episodes.length > 0) {
    for (const ep of body.episodes as { season_number: number; episode_number: number }[]) {
      const { error } = await supabase
        .from('tv_episode_progress')
        .delete()
        .eq('user_id', user.id)
        .eq('show_item_id', body.show_item_id)
        .eq('season_number', Number(ep.season_number))
        .eq('episode_number', Number(ep.episode_number))
      if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    }
  } else {
    if (body.season_number == null || !body.episode_number) {
      return NextResponse.json({ error: 'season_number and episode_number required' }, { status: 400 })
    }
    const { error } = await supabase
      .from('tv_episode_progress')
      .delete()
      .eq('user_id', user.id)
      .eq('show_item_id', body.show_item_id)
      .eq('season_number', Number(body.season_number))
      .eq('episode_number', Number(body.episode_number))
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  }

  const totalEpisodes = body.total_episodes != null ? Number(body.total_episodes) : null
  const syncResult = await syncLibraryFromEpisodes(
    supabase,
    user.id,
    body.show_item_id,
    Number.isNaN(totalEpisodes as number) ? null : totalEpisodes,
  )
  if ('error' in syncResult) return NextResponse.json({ error: syncResult.error }, { status: 500 })
  return NextResponse.json({ ok: true })
}
