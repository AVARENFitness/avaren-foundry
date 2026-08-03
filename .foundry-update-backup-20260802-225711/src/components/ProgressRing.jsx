export default function ProgressRing({ value }) {
  const safeValue = Math.min(100, Math.max(0, value))
  const radius = 27
  const circumference = 2 * Math.PI * radius
  const offset = circumference - (safeValue / 100) * circumference

  return (
    <div className={`progress-ring ${safeValue === 100 ? 'complete' : ''}`} aria-label={`${safeValue}% workout complete`}>
      <svg viewBox="0 0 64 64">
        <circle className="ring-track" cx="32" cy="32" r={radius} />
        <circle
          className="ring-value"
          cx="32"
          cy="32"
          r={radius}
          strokeDasharray={circumference}
          strokeDashoffset={offset}
        />
      </svg>
      <strong>{safeValue}%</strong>
    </div>
  )
}
