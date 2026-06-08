import type { WatchOfferType } from './tmdb'

/**
 * TMDB does not expose per-provider deep links. We resolve the best outbound URL
 * per provider (search or catalog page) using TMDB provider_id + movie title.
 */
type UrlBuilder = (title: string, region: string) => string

const AMAZON_VIDEO_HOST: Record<string, string> = {
  FR: 'www.amazon.fr',
  US: 'www.amazon.com',
  GB: 'www.amazon.co.uk',
  DE: 'www.amazon.de',
  BE: 'www.amazon.fr',
  CA: 'www.amazon.ca',
  CH: 'www.amazon.fr',
}

/** Amazon Prime / Amazon Video — always the /gp/video/search path, not generic /s. */
function amazonVideoSearch(title: string, region: string): string {
  const host = AMAZON_VIDEO_HOST[region.toUpperCase()]
  if (host) return `https://${host}/gp/video/search?phrase=${title}`
  return `https://www.primevideo.com/search?phrase=${title}`
}

/** TMDB provider_id → URL builder (JustWatch-sourced IDs). */
const PROVIDER_URL_BUILDERS: Record<number, UrlBuilder> = {
  // Netflix (+ ad tier)
  8: (t) => `https://www.netflix.com/search?q=${t}`,
  1796: (t) => `https://www.netflix.com/search?q=${t}`,

  // Amazon Prime Video, Amazon Video, channels
  9: amazonVideoSearch,
  10: amazonVideoSearch,
  119: amazonVideoSearch,
  2100: amazonVideoSearch,
  1825: amazonVideoSearch,

  // Disney / Warner / Paramount
  337: (t) => `https://www.disneyplus.com/search?q=${t}`,
  1899: (t) => `https://www.max.com/search?q=${t}`,
  531: (t) => `https://www.paramountplus.com/search/${t}`,

  // Apple / Google / YouTube
  2: (t) => `https://tv.apple.com/fr/search?term=${t}`,
  3: (t) => `https://play.google.com/store/search?q=${t}&c=movies`,
  192: (t) => `https://www.youtube.com/results?search_query=${t}`,

  // France — VOD & TV
  35: (t) => `https://fr.rakuten.tv/search/${t}`,
  58: (t) => `https://www.canalplus.com/recherche/${t}`,
  389: (t) => `https://www.sooner.be/fr/search?q=${t}`,
  2601: (t) => `https://www.pathehome.fr/recherche?query=${t}`,
  56: (t) => `https://www.canalplus.com/recherche/${t}`,
  283: (t) => `https://www.crunchyroll.com/search?q=${t}`,

  // Other common EU providers
  350: (t) => `https://www.apple.com/fr/search/${t}?src=globalnav`,
  68: (t) => `https://www.mycanal.fr/recherche/${t}`,
  619: (t) => `https://www.starplus.com/search?q=${t}`,
  384: (t) => `https://www.max.com/search?q=${t}`,
}

function justWatchSearch(title: string, region: string): string {
  const locale = region.toLowerCase() === 'fr' ? 'fr' : region.toLowerCase()
  return `https://www.justwatch.com/${locale}/recherche?q=${title}`
}

function guessFromName(name: string, title: string, region: string): string | null {
  const n = name.toLowerCase()
  if (n.includes('netflix')) return PROVIDER_URL_BUILDERS[8](title, region)
  if (
    n.includes('prime video') ||
    n.includes('amazon prime') ||
    n.includes('amazon video') ||
    n.includes('amazon channel')
  ) {
    return amazonVideoSearch(title, region)
  }
  if (n.includes('disney')) return PROVIDER_URL_BUILDERS[337](title, region)
  if (n.includes('hbo') || n.includes('max')) return PROVIDER_URL_BUILDERS[1899](title, region)
  if (n.includes('apple tv') || n.includes('apple')) return PROVIDER_URL_BUILDERS[2](title, region)
  if (n.includes('google play')) return PROVIDER_URL_BUILDERS[3](title, region)
  if (n.includes('youtube')) return PROVIDER_URL_BUILDERS[192](title, region)
  if (n.includes('canal')) return PROVIDER_URL_BUILDERS[58](title, region)
  if (n.includes('rakuten')) return PROVIDER_URL_BUILDERS[35](title, region)
  if (n.includes('paramount')) return PROVIDER_URL_BUILDERS[531](title, region)
  return null
}

export function buildProviderWatchUrl(
  providerId: number,
  providerName: string,
  movieTitle: string,
  region: string,
  _offerType: WatchOfferType,
): string {
  const title = encodeURIComponent(movieTitle.trim())
  const builder = PROVIDER_URL_BUILDERS[providerId]
  if (builder) return builder(title, region)

  const guessed = guessFromName(providerName, title, region)
  if (guessed) return guessed

  return justWatchSearch(title, region)
}
