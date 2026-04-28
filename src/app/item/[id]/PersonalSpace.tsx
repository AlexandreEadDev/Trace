'use client'

import { useEffect, useState } from 'react'
import { Lock } from 'lucide-react'
import { useMode } from '@/context/ModeContext'
import { createClient } from '@/lib/supabase/client'
import { ReviewForm } from '@/components/ReviewForm'
import { LibraryEntry } from '@/components/LibraryEntry'
import { Separator } from '@/components/ui/separator'
import { cn } from '@/lib/utils'
import type { LibraryEntry as LibraryEntryType, Review } from '@/types'

export function PersonalSpace({ itemId }: { itemId: string }) {
  const { accent } = useMode()
  const [userId, setUserId] = useState<string | null>(null)
  const [review, setReview] = useState<Review | null>(null)
  const [libraryEntry, setLibraryEntry] = useState<LibraryEntryType | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const supabase = createClient()

    async function load() {
      const {
        data: { user },
      } = await supabase.auth.getUser()

      if (!user) {
        setLoading(false)
        return
      }

      setUserId(user.id)

      const [{ data: reviewData }, { data: libraryData }] = await Promise.all([
        supabase
          .from('reviews')
          .select('*')
          .eq('item_id', itemId)
          .eq('user_id', user.id)
          .maybeSingle(),
        supabase
          .from('user_libraries')
          .select('*')
          .eq('item_id', itemId)
          .eq('user_id', user.id)
          .maybeSingle(),
      ])

      setReview(reviewData as Review | null)
      setLibraryEntry(libraryData as LibraryEntryType | null)
      setLoading(false)
    }

    load()
  }, [itemId])

  if (loading) {
    return (
      <div className="h-32 animate-pulse rounded-xl border bg-muted" />
    )
  }

  if (!userId) {
    return (
      <div
        className={cn(
          'rounded-xl border-2 border-dashed p-6 text-center',
          `border-${accent}-200`
        )}
      >
        <p className="text-sm text-muted-foreground">
          <a href="/login" className={cn('font-medium underline', `text-${accent}-600`)}>
            Connectez-vous
          </a>{' '}
          pour noter cet élément et le suivre dans votre bibliothèque.
        </p>
      </div>
    )
  }

  return (
    <div
      className={cn(
        'rounded-xl border-2 p-6 space-y-6',
        `border-${accent}-200 bg-${accent}-100/30`
      )}
    >
      <div className="flex items-center gap-2">
        <Lock className={cn('h-4 w-4', `text-${accent}-600`)} />
        <h2 className={cn('font-semibold', `text-${accent}-700`)}>
          Mon Espace Personnel
        </h2>
      </div>

      <div className="space-y-2">
        <h3 className="text-sm font-medium text-muted-foreground uppercase tracking-wide">
          Note & avis public
        </h3>
        <ReviewForm
          itemId={itemId}
          userId={userId}
          existing={review}
          onSaved={setReview}
        />
      </div>

      <Separator />

      <div className="space-y-2">
        <h3 className="text-sm font-medium text-muted-foreground uppercase tracking-wide">
          Journal de bord privé
        </h3>
        <LibraryEntry
          itemId={itemId}
          userId={userId}
          existing={libraryEntry}
          onSaved={setLibraryEntry}
        />
      </div>
    </div>
  )
}
