import type { DiscoverPopularItem, DiscoverSearchResult } from '@/lib/discover/types'

export function discoverItemHref(
  row: Pick<DiscoverPopularItem, 'itemId' | 'catalogId'>
): string {
  if (row.itemId) return `/item/${row.itemId}`
  if (row.catalogId) return `/item/${encodeURIComponent(row.catalogId)}`
  return '#'
}

export function discoverSearchHref(row: DiscoverSearchResult): string {
  if (row.itemId) return `/item/${row.itemId}`
  if (row.catalogId) return `/item/${encodeURIComponent(row.catalogId)}`
  return '#'
}
