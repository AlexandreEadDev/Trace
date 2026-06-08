'use client'

import { useState } from 'react'
import { ChevronDown, CirclePlay, ExternalLink, Tv } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { MovieWatchProviders, WatchOfferType, WatchProviderOffer } from '@/lib/catalog/tmdb'

const OFFER_PRIORITY: WatchOfferType[] = ['flatrate', 'free', 'ads', 'rent', 'buy']

const REGION_LABELS: Record<string, string> = {
  FR: 'France',
  BE: 'Belgique',
  CH: 'Suisse',
  CA: 'Canada',
  US: 'États-Unis',
  GB: 'Royaume-Uni',
}

function formatPrice(price: number, currency: string | null): string {
  if (currency) {
    try {
      return new Intl.NumberFormat('fr-FR', {
        style: 'currency',
        currency,
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      }).format(price)
    } catch {
      // invalid currency code
    }
  }
  return `${price.toFixed(2).replace('.', ',')} €`
}

function offerSubtitle(offer: WatchProviderOffer): string {
  switch (offer.type) {
    case 'flatrate':
      return 'Abonnement'
    case 'free':
      return 'Gratuit'
    case 'ads':
      return 'Gratuit avec publicités'
    case 'rent':
      return offer.price != null
        ? `À partir de ${formatPrice(offer.price, offer.currency)}`
        : 'Location'
    case 'buy':
      return offer.price != null
        ? `À partir de ${formatPrice(offer.price, offer.currency)}`
        : 'Achat'
    default:
      return ''
  }
}

function sortOffers(offers: WatchProviderOffer[]): WatchProviderOffer[] {
  return [...offers].sort((a, b) => {
    const pa = OFFER_PRIORITY.indexOf(a.type)
    const pb = OFFER_PRIORITY.indexOf(b.type)
    if (pa !== pb) return pa - pb
    return a.name.localeCompare(b.name, 'fr')
  })
}

function ProviderRow({ offer }: { offer: WatchProviderOffer }) {
  return (
    <div className="flex items-center gap-3 px-4 py-3 sm:px-5">
      <div className="h-10 w-10 shrink-0 overflow-hidden rounded-full bg-muted ring-1 ring-border/50 flex items-center justify-center">
        {offer.logoUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={offer.logoUrl}
            alt=""
            className="h-full w-full object-cover"
          />
        ) : (
          <Tv className="h-4 w-4 text-muted-foreground" />
        )}
      </div>

      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium leading-tight truncate">{offer.name}</p>
        <p className="text-xs text-muted-foreground mt-0.5 truncate">
          {offerSubtitle(offer)}
        </p>
      </div>

      <a
        href={offer.watchUrl}
        target="_blank"
        rel="noopener noreferrer"
        className={cn(
          'shrink-0 inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5',
          'text-xs font-medium text-sky-600 border-sky-400/70',
          'hover:bg-sky-50 dark:hover:bg-sky-950/40 transition-colors',
        )}
      >
        <CirclePlay className="h-3.5 w-3.5" />
        Regarder
      </a>
    </div>
  )
}

interface WatchProvidersProps {
  data: MovieWatchProviders
}

export function WatchProviders({ data }: WatchProvidersProps) {
  const [open, setOpen] = useState(true)
  const regionLabel = REGION_LABELS[data.region] ?? data.region
  const offers = sortOffers(data.offers)

  return (
    <section className="overflow-hidden rounded-2xl border bg-card/80 shadow-sm">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between gap-3 px-4 py-3.5 sm:px-5 text-left hover:bg-muted/40 transition-colors"
      >
        <h2 className="text-base font-semibold tracking-tight">Où regarder</h2>
        <div className="flex items-center gap-2 shrink-0">
          <span className="text-xs text-muted-foreground hidden sm:inline">
            {regionLabel}
          </span>
          <ChevronDown
            className={cn(
              'h-4 w-4 text-muted-foreground transition-transform duration-200',
              open && 'rotate-180',
            )}
          />
        </div>
      </button>

      {open && (
        <>
          <div className="divide-y border-t">
            {offers.map((offer) => (
              <ProviderRow
                key={`${offer.type}-${offer.providerId}`}
                offer={offer}
              />
            ))}
          </div>

          <div className="border-t px-4 py-2.5 sm:px-5 flex flex-wrap items-center justify-between gap-2 bg-muted/20">
            {data.link ? (
              <a
                href={data.link}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 text-[11px] font-medium text-muted-foreground hover:text-foreground transition-colors"
              >
                Plus d&apos;options sur TMDB
                <ExternalLink className="h-3 w-3" />
              </a>
            ) : (
              <span />
            )}
            <p className="text-[10px] text-muted-foreground/80">
              JustWatch · TMDB
            </p>
          </div>
        </>
      )}
    </section>
  )
}
