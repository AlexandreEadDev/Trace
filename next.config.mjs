/** @type {import('next').NextConfig} */
const nextConfig = {
  // Avoid corrupted/missing vendor chunks for Supabase in dev (Next.js 15 + webpack).
  serverExternalPackages: ['@supabase/supabase-js', '@supabase/ssr'],
};

export default nextConfig;
