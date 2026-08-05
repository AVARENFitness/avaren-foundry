export default function EmptyState({ icon: Icon, title, description, action }) {
  return (
    <section className="ui-empty-state">
      {Icon && <span><Icon size={28} /></span>}
      <h3>{title}</h3>
      <p>{description}</p>
      {action}
    </section>
  )
}
