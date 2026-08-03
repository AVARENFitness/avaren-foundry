export default function MetricCard({ label, value, suffix }) {
  return (
    <article className="metric-card">
      <span>{label}</span>
      <strong>
        {value}
        {suffix && <small>{suffix}</small>}
      </strong>
    </article>
  )
}
