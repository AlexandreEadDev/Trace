/**
 * Shared HTTP helpers for every external catalog provider.
 *
 * Goals:
 *  - Hard timeouts so a slow upstream can never hang a request.
 *  - Retries with exponential backoff + jitter on 429 / 5xx / network errors.
 *  - Respect `Retry-After` when the upstream sends it.
 *  - In-memory TTL cache + in-flight request coalescing so concurrent
 *    identical requests share a single network call (huge win for games,
 *    where the UI fires several requests at once).
 *
 * Everything is process-local (per Next.js server instance). That is enough
 * to make the catalog feel instant for repeat navigation without adding a
 * Redis dependency.
 */

export interface FetchJsonOptions {
  /** Per-attempt timeout in ms (default 8000). */
  timeoutMs?: number
  /** Max attempts including the first (default 3). */
  retries?: number
  /** Base backoff in ms; grows as base * 2^attempt (default 400). */
  backoffMs?: number
  /** Cache TTL in ms. 0 / undefined disables caching. */
  cacheTtlMs?: number
  /** Extra request headers. */
  headers?: Record<string, string>
  /** HTTP method (default GET). */
  method?: string
  /** Request body (for POST). */
  body?: string
  /** Abort signal from the caller (e.g. Next.js request). */
  signal?: AbortSignal
}

const RETRYABLE_STATUS = new Set([408, 425, 429, 500, 502, 503, 504])

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

/** Full jitter backoff: random between 0 and base * 2^attempt. */
function backoffDelay(base: number, attempt: number): number {
  const ceiling = base * 2 ** attempt
  return Math.round(Math.random() * ceiling)
}

function parseRetryAfter(res: Response): number | null {
  const raw = res.headers.get('retry-after')
  if (!raw) return null
  const seconds = Number(raw)
  if (Number.isFinite(seconds)) return Math.max(0, seconds * 1000)
  const date = Date.parse(raw)
  if (!Number.isNaN(date)) return Math.max(0, date - Date.now())
  return null
}

// ─── In-memory TTL cache ─────────────────────────────────────────────────────

interface CacheEntry<T> {
  value: T
  expiresAt: number
}

const memoryCache = new Map<string, CacheEntry<unknown>>()
/** Cap the cache so a long-running server can't grow unbounded. */
const MAX_CACHE_ENTRIES = 500

function cacheGet<T>(key: string): T | undefined {
  const hit = memoryCache.get(key)
  if (!hit) return undefined
  if (hit.expiresAt < Date.now()) {
    memoryCache.delete(key)
    return undefined
  }
  return hit.value as T
}

function cacheSet<T>(key: string, value: T, ttlMs: number): void {
  if (memoryCache.size >= MAX_CACHE_ENTRIES) {
    // Evict the oldest entry (Map preserves insertion order).
    const oldest = memoryCache.keys().next().value
    if (oldest !== undefined) memoryCache.delete(oldest)
  }
  memoryCache.set(key, { value, expiresAt: Date.now() + ttlMs })
}

/** Manually invalidate a cache key (used by admin refresh routes). */
export function invalidateCache(key: string): void {
  memoryCache.delete(key)
}

// ─── In-flight coalescing ────────────────────────────────────────────────────

const inflight = new Map<string, Promise<unknown>>()

/**
 * Fetch JSON with timeout, retries/backoff, optional TTL cache and
 * in-flight coalescing. Returns `null` on unrecoverable failure instead of
 * throwing, so callers can fall back cleanly.
 */
export async function fetchJson<T = unknown>(
  url: string,
  options: FetchJsonOptions = {},
): Promise<T | null> {
  const {
    timeoutMs = 8000,
    retries = 3,
    backoffMs = 400,
    cacheTtlMs = 0,
    headers,
    method = 'GET',
    body,
    signal,
  } = options

  const cacheKey = `${method} ${url}`
  if (cacheTtlMs > 0) {
    const cached = cacheGet<T>(cacheKey)
    if (cached !== undefined) return cached
    const pending = inflight.get(cacheKey)
    if (pending) return pending as Promise<T | null>
  }

  const run = async (): Promise<T | null> => {
    let lastError: unknown = null
    for (let attempt = 0; attempt < retries; attempt++) {
      const controller = new AbortController()
      const timer = setTimeout(() => controller.abort(), timeoutMs)
      // Bridge the caller's signal into our per-attempt controller.
      const onAbort = () => controller.abort()
      signal?.addEventListener('abort', onAbort, { once: true })

      try {
        const res = await fetch(url, {
          method,
          headers,
          body,
          signal: controller.signal,
          cache: 'no-store',
        })

        if (res.ok) {
          const json = (await res.json()) as T
          if (cacheTtlMs > 0) cacheSet(cacheKey, json, cacheTtlMs)
          return json
        }

        // Non-retryable client error → give up immediately.
        if (!RETRYABLE_STATUS.has(res.status)) return null

        lastError = new Error(`HTTP ${res.status}`)
        if (attempt < retries - 1) {
          const retryAfter = parseRetryAfter(res)
          await sleep(retryAfter ?? backoffDelay(backoffMs, attempt))
        }
      } catch (err) {
        // Caller aborted → stop, don't retry.
        if (signal?.aborted) return null
        lastError = err
        if (attempt < retries - 1) {
          await sleep(backoffDelay(backoffMs, attempt))
        }
      } finally {
        clearTimeout(timer)
        signal?.removeEventListener('abort', onAbort)
      }
    }
    void lastError
    return null
  }

  if (cacheTtlMs > 0) {
    const promise = run().finally(() => inflight.delete(cacheKey))
    inflight.set(cacheKey, promise)
    return promise
  }
  return run()
}

/**
 * Fetch a raw Response (for endpoints that stream non-JSON, e.g. HLTB).
 * Same timeout/retry semantics as fetchJson but without caching.
 */
export async function fetchResponse(
  url: string,
  options: FetchJsonOptions = {},
): Promise<Response | null> {
  const { timeoutMs = 8000, retries = 2, backoffMs = 400, headers, method = 'GET', body, signal } = options
  for (let attempt = 0; attempt < retries; attempt++) {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), timeoutMs)
    const onAbort = () => controller.abort()
    signal?.addEventListener('abort', onAbort, { once: true })
    try {
      const res = await fetch(url, { method, headers, body, signal: controller.signal, cache: 'no-store' })
      if (res.ok) return res
      if (!RETRYABLE_STATUS.has(res.status)) return res
      if (attempt < retries - 1) {
        const retryAfter = parseRetryAfter(res)
        await sleep(retryAfter ?? backoffDelay(backoffMs, attempt))
      }
    } catch (err) {
      if (signal?.aborted) return null
      if (attempt < retries - 1) await sleep(backoffDelay(backoffMs, attempt))
      void err
    } finally {
      clearTimeout(timer)
      signal?.removeEventListener('abort', onAbort)
    }
  }
  return null
}

/**
 * Simple concurrency-limited map. Prevents hammering rate-limited APIs
 * (Jikan: 3 req/s) while still running requests in parallel.
 */
export async function mapWithConcurrency<T, R>(
  items: T[],
  limit: number,
  fn: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  const results: R[] = new Array(items.length)
  let cursor = 0
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (cursor < items.length) {
      const index = cursor++
      results[index] = await fn(items[index], index)
    }
  })
  await Promise.all(workers)
  return results
}

/** Normalize accents/case for query strings. */
export function normalizeQuery(q: string): string {
  return q.normalize('NFD').replace(/[\u0300-\u036f]/g, '')
}
