'use client'

import { useMode } from '@/context/ModeContext'
import { Area, AreaChart, ResponsiveContainer } from 'recharts'

interface DiscoverScoreSparklineProps {
  values: number[]
  height?: number
}

export function DiscoverScoreSparkline({
  values,
  height = 40,
}: DiscoverScoreSparklineProps) {
  const { accentHex } = useMode()
  const data = values.map((v, i) => ({ i, v }))

  if (!data.length) {
    return (
      <div
        className="w-full rounded bg-muted/60"
        style={{ height }}
        aria-hidden
      />
    )
  }

  return (
    <div style={{ height }} className="w-full">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={{ top: 4, right: 2, left: 0, bottom: 0 }}>
          <Area
            type="monotone"
            dataKey="v"
            stroke={accentHex}
            fill={accentHex}
            fillOpacity={0.18}
            strokeWidth={1.5}
            isAnimationActive={false}
            dot={false}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  )
}
