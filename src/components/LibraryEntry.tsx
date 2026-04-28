'use client'

import { useState } from 'react'
import { useMode } from '@/context/ModeContext'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { cn } from '@/lib/utils'
import { STATUS_LABELS, type LibraryEntry as LibraryEntryType, type StatusType } from '@/types'

interface LibraryEntryProps {
  itemId: string
  userId: string
  existing: LibraryEntryType | null
  onSaved: (entry: LibraryEntryType) => void
}

export function LibraryEntry({ itemId, userId, existing, onSaved }: LibraryEntryProps) {
  const { accent } = useMode()
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
    <form onSubmit={handleSubmit} className="space-y-4">
      {/* Status */}
      <div className="space-y-1.5">
        <Label>Statut</Label>
        <Select value={status} onValueChange={(v) => setStatus(v as StatusType)}>
          <SelectTrigger className="w-48">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {(Object.entries(STATUS_LABELS) as [StatusType, string][]).map(
              ([value, label]) => (
                <SelectItem key={value} value={value}>
                  {label}
                </SelectItem>
              )
            )}
          </SelectContent>
        </Select>
      </div>

      {/* Private notes */}
      <div className="space-y-1.5">
        <Label htmlFor="private-notes">
          Notes privées{' '}
          <span className="text-xs font-normal text-muted-foreground">
            (visibles uniquement par vous)
          </span>
        </Label>
        <Textarea
          id="private-notes"
          placeholder="Vos impressions, citations, avancement..."
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          rows={4}
          className="resize-none"
        />
      </div>

      <Button
        type="submit"
        disabled={saving}
        className={cn(
          'transition-colors',
          `bg-${accent}-600 hover:bg-${accent}-700 text-white`
        )}
      >
        {saving ? 'Enregistrement…' : existing ? 'Mettre à jour' : 'Ajouter à ma bibliothèque'}
      </Button>
    </form>
  )
}
