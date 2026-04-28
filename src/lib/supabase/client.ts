import { createBrowserClient } from '@supabase/ssr'

export function createClient() {
  // Literal access required so Next.js can statically replace NEXT_PUBLIC_ vars
  // in the browser bundle. Dynamic bracket access (process.env[name]) does NOT work.
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim()
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim()

  if (!url) {
    throw new Error(
      'NEXT_PUBLIC_SUPABASE_URL is not set. Add it to .env.local and restart the dev server.'
    )
  }
  if (!anonKey) {
    throw new Error(
      'NEXT_PUBLIC_SUPABASE_ANON_KEY is not set. Add it to .env.local and restart the dev server.'
    )
  }

  return createBrowserClient(url, anonKey)
}
