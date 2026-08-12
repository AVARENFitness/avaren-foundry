import { useEffect, useId, useRef } from 'react'
import { resolvePassCandidateId } from '../../lib/coachPass'
import AppUiBackdrop from '../ui/AppUiBackdrop'
import AppUiCloseButton from '../ui/AppUiCloseButton'

export default function CoachPassSelectionModal({
  open = false,
  title = 'Choose a training pass',
  description = 'This client has more than one eligible pass. Select which pass should receive this debit.',
  candidates = [],
  submitting = false,
  onClose,
  onSelect,
}) {
  const titleId = useId()
  const panelRef = useRef(null)

  useEffect(() => {
    if (!open) return undefined
    panelRef.current?.focus()
  }, [open])

  return (
    <AppUiBackdrop
      open={open}
      onClose={onClose}
      className="coach-pass-selection-backdrop"
    >
      <section
        ref={panelRef}
        className="coach-pass-selection-sheet"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        onClick={(event) => event.stopPropagation()}
      >
        <header className="coach-pass-selection-sheet-header">
          <div>
            <span className="eyebrow">TRAINING PASS</span>
            <h2 id={titleId}>{title}</h2>
            <p>{description}</p>
          </div>
          <AppUiCloseButton onClick={onClose} />
        </header>

        <div className="coach-pass-selection-sheet-body">
          <ul className="coach-pass-selection-list">
            {candidates.map((candidate) => {
              const passId = resolvePassCandidateId(candidate)
              return (
              <li key={passId ?? candidate.name}>
                <button
                  type="button"
                  className="coach-pass-selection-option"
                  disabled={submitting || !passId}
                  onClick={() => onSelect?.(passId)}
                >
                  <strong>{candidate.name ?? 'Training pass'}</strong>
                  <span>
                    {candidate.balance ?? 0} remaining
                    {candidate.expires_at || candidate.expiresAt
                      ? ` · expires ${candidate.expires_at ?? candidate.expiresAt}`
                      : ''}
                  </span>
                </button>
              </li>
              )
            })}
          </ul>
        </div>
      </section>
    </AppUiBackdrop>
  )
}
