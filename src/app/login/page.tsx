'use client'

export const dynamic = 'force-dynamic'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Crosshair, Eye, EyeOff, BookOpen, Gamepad2, Film } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { cn } from '@/lib/utils'

export default function LoginPage() {
  const router = useRouter()

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)

  const resetState = () => {
    setError(null)
    setSuccess(null)
  }

  const handleSignIn = async (e: React.FormEvent) => {
    e.preventDefault()
    resetState()
    setLoading(true)
    const supabase = createClient()
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    setLoading(false)
    if (error) {
      setError('Email ou mot de passe incorrect.')
    } else {
      router.push('/')
      router.refresh()
    }
  }

  const handleSignUp = async (e: React.FormEvent) => {
    e.preventDefault()
    resetState()
    setLoading(true)
    const supabase = createClient()
    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: { emailRedirectTo: `${window.location.origin}/` },
    })
    setLoading(false)
    if (error) {
      setError(error.message)
    } else {
      setSuccess('Compte créé ! Vérifie ta boîte email pour confirmer ton adresse.')
    }
  }

  return (
    <div className="flex min-h-[calc(100vh-4rem)]">
      {/* Left panel — branding */}
      <div className="hidden lg:flex lg:w-1/2 flex-col justify-between p-12 bg-slate-900 text-white">
        <div className="flex items-center gap-2">
          <Crosshair className="h-6 w-6 text-slate-300" />
          <span className="text-xl font-bold tracking-tight">Trace</span>
        </div>

        <div className="space-y-6">
          <h2 className="text-4xl font-extrabold leading-tight">
            Garde une trace<br />de tout ce que<br />tu consommes.
          </h2>
          <p className="text-slate-400 text-lg">
            Livres, jeux vidéo, films — un seul compte pour tout suivre, noter et archiver.
          </p>

          <div className="flex flex-col gap-3 pt-2">
            {[
              { Icon: BookOpen, color: 'text-amber-400', label: 'Bibliothèque', desc: 'Tes lectures et avis' },
              { Icon: Gamepad2, color: 'text-indigo-400', label: 'Ludothèque', desc: 'Tes jeux et progressions' },
              { Icon: Film, color: 'text-rose-400', label: 'Cinémathèque', desc: 'Tes films et critiques' },
            ].map(({ Icon, color, label, desc }) => (
              <div key={label} className="flex items-center gap-3">
                <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-slate-800">
                  <Icon className={cn('h-4.5 w-4.5', color)} />
                </div>
                <div>
                  <p className="text-sm font-medium">{label}</p>
                  <p className="text-xs text-slate-500">{desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>

        <p className="text-xs text-slate-600">
          © {new Date().getFullYear()} Trace — Tous droits réservés
        </p>
      </div>

      {/* Right panel — auth form */}
      <div className="flex flex-1 flex-col items-center justify-center px-6 py-12 sm:px-12">
        <div className="w-full max-w-sm space-y-8">
          {/* Mobile logo */}
          <div className="flex flex-col items-center gap-1 text-center lg:hidden">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-slate-100">
              <Crosshair className="h-6 w-6 text-slate-700" />
            </div>
            <h1 className="text-2xl font-bold tracking-tight">Trace</h1>
            <p className="text-sm text-muted-foreground">
              Un seul compte pour tous tes contenus
            </p>
          </div>

          {/* Desktop heading */}
          <div className="hidden lg:block space-y-1">
            <h1 className="text-2xl font-bold tracking-tight">Bon retour !</h1>
            <p className="text-sm text-muted-foreground">
              Connecte-toi ou crée ton compte Trace.
            </p>
          </div>

          <div className="rounded-2xl border bg-card p-6 shadow-sm">
            <Tabs defaultValue="signin" onValueChange={resetState}>
              <TabsList className="w-full mb-6">
                <TabsTrigger value="signin" className="flex-1">
                  Connexion
                </TabsTrigger>
                <TabsTrigger value="signup" className="flex-1">
                  Inscription
                </TabsTrigger>
              </TabsList>

              {/* Sign In */}
              <TabsContent value="signin">
                <form onSubmit={handleSignIn} className="space-y-5">
                  <div className="space-y-1.5">
                    <Label htmlFor="signin-email">Adresse email</Label>
                    <Input
                      id="signin-email"
                      type="email"
                      placeholder="toi@exemple.fr"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      required
                      autoComplete="email"
                      className="h-11 text-base"
                    />
                  </div>

                  <div className="space-y-1.5">
                    <Label htmlFor="signin-password">Mot de passe</Label>
                    <div className="relative">
                      <Input
                        id="signin-password"
                        type={showPassword ? 'text' : 'password'}
                        placeholder="••••••••"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        required
                        autoComplete="current-password"
                        className="h-11 text-base pr-10"
                      />
                      <button
                        type="button"
                        onClick={() => setShowPassword((v) => !v)}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                      >
                        {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                      </button>
                    </div>
                  </div>

                  {error && <p className="text-sm text-destructive">{error}</p>}

                  <Button
                    type="submit"
                    disabled={loading}
                    className="w-full h-11 bg-slate-900 hover:bg-slate-800 text-white text-base"
                  >
                    {loading ? 'Connexion…' : 'Se connecter'}
                  </Button>
                </form>
              </TabsContent>

              {/* Sign Up */}
              <TabsContent value="signup">
                <form onSubmit={handleSignUp} className="space-y-5">
                  <div className="space-y-1.5">
                    <Label htmlFor="signup-email">Adresse email</Label>
                    <Input
                      id="signup-email"
                      type="email"
                      placeholder="toi@exemple.fr"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      required
                      autoComplete="email"
                      className="h-11 text-base"
                    />
                  </div>

                  <div className="space-y-1.5">
                    <Label htmlFor="signup-password">
                      Mot de passe{' '}
                      <span className="text-xs font-normal text-muted-foreground">
                        (6 caractères min.)
                      </span>
                    </Label>
                    <div className="relative">
                      <Input
                        id="signup-password"
                        type={showPassword ? 'text' : 'password'}
                        placeholder="••••••••"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        required
                        minLength={6}
                        autoComplete="new-password"
                        className="h-11 text-base pr-10"
                      />
                      <button
                        type="button"
                        onClick={() => setShowPassword((v) => !v)}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                      >
                        {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                      </button>
                    </div>
                  </div>

                  {error && <p className="text-sm text-destructive">{error}</p>}
                  {success && (
                    <p className="text-sm font-medium text-emerald-600 bg-emerald-50 rounded-lg p-3">
                      {success}
                    </p>
                  )}

                  <Button
                    type="submit"
                    disabled={loading}
                    className="w-full h-11 bg-slate-900 hover:bg-slate-800 text-white text-base"
                  >
                    {loading ? 'Création…' : 'Créer mon compte'}
                  </Button>
                </form>
              </TabsContent>
            </Tabs>
          </div>

          <p className="text-center text-xs text-muted-foreground">
            En continuant, tu acceptes nos conditions d&apos;utilisation.
          </p>
        </div>
      </div>
    </div>
  )
}
