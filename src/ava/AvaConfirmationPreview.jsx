import { PencilLine } from 'lucide-react'

export default function AvaConfirmationPreview({
  title,
  items = [],
  estimates = [],
  confidenceLabel,
  onConfirm,
  onEdit,
  onCancel,
}) {
  return (
    <section
      className="ava-confirmation-preview"
      aria-label={title || 'AVA confirmation preview'}
    >
      <header className="ava-confirmation-preview-header">
        <div>
          <span className="eyebrow">PREVIEW</span>
          {title && <h3>{title}</h3>}
        </div>
        {confidenceLabel && (
          <span className="ava-confirmation-confidence">{confidenceLabel}</span>
        )}
      </header>

      {items.length > 0 && (
        <div className="ava-confirmation-block">
          <span className="ava-confirmation-label">Interpreted</span>
          <ul className="ava-confirmation-list">
            {items.map((item) => (
              <li key={`${item.label}-${item.value}`}>
                <span>{item.label}</span>
                <strong>{item.value}</strong>
              </li>
            ))}
          </ul>
        </div>
      )}

      {estimates.length > 0 && (
        <div className="ava-confirmation-block">
          <span className="ava-confirmation-label">Estimated</span>
          <ul className="ava-confirmation-list">
            {estimates.map((item) => (
              <li key={`${item.label}-${item.value}`}>
                <span>{item.label}</span>
                <strong>{item.value}</strong>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="ava-confirmation-actions">
        <button
          type="button"
          className="confirmation-dialog-cancel"
          onClick={onCancel}
        >
          Cancel
        </button>
        <button
          type="button"
          className="ava-confirmation-edit"
          onClick={onEdit}
        >
          <PencilLine size={16} />
          Edit
        </button>
        <button
          type="button"
          className="gold-button machined ava-confirmation-confirm"
          onClick={onConfirm}
        >
          Confirm
        </button>
      </div>
    </section>
  )
}
