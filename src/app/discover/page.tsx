import { TrendingHero } from '@/components/discover/TrendingHero'
import { MediaGrid } from '@/components/discover/MediaGrid'
import { DiscoverSearchBar } from '@/components/discover/DiscoverSearchBar'

export const metadata = {
  title: 'Découvrir — Trace',
  description:
    'Tendances de la communauté, recherche locale et catalogues externes, ajout rapide au journal.',
}

export default function DiscoverPage() {
  return (
    <div className="mx-auto max-w-7xl space-y-10 px-4 py-8 sm:px-6 lg:px-8">
      <header className="space-y-2">
        <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">Découvrir</h1>
        <p className="max-w-2xl text-sm text-muted-foreground sm:text-base">
          Classements basés sur les notes et les ajouts au journal sur Trace, complétés par des
          suggestions des catalogues quand il manque de données locales. La recherche interroge
          d’abord la base Trace (plein texte), puis les API externes si besoin.
        </p>
      </header>

      <DiscoverSearchBar />

      <TrendingHero />

      <MediaGrid limit={24} />
    </div>
  )
}
