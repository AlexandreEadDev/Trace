'use client'

import { useState } from 'react'
import { useMode } from '@/context/ModeContext'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { cn } from '@/lib/utils'
import { MODE_STATUS_LABELS, type LibraryEntry as LibraryEntryType, type StatusType } from '@/types'

interface LibraryEntryProps {
  itemId: string
  userId: string
  existing: LibraryEntryType | null
  onSaved: (entry: LibraryEntryType) => void
}

export function LibraryEntry({ itemId, userId, existing, onSaved }: LibraryEntryProps) {
  const { mode, accent } = useMode()
  const labels = MODE_STATUS_LABELS[mode]
  const [status, setStatus] = useState<StatusType>(existing?.status ?? 'backlog')
  const [notes, setNotes] = useState(existing?.private_notes ?? '')
  const [saving, setSaving] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setSaving(true)
    const supabase = createClient()
    const payload = {
      user_id: userId,
      item_id: itemId,
      status,
      private_notes: notes.trim() || null,
    }
    const { data, error } = existing
      ? await supabase
          .from('user_libraries')
          .update({ status, private_notes: payload.private_notes })
          .eq('id', existing.id)
          .select()
          .single()
      : await supabase.from('user_libraries').insert(payload).select().single()

    setSaving(false)
    if (!error && data) onSaved(data as LibraryEntryType)
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      {/* Status toggle */}
      <div className="space-y-1.5">
        <Label>Statut</Label>
        <div className="flex rounded-lg border overflow-hidden">
          {(['backlog', 'completed'] as StatusType[]).map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => setStatus(s)}
              className={cn(
                'flex-1 py-2 text-sm font-medium transition-colors',
                status === s
                  ? `bg-${accent}-600 text-white`
                  : 'bg-card hover:bg-muted text-muted-foreground'
              )}
            >
              {labels[s]}
            </button>
          ))}
        </div>
      </div>

      {/* Private notes */}
      <div className="space-y-1.5">
        <Label htmlFor="private-notes">
          Notes privées{' '}
          <span className="text-xs font-normal text-muted-foreground">
            (visibles uniquement par toi)
          </span>
        </Label>
        <Textarea
          id="private-notes"
          placeholder="Tes impressions, citations, avancement, spoilers..."
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          rows={6}
          className="resize-y min-h-[120px]"
        />
      </div>

      <Button
        type="submit"
        disabled={saving}
        className={cn('transition-colors', `bg-${accent}-600 hover:bg-${accent}-700 text-white`)}
      >
        {saving ? 'Enregistrement…' : existing ? 'Mettre à jour' : 'Ajouter à ma bibliothèque'}
      </Button>
    </form>
  )
}
