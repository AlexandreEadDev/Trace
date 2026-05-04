'use client'

import { useEffect, useState } from 'react'
import { Lock, BookCheck, BookMarked, Trash2 } from 'lucide-react'
import { useMode } from '@/context/ModeContext'
import type { ModeAccent } from '@/context/ModeContext'
import { createClient } from '@/lib/supabase/client'
import { ReviewForm } from '@/components/ReviewForm'
import { Separator } from '@/components/ui/separator'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { cn } from '@/lib/utils'
import { MODE_STATUS_LABELS } from '@/types'
import type { LibraryEntry as LibraryEntryType, Review, ItemType, StatusType } from '@/types'

interface PersonalSpaceProps {
  itemId: string
  itemType: ItemType
}

function QuickAddButton({
  entry,
  itemType,
  accent,
  onAdd,
  onComplete,
  onRemove,
  loading,
}: {
  entry: LibraryEntryType | null
  itemType: ItemType
  accent: ModeAccent
  onAdd: () => void
  onComplete: () => void
  onRemove: () => void
  loading: boolean
}) {
  const labels = MODE_STATUS_LABELS[itemType]

  if (!entry) {
    return (
      <button
        onClick={onAdd}
        disabled={loading}
        className={cn(
          'flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-semibold text-white transition-all hover:shadow-md active:scale-95 disabled:opacity-60',
          `bg-${accent}-600 hover:bg-${accent}-700`
        )}
      >
        <BookMarked className="h-4 w-4" />
        {labels.backlog}
      </button>
    )
  }

  if (entry.status === 'backlog') {
    return (
      <div className="flex items-center gap-2 flex-wrap">
        <span className={cn('inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium', `bg-${accent}-100 text-${accent}-700`)}>
          <BookMarked className="h-3.5 w-3.5" />
          {labels.backlog}
        </span>
        <button
          onClick={onComplete}
          disabled={loading}
          className="flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-sm font-medium transition-colors hover:bg-muted disabled:opacity-60"
        >
          <BookCheck className="h-3.5 w-3.5" />
          Marquer comme terminé
        </button>
        <button
          onClick={onRemove}
          disabled={loading}
          className="rounded-lg border border-destructive/30 px-2.5 py-1.5 text-destructive hover:bg-destructive/5 transition-colors disabled:opacity-60"
          title="Retirer de ma bibliothèque"
        >
          <Trash2 className="h-3.5 w-3.5" />
        </button>
      </div>
    )
  }

  // completed
  return (
    <div className="flex items-center gap-2 flex-wrap">
      <span className={cn('inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium', `bg-${accent}-100 text-${accent}-700`)}>
        <BookCheck className="h-3.5 w-3.5" />
        {labels.completed}
      </span>
      <button
        onClick={onRemove}
        disabled={loading}
        className="rounded-lg border border-destructive/30 px-2.5 py-1.5 text-destructive hover:bg-destructive/5 transition-colors disabled:opacity-60"
        title="Retirer de ma bibliothèque"
      >
        <Trash2 className="h-3.5 w-3.5" />
      </button>
    </div>
  )
}

export function PersonalSpace({ itemId, itemType }: PersonalSpaceProps) {
  const { accent } = useMode()
  const [userId, setUserId] = useState<string | null>(null)
  const [review, setReview] = useState<Review | null>(null)
  const [libraryEntry, setLibraryEntry] = useState<LibraryEntryType | null>(null)
  const [notes, setNotes] = useState('')
  const [notesDirty, setNotesDirty] = useState(false)
  const [saving, setSaving] = useState(false)
  const [quickLoading, setQuickLoading] = useState(false)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const supabase = createClient()
    async function load() {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { setLoading(false); return }
      setUserId(user.id)

      const [{ data: reviewData }, { data: libraryData }] = await Promise.all([
        supabase.from('reviews').select('*').eq('item_id', itemId).eq('user_id', user.id).maybeSingle(),
        supabase.from('user_libraries').select('*').eq('item_id', itemId).eq('user_id', user.id).maybeSingle(),
      ])

      setReview(reviewData as Review | null)
      const entry = libraryData as LibraryEntryType | null
      setLibraryEntry(entry)
      setNotes(entry?.private_notes ?? '')
      setLoading(false)
    }
    load()
  }, [itemId])

  // Debounce note autosave
  useEffect(() => {
    if (!notesDirty || !userId || !libraryEntry) return
    const timer = setTimeout(async () => {
      setSaving(true)
      const supabase = createClient()
      const { data } = await supabase
        .from('user_libraries')
        .update({ private_notes: notes.trim() || null })
        .eq('id', libraryEntry.id)
        .select()
        .single()
      if (data) setLibraryEntry(data as LibraryEntryType)
      setSaving(false)
      setNotesDirty(false)
    }, 1500)
    return () => clearTimeout(timer)
  }, [notes, notesDirty, userId, libraryEntry])

  const quickAdd = async (status: StatusType) => {
    if (!userId) return
    setQuickLoading(true)
    const supabase = createClient()
    const { data } = await supabase
      .from('user_libraries')
      .upsert({ user_id: userId, item_id: itemId, status }, { onConflict: 'user_id,item_id' })
      .select()
      .single()
    if (data) {
      setLibraryEntry(data as LibraryEntryType)
      setNotes(data.private_notes ?? '')
    }
    setQuickLoading(false)
  }

  const quickRemove = async () => {
    if (!userId || !libraryEntry) return
    setQuickLoading(true)
    const supabase = createClient()
    await supabase.from('user_libraries').delete().eq('id', libraryEntry.id)
    setLibraryEntry(null)
    setNotes('')
    setQuickLoading(false)
  }

  if (loading) return <div className="h-32 animate-pulse rounded-xl border bg-muted" />

  if (!userId) {
    return (
      <div className={cn('rounded-xl border-2 border-dashed p-6 text-center', `border-${accent}-200`)}>
        <p className="text-sm text-muted-foreground">
          <a href="/login" className={cn('font-medium underline', `text-${accent}-600`)}>
            Connecte-toi
          </a>{' '}
          pour noter cet élément et le suivre dans ta bibliothèque.
        </p>
      </div>
    )
  }

  return (
    <div className={cn('rounded-xl border-2 p-6 space-y-6', `border-${accent}-200 bg-${accent}-50/30`)}>
      <div className="flex items-center gap-2">
        <Lock className={cn('h-4 w-4', `text-${accent}-600`)} />
        <h3 className={cn('font-semibold', `text-${accent}-700`)}>Mon Espace Personnel</h3>
      </div>

      {/* Quick status button */}
      <div className="space-y-1.5">
        <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Statut</p>
        <QuickAddButton
          entry={libraryEntry}
          itemType={itemType}
          accent={accent}
          onAdd={() => quickAdd('backlog')}
          onComplete={() => quickAdd('completed')}
          onRemove={quickRemove}
          loading={quickLoading}
        />
      </div>

      <Separator />

      {/* Rating + public comment */}
      <div className="space-y-2">
        <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          Note & avis public
        </p>
        <ReviewForm
          itemId={itemId}
          userId={userId}
          existing={review}
          onSaved={setReview}
        />
      </div>

      <Separator />

      {/* Private notes */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Journal privé
          </p>
          {saving && (
            <span className="text-xs text-muted-foreground animate-pulse">Enregistrement…</span>
          )}
          {!saving && notesDirty === false && libraryEntry?.private_notes && (
            <span className="text-xs text-muted-foreground">Sauvegardé</span>
          )}
        </div>
        <Textarea
          placeholder={`Tes impressions, citations, spoilers… (sauvegarde automatique)`}
          value={notes}
          onChange={(e) => {
            setNotes(e.target.value)
            if (libraryEntry) setNotesDirty(true)
          }}
          rows={6}
          className="resize-y min-h-[150px] text-sm"
          disabled={!libraryEntry}
        />
        {!libraryEntry && (
          <p className="text-xs text-muted-foreground">
            Ajoute d&apos;abord cet élément à ta bibliothèque pour écrire des notes.
          </p>
        )}
      </div>

      {/* Save notes manually if not in library yet */}
      {libraryEntry && notesDirty && (
        <Button
          size="sm"
          onClick={async () => {
            setSaving(true)
            const supabase = createClient()
            const { data } = await supabase
              .from('user_libraries')
              .update({ private_notes: notes.trim() || null })
              .eq('id', libraryEntry.id)
              .select()
              .single()
            if (data) setLibraryEntry(data as LibraryEntryType)
            setSaving(false)
            setNotesDirty(false)
          }}
          className={cn(`bg-${accent}-600 hover:bg-${accent}-700 text-white`)}
        >
          Sauvegarder les notes
        </Button>
      )}
    </div>
  )
}
