import { type NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest) {
  try {
    const { itemId } = await req.json()
    if (!itemId || typeof itemId !== 'string') {
      return NextResponse.json({ error: 'missing itemId' }, { status: 400 })
    }

    const supabase = await createClient()
    await supabase.from('item_clicks').insert({ item_id: itemId })

    return NextResponse.json({ ok: true })
  } catch {
    return NextResponse.json({ ok: false })
  }
}
