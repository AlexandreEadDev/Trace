'use client'

export const dynamic = 'force-dynamic'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Crosshair, Eye, EyeOff, Mail } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'

export default function LoginPage() {
  const router = useRouter()

  const [activeTab, setActiveTab] = useState<'signin' | 'signup'>('signin')
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
    <div className="flex min-h-[calc(100vh-3.5rem)] items-center justify-center bg-slate-950 px-3 py-6 sm:min-h-[calc(100vh-4rem)] sm:px-5 sm:py-10">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,_rgba(71,85,105,0.35),_transparent_55%)]" />
      <div className="relative z-10 w-full max-w-md rounded-3xl border border-slate-200 bg-white p-4 shadow-2xl sm:max-w-xl sm:p-9">
        <div className="mb-5 flex items-center justify-center gap-2 text-slate-800 sm:mb-7">
          <Crosshair className="h-4 w-4 sm:h-5 sm:w-5" />
          <span className="text-base font-bold tracking-tight sm:text-lg">Trace</span>
        </div>

        <div className="mx-auto mb-4 flex w-full max-w-md items-center rounded-full bg-slate-100 p-1 sm:mb-6">
          <button
            type="button"
            onClick={() => {
              setActiveTab('signin')
              resetState()
            }}
            className={`h-9 flex-1 rounded-full text-xs font-semibold transition sm:h-11 sm:text-sm ${
              activeTab === 'signin'
                ? 'bg-slate-900 text-white shadow-md'
                : 'text-slate-500 hover:text-slate-700'
            }`}
          >
            Connexion
          </button>
          <button
            type="button"
            onClick={() => {
              setActiveTab('signup')
              resetState()
            }}
            className={`h-9 flex-1 rounded-full text-xs font-semibold transition sm:h-11 sm:text-sm ${
              activeTab === 'signup'
                ? 'bg-slate-900 text-white shadow-md'
                : 'text-slate-500 hover:text-slate-700'
            }`}
          >
            Inscription
          </button>
        </div>

        <h1 className="mb-1.5 text-center text-2xl font-extrabold tracking-tight text-slate-900 sm:mb-2 sm:text-4xl">
          {activeTab === 'signin' ? 'Bon retour !' : 'Créer ton compte'}
        </h1>
        <p className="mb-5 text-center text-xs text-slate-500 sm:mb-8 sm:text-sm">
          {activeTab === 'signin'
            ? 'Connecte-toi pour retrouver ta bibliothèque, ludothèque et cinémathèque.'
            : 'Inscris-toi en quelques secondes et commence à tout suivre au même endroit.'}
        </p>

        <form onSubmit={activeTab === 'signin' ? handleSignIn : handleSignUp} className="mx-auto w-full max-w-md space-y-4 sm:space-y-5">
          <div className="relative">
            <Input
              id="auth-email"
              type="email"
              placeholder="you@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              autoComplete="email"
              className="h-10 rounded-xl border-slate-200 bg-slate-50 pr-10 text-sm text-slate-800 placeholder:text-slate-400 sm:h-12 sm:pr-12 sm:text-base"
            />
            <Mail className="pointer-events-none absolute right-3.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-500 sm:right-4 sm:h-4 sm:w-4" />
          </div>

          <div className="relative">
            <Input
              id="auth-password"
              type={showPassword ? 'text' : 'password'}
              placeholder="••••••••••"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              minLength={activeTab === 'signup' ? 6 : undefined}
              autoComplete={activeTab === 'signin' ? 'current-password' : 'new-password'}
              className="h-10 rounded-xl border-slate-200 bg-white pr-10 text-sm text-slate-800 sm:h-12 sm:pr-12 sm:text-base"
            />
            <button
              type="button"
              onClick={() => setShowPassword((v) => !v)}
              className="absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-700 sm:right-4"
            >
              {showPassword ? <EyeOff className="h-3.5 w-3.5 sm:h-4 sm:w-4" /> : <Eye className="h-3.5 w-3.5 sm:h-4 sm:w-4" />}
            </button>
          </div>

          {activeTab === 'signup' && (
            <p className="-mt-2 text-xs text-slate-500">Mot de passe: 6 caracteres minimum.</p>
          )}

          {error && (
            <p className="rounded-xl bg-red-50 px-3 py-2 text-sm font-medium text-red-600">
              {error}
            </p>
          )}
          {success && (
            <p className="rounded-xl bg-emerald-50 px-3 py-2 text-sm font-medium text-emerald-700">
              {success}
            </p>
          )}

          <Button
            type="submit"
            disabled={loading}
            className="h-10 w-full rounded-xl bg-slate-900 text-sm font-semibold text-white hover:bg-slate-800 sm:h-12 sm:text-base"
          >
            {loading
              ? activeTab === 'signin'
                ? 'Connexion...'
                : 'Creation...'
              : activeTab === 'signin'
                ? 'Se connecter'
                : 'Creer mon compte'}
          </Button>
        </form>

        <p className="mt-5 text-center text-[11px] text-slate-400 sm:mt-6 sm:text-xs">
          En continuant, tu acceptes nos conditions d&apos;utilisation.
        </p>
      </div>
    </div>
  )
}
