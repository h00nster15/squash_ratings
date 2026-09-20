export interface Point {
  date: string
  rating: number
}

/** Rating after each tournament as a tiny inline line chart. */
export function Sparkline({ points, width = 80, height = 20 }: { points: Point[]; width?: number; height?: number }) {
  if (points.length < 2) return <span className="muted">—</span>
  const ys = points.map((p) => p.rating)
  const min = Math.min(...ys)
  const max = Math.max(...ys)
  const span = Math.max(max - min, 40)
  const pad = 2
  const d = points
    .map((p, i) => {
      const x = pad + (i / (points.length - 1)) * (width - pad * 2)
      const y = pad + (height - pad * 2) - ((p.rating - min) / span) * (height - pad * 2)
      return `${i === 0 ? 'M' : 'L'}${x.toFixed(1)},${y.toFixed(1)}`
    })
    .join(' ')
  const up = ys[ys.length - 1] >= ys[0]
  return (
    <svg
      className={`spark ${up ? 'up' : 'down'}`}
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      aria-label={`${ys[0]} → ${ys[ys.length - 1]}`}
    >
      <path d={d} fill="none" strokeWidth="1.5" />
    </svg>
  )
}
