'use client'

export interface PlayerStats {
  statRitmo: number | null
  statDisparo: number | null
  statPase: number | null
  statRegate: number | null
  statDefensa: number | null
  statFisico: number | null
}

const STATS = [
  { key: 'statRitmo', label: 'RIT' },
  { key: 'statDisparo', label: 'TIR' },
  { key: 'statPase', label: 'PAS' },
  { key: 'statRegate', label: 'REG' },
  { key: 'statDefensa', label: 'DEF' },
  { key: 'statFisico', label: 'FIS' },
] as const

interface Props {
  stats: PlayerStats
  size?: number
}

function hexPoints(cx: number, cy: number, r: number): [number, number][] {
  return Array.from({ length: 6 }, (_, i) => {
    const angle = (Math.PI / 3) * i - Math.PI / 2
    return [cx + r * Math.cos(angle), cy + r * Math.sin(angle)] as [number, number]
  })
}

function toPolygon(points: [number, number][]) {
  return points.map(([x, y]) => `${x},${y}`).join(' ')
}

export function HexagonStats({ stats, size = 160 }: Props) {
  const cx = size / 2
  const cy = size / 2
  const maxR = size * 0.38
  const labelR = size * 0.49

  const values = STATS.map(({ key }) => {
    const v = stats[key]
    return v != null ? Math.max(0, Math.min(99, v)) : 0
  })

  const hasStats = values.some((v) => v > 0)

  // Grid rings at 25%, 50%, 75%, 100%
  const rings = [0.25, 0.5, 0.75, 1]

  // Stat polygon points
  const statPoints = values.map((v, i) => {
    const angle = (Math.PI / 3) * i - Math.PI / 2
    const r = (v / 99) * maxR
    return [cx + r * Math.cos(angle), cy + r * Math.sin(angle)] as [number, number]
  })

  // Label positions
  const labelPositions = STATS.map((_, i) => {
    const angle = (Math.PI / 3) * i - Math.PI / 2
    return [cx + labelR * Math.cos(angle), cy + labelR * Math.sin(angle)] as [number, number]
  })

  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
      {/* Background rings */}
      {rings.map((pct, ri) => {
        const pts = hexPoints(cx, cy, maxR * pct)
        return (
          <polygon
            key={ri}
            points={toPolygon(pts)}
            fill={ri === rings.length - 1 ? 'rgba(200,169,110,0.06)' : 'none'}
            stroke="rgba(200,169,110,0.25)"
            strokeWidth="0.8"
          />
        )
      })}

      {/* Axis lines */}
      {hexPoints(cx, cy, maxR).map(([x, y], i) => (
        <line
          key={i}
          x1={cx}
          y1={cy}
          x2={x}
          y2={y}
          stroke="rgba(200,169,110,0.3)"
          strokeWidth="0.8"
        />
      ))}

      {/* Stat fill polygon */}
      {hasStats && (
        <polygon
          points={toPolygon(statPoints)}
          fill="rgba(200,169,110,0.35)"
          stroke="#C8A96E"
          strokeWidth="1.5"
          strokeLinejoin="round"
        />
      )}

      {/* Dot on each vertex */}
      {hasStats &&
        statPoints.map(([x, y], i) => (
          <circle key={i} cx={x} cy={y} r="2.5" fill="#C8A96E" />
        ))}

      {/* Labels */}
      {STATS.map(({ label }, i) => {
        const [lx, ly] = labelPositions[i]
        const v = values[i]
        return (
          <g key={i}>
            <text
              x={lx}
              y={ly - 3}
              textAnchor="middle"
              dominantBaseline="auto"
              fontSize={size * 0.068}
              fontWeight="700"
              fill="#C8A96E"
              fontFamily="sans-serif"
            >
              {label}
            </text>
            <text
              x={lx}
              y={ly + size * 0.072}
              textAnchor="middle"
              dominantBaseline="auto"
              fontSize={size * 0.072}
              fontWeight="600"
              fill="#FAF7F0"
              fontFamily="sans-serif"
            >
              {v > 0 ? v : '—'}
            </text>
          </g>
        )
      })}
    </svg>
  )
}
