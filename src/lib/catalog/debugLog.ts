/**
 * Logs de diagnostic catalogue (livres / mangas).
 * Active avec dans `.env.local` :
 *   NEXT_PUBLIC_TRACE_CATALOG_DEBUG=1
 * Puis redémarre `npm run dev`. Les messages apparaissent dans le terminal (API)
 * et dans la console du navigateur (page catalogue).
 */
export function isCatalogDebug(): boolean {
  return process.env.NEXT_PUBLIC_TRACE_CATALOG_DEBUG === '1'
}

export function catalogDebug(tag: string, payload?: Record<string, unknown>): void {
  if (!isCatalogDebug()) return
  if (payload !== undefined) {
    console.log(`[Trace:catalog:${tag}]`, payload)
  } else {
    console.log(`[Trace:catalog:${tag}]`)
  }
}
