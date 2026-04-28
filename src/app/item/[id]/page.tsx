export const dynamic = 'force-dynamic'

import { notFound } from 'next/navigation'
import { Star, Calendar, Tag, ArrowLeft, User } from 'lucide-react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { PersonalSpace } from './PersonalSpace'
import { Separator } from '@/components/ui/separator'
import { Badge } from '@/components/ui/badge'
import { decodeCatalogId, catalogItemToSupabaseRow } from '@/lib/catalog/types'
import { getBookByExternalId } from '@/lib/catalog/openlibrary'
import { getGameByExternalId as getFtgGame } from '@/lib/catalog/freetogame'
import { getGameByExternalId as getRawgGame } from '@/lib/catalog/rawg'
import { getMovieByExternalId } from '@/lib/catalog/tmdb'
import type { Item, Review } from '@/types'

interface ItemDetailPageProps {
  params: Promise<{ id: string }>
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

  // Try to decode as external catalog ID (e.g. "openlibrary__OL12345W")
  const external = decodeCatalogId(rawId)

  if (external) {
    // Look up in Supabase first (might already exist from a previous visit)
    const { data: existing } = await supabase
      .from('items')
      .select('*')
      .eq('external_source', external.source)
      .eq('external_id', external.id)
      .maybeSingle()

    if (existing) {
      item = existing as Item
      supabaseItemId = existing.id
    } else {
      // Fetch from external API
      let catalogItem = null
      if (external.source === 'openlibrary') {
        catalogItem = await getBookByExternalId(external.id)
      } else if (external.source === 'rawg') {
        catalogItem = await getRawgGame(external.id)
      } else if (external.source === 'freetogame') {
        catalogItem = await getFtgGame(external.id)
      } else if (external.source === 'tmdb') {
        catalogItem = await getMovieByExternalId(external.id)
      }

      if (!catalogItem) notFound()

      // Try to upsert (requires authenticated user OR service role)
      // If user is not authenticated, we show the item without reviews
      const row = catalogItemToSupabaseRow(catalogItem)
      const { data: upserted } = await supabase
        .from('items')
        .upsert(row, { onConflict: 'external_source,external_id' })
        .select('*')
        .maybeSingle()

      if (upserted) {
        item = upserted as Item
        supabaseItemId = upserted.id
      } else {
        // Not authenticated or RLS blocked — show item without review features
        item = {
          id: rawId,
          title: catalogItem.title,
          type: catalogItem.type,
          genre: catalogItem.genre,
          cover_url: catalogItem.coverUrl,
          release_year: catalogItem.releaseYear,
          external_source: catalogItem.externalSource,
          external_id: catalogItem.externalId,
        } as Item
      }
    }
  } else {
    // Legacy UUID-based lookup
    const { data } = await supabase
      .from('items')
      .select('*')
      .eq('id', rawId)
      .single()
    if (!data) notFound()
    item = data as Item
    supabaseItemId = rawId
  }

  // Load reviews only if we have a real Supabase UUID
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

  const isBook = item.type === 'book'
  const accentFrom = isBook ? 'from-amber-400' : 'from-indigo-400'
  const accentTo = isBook ? 'to-amber-600' : 'to-indigo-600'
  const accentStar = isBook ? 'fill-amber-500 text-amber-500' : 'fill-indigo-500 text-indigo-500'

  return (
    <div className="mx-auto max-w-5xl px-4 py-10 sm:px-6 lg:px-8 space-y-10">
      {/* Back */}
      <Link
        href="/catalog"
        className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
      >
        <ArrowLeft className="h-4 w-4" />
        Retour au catalogue
      </Link>

      {/* Hero */}
      <section className="flex flex-col gap-8 sm:flex-row">
        <div className="shrink-0 w-40 sm:w-48 rounded-xl overflow-hidden border shadow-md self-start">
          <div className="aspect-[2/3]">
            {item.cover_url ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={item.cover_url}
                alt={item.title}
                className="h-full w-full object-cover"
              />
            ) : (
              <div
                className={`flex h-full w-full items-center justify-center text-6xl font-bold text-white bg-gradient-to-br ${accentFrom} ${accentTo}`}
              >
                {item.title.charAt(0).toUpperCase()}
              </div>
            )}
          </div>
        </div>

        <div className="space-y-4 flex-1">
          <div>
            <Badge variant="secondary" className="mb-2 capitalize">
              {isBook ? 'Livre' : 'Jeu vidéo'}
            </Badge>
            <h1 className="text-3xl font-bold tracking-tight">{item.title}</h1>
          </div>

          <div className="flex flex-wrap gap-3 text-sm text-muted-foreground">
            {item.genre && (
              <span className="flex items-center gap-1.5">
                <Tag className="h-3.5 w-3.5" />
                {item.genre}
              </span>
            )}
            {item.release_year && (
              <span className="flex items-center gap-1.5">
                <Calendar className="h-3.5 w-3.5" />
                {item.release_year}
              </span>
            )}
          </div>

          <div className="flex items-center gap-2">
            <div className="flex">
              {[1, 2, 3, 4, 5].map((s) => (
                <Star
                  key={s}
                  className={`h-5 w-5 ${
                    avgRating !== null && s <= Math.round(avgRating)
                      ? accentStar
                      : 'fill-muted text-muted-foreground'
                  }`}
                />
              ))}
            </div>
            <span className="text-sm font-medium">
              {avgRating !== null ? avgRating.toFixed(1) : '—'}
            </span>
            <span className="text-sm text-muted-foreground">
              ({reviews.length} avis)
            </span>
          </div>
        </div>
      </section>

      <Separator />

      <div className="grid grid-cols-1 gap-10 lg:grid-cols-2">
        {/* Public reviews */}
        <section className="space-y-4">
          <h2 className="text-lg font-semibold">
            Avis publics{' '}
            <span className="text-sm font-normal text-muted-foreground">
              ({reviews.length})
            </span>
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
          <h2 className="text-lg font-semibold">Votre espace</h2>
          <PersonalSpace itemId={supabaseItemId ?? rawId} />
        </section>
      </div>
    </div>
  )
}
