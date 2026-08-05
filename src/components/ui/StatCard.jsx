export default function StatCard({ icon: Icon, label, value, detail, tone = 'default' }) {
  return (
    <article className={`ui-stat-card tone-${tone}`}>
      {Icon && <span className="ui-stat-icon"><Icon size={18} /></span>}
      <div><strong>{value}</strong><span>{label}</span>{detail && <small>{detail}</small>}</div>
    </article>
  )
}
