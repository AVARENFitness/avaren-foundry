const MODES = {
  VIEW: 'view',
  EDITING: 'editing',
  SAVING: 'saving',
  SAVED: 'saved',
  ERROR: 'error',
}

export { MODES as IDENTITY_EDITOR_MODE }

export default function CollapsibleIdentityPanel({
  eyebrow = '',
  title,
  hint = '',
  mode = 'view',
  canEdit = true,
  isEmpty = false,
  successMessage = '',
  errorMessage = '',
  editLabel = 'Edit',
  addLabel = 'Add',
  saveLabel = 'Save',
  clearLabel = 'Remove',
  onEdit,
  onCancel,
  onSave,
  onClear,
  viewContent = null,
  editingContent = null,
  showClear = false,
}) {
  const isEditing = mode === 'editing' || mode === 'saving'
  const showSuccess = mode === 'saved' && successMessage

  return (
    <section className={`identity-panel identity-panel--${mode}`}>
      <header className="identity-panel-header">
        <div>
          {eyebrow && <span className="eyebrow">{eyebrow}</span>}
          <h3>{title}</h3>
          {hint && !isEditing && <p>{hint}</p>}
        </div>
      </header>

      {showSuccess && (
        <p className="identity-panel-success" role="status">
          {successMessage}
        </p>
      )}

      {mode === 'error' && errorMessage && (
        <p className="identity-panel-error" role="alert">
          {errorMessage}
        </p>
      )}

      {!isEditing ? (
        <>
          <div className="identity-panel-summary">{viewContent}</div>
          {canEdit && (
            <button
              type="button"
              className="coach-secondary-button identity-panel-action"
              onClick={onEdit}
            >
              {isEmpty ? addLabel : editLabel}
            </button>
          )}
        </>
      ) : (
        <>
          <div className="identity-panel-form">{editingContent}</div>
          <div className="identity-panel-actions">
            <button
              type="button"
              className="gold-button machined"
              disabled={mode === 'saving'}
              onClick={onSave}
            >
              {mode === 'saving' ? 'Saving…' : saveLabel}
            </button>
            <button
              type="button"
              className="coach-secondary-button"
              disabled={mode === 'saving'}
              onClick={onCancel}
            >
              Cancel
            </button>
            {showClear && onClear && (
              <button
                type="button"
                className="coach-secondary-button identity-panel-clear"
                disabled={mode === 'saving'}
                onClick={onClear}
              >
                {clearLabel}
              </button>
            )}
          </div>
        </>
      )}
    </section>
  )
}
