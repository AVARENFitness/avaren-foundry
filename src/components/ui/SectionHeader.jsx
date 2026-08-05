export default function SectionHeader({ eyebrow, title, description, action }) {
  return (
    <header className="ui-section-header">
      <div>
        {eyebrow && <span className="eyebrow">{eyebrow}</span>}
        <h2>{title}</h2>
        {description && <p>{description}</p>}
      </div>
      {action}
    </header>
  )
}
