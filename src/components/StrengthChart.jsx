import { useMemo } from 'react'

const metricValue = (session, metric) => {
  if (metric === 'heaviest') return session.heaviest
  if (metric === 'volume') return session.volume
  return session.bestE1RM
}

export default function StrengthChart({ sessions, metric }) {
  const points = useMemo(() => {
    const visible = sessions.slice(-12)
    if (!visible.length) return []

    const values = visible.map((session) => metricValue(session, metric))
    const minimum = Math.min(...values)
    const maximum = Math.max(...values)
    const spread = Math.max(1, maximum - minimum)

    return visible.map((session, index) => ({
      ...session,
      value: values[index],
      x: visible.length === 1 ? 50 : 8 + (index / (visible.length - 1)) * 84,
      y: 82 - ((values[index] - minimum) / spread) * 62,
    }))
  }, [sessions, metric])

  if (!points.length) {
    return <div className="chart-empty">Complete a workout to create this graph.</div>
  }

  const line = points.map((point) => `${point.x},${point.y}`).join(' ')

  return (
    <div className="strength-chart-wrap">
      <svg className="strength-chart" viewBox="0 0 100 100" preserveAspectRatio="none">
        <defs>
          <linearGradient id="chartArea" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#c7a65c" stopOpacity=".24" />
            <stop offset="100%" stopColor="#c7a65c" stopOpacity="0" />
          </linearGradient>
        </defs>

        {[20, 40, 60, 80].map((y) => (
          <line key={y} x1="6" y1={y} x2="94" y2={y} className="chart-gridline" />
        ))}

        <polygon
          points={`${line} ${points.at(-1).x},88 ${points[0].x},88`}
          fill="url(#chartArea)"
        />
        <polyline points={line} className="chart-line" />

        {points.map((point) => (
          <circle
            key={point.id}
            cx={point.x}
            cy={point.y}
            r="1.9"
            className="chart-point"
          />
        ))}
      </svg>

      <div className="chart-labels">
        {points.map((point) => (
          <div key={point.id} style={{ left: `${point.x}%` }}>
            <strong>{Math.round(point.value).toLocaleString()}</strong>
            <span>{point.date.slice(5)}</span>
          </div>
        ))}
      </div>
    </div>
  )
}
