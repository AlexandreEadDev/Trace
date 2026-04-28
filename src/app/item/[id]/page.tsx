export const dynamic = 'force-dynamic'

import { notFound } from 'next/navigation'
import { Star, Calendar, Tag, ArrowLeft, User, Clock, Gamepad2, Gauge, ExternalLink } from 'lucide-react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { PersonalSpace } from './PersonalSpace'
import { Separator } from '@/components/ui/separator'
import { Badge } from '@/components/ui/badge'
import { decodeCatalogId, catalogItemToSupabaseRow } from '@/lib/catalog/types'
import { getBookByExternalId as getOlBook } from '@/lib/catalog/openlibrary'
import { getBookByExternalId as getGbBook } from '@/lib/catalog/googlebooks'
import { getGameByExternalId as getFtgGame } from '@/lib/catalog/freetogame'
import { getGameByExternalId as getRawgGame } from '@/lib/catalog/rawg'
import { getMovieByExternalId } from '@/lib/catalog/tmdb'
import { getHltbData } from '@/lib/catalog/hltb'
import type { HltbData } from '@/lib/catalog/hltb'
import { cn } from '@/lib/utils'
import type { Item, Review } from '@/types'
import type { CatalogItem } from '@/lib/catalog/types'

interface ItemDetailPageProps {
  params: Promise<{ id: string }>
}

function formatDuration(minutes: number | null | undefined): string | null {
  if (!minutes || minutes <= 0) return null
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  return h > 0 ? `${h}h${m > 0 ? ` ${m}min` : ''}` : `${m}min`
}

function MetacriticBadge({ score }: { score: number }) {
  const color =
    score >= 75 ? 'bg-green-500' : score >= 50 ? 'bg-yellow-500' : 'bg-red-500'
  return (
    <span className={cn('inline-flex items-center gap-1 rounded px-2 py-0.5 text-xs font-bold text-white', color)}>
      <Gauge className="h-3 w-3" />
      {score}
      <span className="font-normal opacity-80">/100</span>
    </span>
  )
}

function TmdbBadge({ score, votes }: { score: number; votes?: number | null }) {
  return (
    <span className="inline-flex items-center gap-1 rounded bg-blue-600 px-2 py-0.5 text-xs font-bold text-white">
      <Star className="h-3 w-3 fill-white" />
      {score.toFixed(1)}
      <span className="font-normal opacity-80">/10</span>
      {votes != null && votes > 0 && (
        <span className="font-normal opacity-60 ml-0.5">({votes.toLocaleString()})</span>
      )}
    </span>
  )
}

function PublicReviewCard({ review }: { review: Review }) {
  return (
    <div className="rounded-lg border bg-card p-4 space-y-2">
      <div className="flex items-center gap-2">
        <div className="flex items-center justify-center h-7 w-7 rounded-full bg-muted shrink-0">
          <User className="h-3.5 w-3.5 text-muted-foreground" />
        </div>
        <div className="flex">
          {[1, 2, 3, 4, 5].map((s) => (
            <Star
              key={s}
              className={`h-3.5 w-3.5 ${
                s <= review.rating
                  ? 'fill-amber-400 text-amber-400'
                  : 'fill-muted text-muted-foreground'
              }`}
            />
          ))}
        </div>
        <span className="text-xs text-muted-foreground">
          {new Date(review.created_at).toLocaleDateString('fr-FR', {
            year: 'numeric',
            month: 'long',
            day: 'numeric',
          })}
        </span>
      </div>
      {review.public_comment && (
        <p className="text-sm text-foreground/80">{review.public_comment}</p>
      )}
    </div>
  )
}

export default async function ItemDetailPage({ params }: ItemDetailPageProps) {
  const { id: rawId } = await params
  const supabase = await createClient()

  let item: Item | null = null
  let supabaseItemId: string | null = null
  let catalogMeta: CatalogItem | null = null

  const external = decodeCatalogId(rawId)

  if (external) {
    const { data: existing } = await supabase
      .from('items')
      .select('*')
      .eq('external_source', external.source)
      .eq('external_id', external.id)
      .maybeSingle()

    if (existing) {
      item = existing as Item
      supabaseItemId = existing.id
      // Re-fetch catalog meta for fresh external data (duration, scores, etc.)
      if (external.source === 'rawg') catalogMeta = await getRawgGame(external.id)
      else if (external.source === 'tmdb') catalogMeta = await getMovieByExternalId(external.id)
      else if (external.source === 'openlibrary') catalogMeta = await getOlBook(external.id)
      else if (external.source === 'googlebooks') catalogMeta = await getGbBook(external.id)
    } else {
      let fetched: CatalogItem | null = null
      if (external.source === 'openlibrary') fetched = await getOlBook(external.id)
      else if (external.source === 'googlebooks') fetched = await getGbBook(external.id)
      else if (external.source === 'rawg') fetched = await getRawgGame(external.id)
      else if (external.source === 'freetogame') fetched = await getFtgGame(external.id)
      else if (external.source === 'tmdb') fetched = await getMovieByExternalId(external.id)

      if (!fetched) notFound()
      catalogMeta = fetched

      const row = catalogItemToSupabaseRow(fetched)
      const { data: upserted } = await supabase
        .from('items')
        .upsert(row, { onConflict: 'external_source,external_id' })
        .select('*')
        .maybeSingle()

      if (upserted) {
        item = upserted as Item
        supabaseItemId = upserted.id
      } else {
        item = {
          id: rawId,
          title: fetched.title,
          type: fetched.type,
          genre: fetched.genre,
          cover_url: fetched.coverUrl,
          release_year: fetched.releaseYear,
          duration_minutes: fetched.durationMinutes ?? null,
          external_source: fetched.externalSource,
          external_id: fetched.externalId,
        } as Item
      }
    }
  } else {
    const { data } = await supabase.from('items').select('*').eq('id', rawId).single()
    if (!data) notFound()
    item = data as Item
    supabaseItemId = rawId
  }

  const reviews: Review[] = []
  if (supabaseItemId && supabaseItemId !== rawId) {
    const { data } = await supabase
      .from('reviews')
      .select('*')
      .eq('item_id', supabaseItemId)
      .order('created_at', { ascending: false })
    if (data) reviews.push(...(data as Review[]))
  } else if (!external) {
    const { data } = await supabase
      .from('reviews')
      .select('*')
      .eq('item_id', rawId)
      .order('created_at', { ascending: false })
    if (data) reviews.push(...(data as Review[]))
  }

  const avgRating = reviews.length
    ? reviews.reduce((s, r) => s + r.rating, 0) / reviews.length
    : null

  // Fetch HLTB data in parallel with rendering — only for games
  let hltb: HltbData | null = null
  if (item.type === 'game') {
    hltb = await getHltbData(item.title)
  }

  const accentClass = item.type === 'book'
    ? { from: 'from-amber-400', to: 'to-amber-600', star: 'fill-amber-500 text-amber-500' }
    : item.type === 'game'
    ? { from: 'from-indigo-400', to: 'to-indigo-600', star: 'fill-indigo-500 text-indigo-500' }
    : { from: 'from-rose-400', to: 'to-rose-600', star: 'fill-rose-500 text-rose-500' }

  const duration = item.type !== 'game'
    ? formatDuration(catalogMeta?.durationMinutes ?? item.duration_minutes)
    : null
  const metacritic = catalogMeta?.metacritic ?? null
  const tmdbScore = catalogMeta?.tmdbScore ?? null
  const tmdbVoteCount = catalogMeta?.tmdbVoteCount ?? null
  const hasHltb = hltb && (hltb.mainStory || hltb.mainExtra || hltb.completionist)

  const typeLabel = item.type === 'book' ? 'Livre' : item.type === 'game' ? 'Jeu vidéo' : 'Film'

  return (
    <div className="mx-auto max-w-5xl px-4 py-10 sm:px-6 lg:px-8 space-y-10">
      <Link
        href="/catalog"
        className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
      >
        <ArrowLeft className="h-4 w-4" />
        Retour au catalogue
      </Link>

      {/* Hero */}
      <section className="flex flex-col gap-8 sm:flex-row">
        <div className="shrink-0 w-40 sm:w-52 rounded-xl overflow-hidden border shadow-md self-start">
          <div className="aspect-[2/3]">
            {item.cover_url ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={item.cover_url} alt={item.title} className="h-full w-full object-cover" />
            ) : (
              <div className={`flex h-full w-full items-center justify-center text-6xl font-bold text-white bg-gradient-to-br ${accentClass.from} ${accentClass.to}`}>
                {item.title.charAt(0).toUpperCase()}
              </div>
            )}
          </div>
        </div>

        <div className="space-y-4 flex-1">
          <div>
            <Badge variant="secondary" className="mb-2 capitalize">{typeLabel}</Badge>
            <h1 className="text-3xl font-bold tracking-tight leading-tight">{item.title}</h1>
          </div>

          {/* Metadata row */}
          <div className="flex flex-wrap gap-x-4 gap-y-2 text-sm text-muted-foreground">
            {item.genre && (
              <span className="flex items-center gap-1.5">
                <Tag className="h-3.5 w-3.5" />{item.genre}
              </span>
            )}
            {item.release_year && (
              <span className="flex items-center gap-1.5">
                <Calendar className="h-3.5 w-3.5" />{item.release_year}
              </span>
            )}
            {duration && item.type !== 'game' && (
              <span className="flex items-center gap-1.5">
                <Clock className="h-3.5 w-3.5" />
                {duration}
              </span>
            )}
          </div>

          {/* HLTB breakdown for games */}
          {item.type === 'game' && (
            <div className="flex flex-wrap items-center gap-3">
              <span className="flex items-center gap-1 text-xs text-muted-foreground">
                <Gamepad2 className="h-3.5 w-3.5" />
                <span className="font-medium">HowLongToBeat</span>
              </span>
              {hasHltb ? (
                <>
                  {hltb!.mainStory != null && (
                    <span className="inline-flex items-center gap-1 rounded-full bg-indigo-50 dark:bg-indigo-950 px-2.5 py-0.5 text-xs font-medium text-indigo-700 dark:text-indigo-300">
                      Histoire&nbsp;<strong>{hltb!.mainStory}h</strong>
                    </span>
                  )}
                  {hltb!.mainExtra != null && (
                    <span className="inline-flex items-center gap-1 rounded-full bg-violet-50 dark:bg-violet-950 px-2.5 py-0.5 text-xs font-medium text-violet-700 dark:text-violet-300">
                      Histoire&nbsp;+&nbsp;Extras&nbsp;<strong>{hltb!.mainExtra}h</strong>
                    </span>
                  )}
                  {hltb!.completionist != null && (
                    <span className="inline-flex items-center gap-1 rounded-full bg-purple-50 dark:bg-purple-950 px-2.5 py-0.5 text-xs font-medium text-purple-700 dark:text-purple-300">
                      100%&nbsp;<strong>{hltb!.completionist}h</strong>
                    </span>
                  )}
                  <a
                    href={hltb!.searchUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-xs text-muted-foreground hover:text-foreground transition-colors"
                  >
                    <ExternalLink className="h-3 w-3 inline" />
                  </a>
                </>
              ) : (
                <a
                  href={`https://howlongtobeat.com/?q=${encodeURIComponent(item.title)}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-xs text-indigo-500 hover:text-indigo-400 transition-colors flex items-center gap-1"
                >
                  Voir les temps <ExternalLink className="h-3 w-3" />
                </a>
              )}
            </div>
          )}

          {/* External scores */}
          {(metacritic != null || tmdbScore != null) && (
            <div className="flex flex-wrap gap-2 items-center">
              <span className="text-xs text-muted-foreground font-medium">Notes externes :</span>
              {metacritic != null && <MetacriticBadge score={metacritic} />}
              {tmdbScore != null && <TmdbBadge score={tmdbScore} votes={tmdbVoteCount} />}
            </div>
          )}

          {/* Internal rating */}
          <div className="flex items-center gap-2">
            <div className="flex">
              {[1, 2, 3, 4, 5].map((s) => (
                <Star
                  key={s}
                  className={`h-5 w-5 ${
                    avgRating !== null && s <= Math.round(avgRating)
                      ? accentClass.star
                      : 'fill-muted text-muted-foreground'
                  }`}
                />
              ))}
            </div>
            <span className="text-sm font-medium">
              {avgRating !== null ? avgRating.toFixed(1) : '—'}
            </span>
            <span className="text-sm text-muted-foreground">({reviews.length} avis Trace)</span>
          </div>
        </div>
      </section>

      <Separator />

      <div className="grid grid-cols-1 gap-10 lg:grid-cols-2">
        {/* Public reviews */}
        <section className="space-y-4">
          <h2 className="text-lg font-semibold">
            Avis publics{' '}
            <span className="text-sm font-normal text-muted-foreground">({reviews.length})</span>
          </h2>
          {reviews.length === 0 ? (
            <p className="text-sm text-muted-foreground py-4">
              Aucun avis pour le moment. Soyez le premier !
            </p>
          ) : (
            <div className="space-y-3">
              {reviews.map((r) => (
                <PublicReviewCard key={r.id} review={r} />
              ))}
            </div>
          )}
        </section>

        {/* Personal space */}
        <section className="space-y-4">
          <h2 className="text-lg font-semibold">Ton espace</h2>
          <PersonalSpace
            itemId={supabaseItemId ?? rawId}
            itemType={item.type}
          />
        </section>
      </div>
    </div>
  )
}
