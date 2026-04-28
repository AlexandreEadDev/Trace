'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'
import { useRouter, usePathname } from 'next/navigation'
import { BookMarked, LayoutDashboard, LogIn, LogOut, Library } from 'lucide-react'
import type { User } from '@supabase/supabase-js'
import { ModeSwitch } from './ModeSwitch'
import { useMode } from '@/context/ModeContext'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

export function Navbar() {
  const { accent } = useMode()
  const [user, setUser] = useState<User | null>(null)
  const router = useRouter()
  const pathname = usePathname()

  useEffect(() => {
    const supabase = createClient()

    supabase.auth.getUser().then(({ data }) => setUser(data.user))

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null)
    })

    return () => subscription.unsubscribe()
  }, [])

  const handleSignOut = async () => {
    const supabase = createClient()
    await supabase.auth.signOut()
    router.push('/')
    router.refresh()
  }

  return (
    <nav className="sticky top-0 z-50 border-b bg-background/80 backdrop-blur-md">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="flex h-16 items-center justify-between gap-4">
          {/* Logo */}
          <Link href="/" className="flex shrink-0 items-center gap-2">
            <BookMarked className={cn('h-6 w-6', `text-${accent}-600`)} />
            <span className="text-xl font-bold tracking-tight">LogBook</span>
          </Link>

          {/* Center: mode toggle */}
          <div className="flex-1 flex justify-center">
            <ModeSwitch />
          </div>

          {/* Right actions */}
          <div className="flex shrink-0 items-center gap-1">
            <Link
              href="/catalog"
              className={cn(
                'inline-flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-sm font-medium transition-colors',
                pathname === '/catalog'
                  ? `text-${accent}-600 bg-${accent}-50`
                  : 'hover:bg-muted'
              )}
            >
              <Library className="h-4 w-4" />
              <span className="hidden sm:inline">Catalogue</span>
            </Link>

            {user ? (
              <>
                <Link
                  href="/dashboard"
                  className={cn(
                    'inline-flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-sm font-medium transition-colors',
                    pathname === '/dashboard'
                      ? `text-${accent}-600 bg-${accent}-50`
                      : 'hover:bg-muted'
                  )}
                >
                  <LayoutDashboard className="h-4 w-4" />
                  <span className="hidden sm:inline">Dashboard</span>
                </Link>
                <Button variant="ghost" size="sm" onClick={handleSignOut}>
                  <LogOut className="mr-1 h-4 w-4" />
                  <span className="hidden sm:inline">Déconnexion</span>
                </Button>
              </>
            ) : (
              <Link
                href="/login"
                className="inline-flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-sm font-medium hover:bg-muted transition-colors"
              >
                <LogIn className="h-4 w-4" />
                Connexion
              </Link>
            )}
          </div>
        </div>
      </div>
    </nav>
  )
}
