export type ItemType = 'book' | 'game' | 'movie' | 'manga'
export type StatusType = 'backlog' | 'completed'

export interface Item {
  id: string
  title: string
  type: ItemType
  genre: string | null
  cover_url: string | null
  release_year: number | null
  duration_minutes: number | null
  external_source: string | null
  external_id: string | null
}

export interface Review {
  id: string
  user_id: string
  item_id: string
  rating: number
  public_comment: string | null
  created_at: string
}

export interface LibraryEntry {
  id: string
  user_id: string
  item_id: string
  status: StatusType
  private_notes: string | null
  created_at: string
}

export interface ItemWithReviews extends Item {
  reviews: { rating: number }[]
}

export interface ReviewWithItem extends Review {
  items: Item
}

export interface LibraryEntryWithItem extends LibraryEntry {
  items: Item
}

export const STATUS_LABELS: Record<StatusType, string> = {
  backlog: 'En attente',
  completed: 'Terminé',
}

export const MODE_STATUS_LABELS: Record<ItemType, Record<StatusType, string>> = {
  book: {
    backlog: 'À lire',
    completed: 'Lu',
  },
  game: {
    backlog: 'À faire',
    completed: 'Terminé',
  },
  movie: {
    backlog: 'À voir',
    completed: 'Vu',
  },
  manga: {
    backlog: 'À lire',
    completed: 'Lu',
  },
}
