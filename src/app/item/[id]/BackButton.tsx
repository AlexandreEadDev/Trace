'use client'

import { useRouter } from 'next/navigation'
import { ArrowLeft } from 'lucide-react'

/**
 * Smart back button: tries to navigate to the previous history entry first
 * (so e.g. arriving from the dashboard returns there), falling back to the
 * catalog when the page was loaded directly via URL (no history available).
 */
export function BackButton({ fallbackHref = '/catalog' }: { fallbackHref?: string }) {
  const router = useRouter()

  const handleClick = () => {
    if (typeof window !== 'undefined' && window.history.length > 1) {
      router.back()
      return
    }
    router.push(fallbackHref)
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
    >
      <ArrowLeft className="h-4 w-4" />
      Retour
    </button>
  )
}
