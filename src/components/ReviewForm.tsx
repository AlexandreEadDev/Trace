'use client'

import { useState } from 'react'
import { Star } from 'lucide-react'
import { useMode } from '@/context/ModeContext'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { cn } from '@/lib/utils'
import type { Review } from '@/types'

interface ReviewFormProps {
  itemId: string
  userId: string
  existing: Review | null
  onSaved: (review: Review) => void
}

export function ReviewForm({ itemId, userId, existing, onSaved }: ReviewFormProps) {
  const { accent } = useMode()
  const [rating, setRating] = useState(existing?.rating ?? 0)
  const [hovered, setHovered] = useState(0)
  const [comment, setComment] = useState(existing?.public_comment ?? '')
  const [saving, setSaving] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!rating) return
    setSaving(true)

    const supabase = createClient()
    const payload = {
      user_id: userId,
      item_id: itemId,
      rating,
      public_comment: comment.trim() || null,
    }

    const { data, error } = existing
      ? await supabase
          .from('reviews')
          .update({ rating, public_comment: payload.public_comment })
          .eq('id', existing.id)
          .select()
          .single()
      : await supabase.from('reviews').insert(payload).select().single()

    setSaving(false)
    if (!error && data) onSaved(data as Review)
  }

  const displayRating = hovered || rating

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {/* Half-star rating */}
      <div className="space-y-1.5">
        <Label>Votre note</Label>
        <div className="flex items-center gap-0.5">
          {[1, 2, 3, 4, 5].map((star) => {
            const full = star <= Math.floor(displayRating)
            const half = !full && star === Math.ceil(displayRating) && displayRating % 1 === 0.5
            return (
              <div key={star} className="relative h-8 w-8">
                {/* Empty star base */}
                <Star className="h-8 w-8 fill-muted text-muted-foreground" />
                {/* Filled overlay (full or half) */}
                {(full || half) && (
                  <div className={cn('absolute inset-0 overflow-hidden', half ? 'w-1/2' : 'w-full')}>
                    <Star className={cn('h-8 w-8', `fill-${accent}-500 text-${accent}-500`)} />
                  </div>
                )}
                {/* Left half hitbox → n - 0.5 */}
                <button
                  type="button"
                  aria-label={`${star - 0.5} étoiles`}
                  className="absolute inset-y-0 left-0 w-1/2 focus:outline-none"
                  onMouseEnter={() => setHovered(star - 0.5)}
                  onMouseLeave={() => setHovered(0)}
                  onClick={() => setRating(star - 0.5)}
                />
                {/* Right half hitbox → n */}
                <button
                  type="button"
                  aria-label={`${star} étoiles`}
                  className="absolute inset-y-0 right-0 w-1/2 focus:outline-none"
                  onMouseEnter={() => setHovered(star)}
                  onMouseLeave={() => setHovered(0)}
                  onClick={() => setRating(star)}
                />
              </div>
            )
          })}
          {rating > 0 && (
            <span className={cn('ml-2 text-sm font-semibold tabular-nums', `text-${accent}-600`)}>
              {rating % 1 === 0 ? rating : rating.toFixed(1)}/5
            </span>
          )}
        </div>
      </div>

      {/* Comment */}
      <div className="space-y-1.5">
        <Label htmlFor="public-comment">Commentaire public (optionnel)</Label>
        <Textarea
          id="public-comment"
          placeholder="Partagez votre opinion..."
          value={comment}
          onChange={(e) => setComment(e.target.value)}
          rows={3}
          className="resize-none"
        />
      </div>

      <Button
        type="submit"
        disabled={!rating || saving}
        className={cn(
          'transition-colors',
          `bg-${accent}-600 hover:bg-${accent}-700 text-white`
        )}
      >
        {saving ? 'Enregistrement…' : existing ? 'Mettre à jour' : 'Publier'}
      </Button>
    </form>
  )
}
