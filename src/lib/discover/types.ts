import type { ItemType } from '@/types'

export type DiscoverItemKind = 'local' | 'external'

export interface DiscoverPopularItem {
  kind: DiscoverItemKind
  /** Supabase items.id when synced / from RPC */
  itemId: string | null
  /** Encoded catalog id when external or when linking by source */
  catalogId: string | null
  title: string
  type: ItemType
  coverUrl: string | null
  communityAvg: number | null
  engagementScore: number | null
  sparkline: number[]
}

export interface DiscoverSearchResult {
  kind: DiscoverItemKind
  itemId: string | null
  catalogId: string | null
  title: string
  type: ItemType
  coverUrl: string | null
  communityAvg: number | null
}
