'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'
import { useRouter, usePathname } from 'next/navigation'
import { Crosshair, Compass, LayoutDashboard, LogIn, LogOut, Library, Menu, X } from 'lucide-react'
import type { User } from '@supabase/supabase-js'
import { ModeSwitch } from './ModeSwitch'
import { useMode } from '@/context/ModeContext'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

export function Navbar() {
  const { accent } = useMode()
  const [user, setUser] = useState<User | null>(null)
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)
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
    setMobileMenuOpen(false)
    router.push('/')
    router.refresh()
  }

  useEffect(() => {
    setMobileMenuOpen(false)
  }, [pathname])

  return (
    <nav className="sticky top-0 z-50 border-b bg-background/80 backdrop-blur-md">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="flex h-14 items-center justify-between gap-2 sm:h-16 sm:gap-3">
          {/* Gauche : logo + modes Livres / Jeux / Films (tablette & PC) */}
          <div className="flex min-w-0 flex-1 items-center gap-2 sm:gap-3 md:gap-10 lg:gap-12">
            <Link href="/" className="flex shrink-0 items-center gap-2">
              <Crosshair className={cn('h-5 w-5 sm:h-6 sm:w-6', `text-${accent}-600`)} />
              <span className="text-lg font-bold tracking-tight sm:text-xl">Trace</span>
            </Link>
            <div className="hidden min-w-0 md:block">
              <ModeSwitch />
            </div>
          </div>

          {/* Right actions (desktop) */}
          <div className="hidden shrink-0 items-center gap-1 md:flex">
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
              <span className="hidden lg:inline">Catalogue</span>
            </Link>

            <Link
              href="/discover"
              className={cn(
                'inline-flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-sm font-medium transition-colors',
                pathname === '/discover'
                  ? `text-${accent}-600 bg-${accent}-50`
                  : 'hover:bg-muted'
              )}
            >
              <Compass className="h-4 w-4" />
              <span className="hidden lg:inline">Découvrir</span>
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
                  <span className="hidden lg:inline">Dashboard</span>
                </Link>
                <Button variant="ghost" size="sm" onClick={handleSignOut}>
                  <LogOut className="h-4 w-4" />
                  <span className="hidden lg:inline">Déconnexion</span>
                </Button>
              </>
            ) : (
              <Link
                href="/login"
                className="inline-flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-sm font-medium hover:bg-muted transition-colors"
              >
                <LogIn className="h-4 w-4" />
                <span className="hidden lg:inline">Connexion</span>
              </Link>
            )}
          </div>

          {/* Mobile actions */}
          <button
            type="button"
            aria-label={mobileMenuOpen ? 'Fermer le menu' : 'Ouvrir le menu'}
            onClick={() => setMobileMenuOpen((v) => !v)}
            className="inline-flex items-center justify-center rounded-lg p-2 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground md:hidden"
          >
            {mobileMenuOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </button>
        </div>

        {mobileMenuOpen && (
          <div className="border-t py-3 md:hidden">
            <div className="mb-3 flex justify-center">
              <ModeSwitch />
            </div>
            <div className="grid grid-cols-1 gap-1.5 text-sm">
              <Link
                href="/catalog"
                className={cn(
                  'inline-flex items-center gap-2 rounded-lg px-3 py-2 font-medium transition-colors',
                  pathname === '/catalog'
                    ? `bg-${accent}-50 text-${accent}-700`
                    : 'hover:bg-muted'
                )}
              >
                <Library className="h-4 w-4" />
                Catalogue
              </Link>

              <Link
                href="/discover"
                className={cn(
                  'inline-flex items-center gap-2 rounded-lg px-3 py-2 font-medium transition-colors',
                  pathname === '/discover'
                    ? `bg-${accent}-50 text-${accent}-700`
                    : 'hover:bg-muted'
                )}
              >
                <Compass className="h-4 w-4" />
                Découvrir
              </Link>

              {user ? (
                <>
                  <Link
                    href="/dashboard"
                    className={cn(
                      'inline-flex items-center gap-2 rounded-lg px-3 py-2 font-medium transition-colors',
                      pathname === '/dashboard'
                        ? `bg-${accent}-50 text-${accent}-700`
                        : 'hover:bg-muted'
                    )}
                  >
                    <LayoutDashboard className="h-4 w-4" />
                    Dashboard
                  </Link>
                  <button
                    type="button"
                    onClick={handleSignOut}
                    className="inline-flex items-center gap-2 rounded-lg px-3 py-2 text-left font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                  >
                    <LogOut className="h-4 w-4" />
                    Déconnexion
                  </button>
                </>
              ) : (
                <Link
                  href="/login"
                  className="inline-flex items-center gap-2 rounded-lg px-3 py-2 font-medium transition-colors hover:bg-muted"
                >
                  <LogIn className="h-4 w-4" />
                  Connexion
                </Link>
              )}
            </div>
          </div>
        )}
      </div>
    </nav>
  )
}
