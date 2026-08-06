export default function StatCard({ icon: Icon, label, value, detail, tone = 'default' }) {
  return (
    <article className={`ui-stat-card tone-${tone}`}>
      {Icon && (
        <span className="ui-stat-icon" aria-hidden="true">
          <Icon size={18} strokeWidth={1.75} />
        </span>
      )}
      <div className="ui-stat-copy">
        <strong>{value}</strong>
        <span>{label}</span>
        {detail && <small>{detail}</small>}
      </div>
    </article>
  )
}
