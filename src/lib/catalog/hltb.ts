export interface HltbData {
  mainStory: number | null   // hours
  mainExtra: number | null   // hours
  completionist: number | null // hours
  searchUrl: string
}

async function fetchHltbInit(ms = 8000): Promise<{ token: string; hpKey: string; hpVal: string } | null> {
  const controller = new AbortController()
  const id = setTimeout(() => controller.abort(), ms)
  try {
    const res = await fetch(`https://howlongtobeat.com/api/find/init?t=${Date.now()}`, {
      signal: controller.signal,
      cache: 'no-store',
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Referer': 'https://howlongtobeat.com/',
      },
    })
    if (!res.ok) return null
    return await res.json() as { token: string; hpKey: string; hpVal: string }
  } catch {
    return null
  } finally {
    clearTimeout(id)
  }
}

export async function getHltbData(title: string): Promise<HltbData> {
  const searchUrl = `https://howlongtobeat.com/?q=${encodeURIComponent(title)}`

  try {
    const init = await fetchHltbInit()
    if (!init?.token) return { mainStory: null, mainExtra: null, completionist: null, searchUrl }

    const { token, hpKey, hpVal } = init

    const body: Record<string, unknown> = {
      searchTerms: title.split(' '),
      searchPage: 1,
      size: 5,
      searchOptions: {
        games: {
          userId: 0,
          platform: '',
          sortCategory: 'popular',
          rangeCategory: 'main',
          rangeTime: { min: 0, max: 0 },
          gameplay: { perspective: '', flow: '', genre: '', difficulty: '' },
          rangeYear: { min: 0, max: 0 },
          modifier: '',
        },
        users: { sortCategory: 'postcount' },
        lists: { sortCategory: 'follows' },
        filter: '',
        sort: 0,
        randomizer: 0,
      },
      useCache: true,
    }
    if (hpKey) body[hpKey] = hpVal

    const controller = new AbortController()
    const id = setTimeout(() => controller.abort(), 8000)

    let res: Response
    try {
      res = await fetch('https://howlongtobeat.com/api/find', {
        method: 'POST',
        signal: controller.signal,
        cache: 'no-store',
        headers: {
          'Content-Type': 'application/json',
          'Referer': 'https://howlongtobeat.com/',
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
          'x-auth-token': token,
          'x-hp-key': hpKey,
          'x-hp-val': hpVal,
        },
        body: JSON.stringify(body),
      })
    } finally {
      clearTimeout(id)
    }

    if (!res.ok) return { mainStory: null, mainExtra: null, completionist: null, searchUrl }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const data: any = await res.json()
    const results: unknown[] = data?.data ?? []
    if (results.length === 0) return { mainStory: null, mainExtra: null, completionist: null, searchUrl }

    // Pick best match: prefer exact title match, else first result
    const titleLow = title.toLowerCase()
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const match: any = results.find((r: any) =>
      typeof r.game_name === 'string' && r.game_name.toLowerCase() === titleLow
    ) ?? results[0]

    const secsToH = (s: number | null | undefined): number | null =>
      typeof s === 'number' && s > 0 ? Math.round(s / 3600) : null

    return {
      mainStory: secsToH(match.comp_main),
      mainExtra: secsToH(match.comp_plus),
      completionist: secsToH(match.comp_100),
      searchUrl,
    }
  } catch {
    return { mainStory: null, mainExtra: null, completionist: null, searchUrl }
  }
}
