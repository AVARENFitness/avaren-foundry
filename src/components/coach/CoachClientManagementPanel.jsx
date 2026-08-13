import { useEffect, useState } from 'react'
import AppUiBackdrop from '../ui/AppUiBackdrop'
import AppUiCloseButton from '../ui/AppUiCloseButton'
import { END_COACHING_COPY } from '../../lib/coachClientLifecycle'
import { hasLinkedAthlete } from '../../lib/coachBusinessClient'
import {
  canConfigureWeeklyCheckInRequirement,
  COACHING_REQUIREMENT_KEYS,
  readCoachingRequirementsFromClient,
  WEEKLY_CHECK_IN_REQUIREMENT,
} from '../../lib/coachClientRequirements'

export default function CoachEndCoachingSheet({
  open = false,
  clientName = 'this client',
  linked = false,
  submitting = false,
  onClose,
  onConfirm,
}) {
  const [unlinkAccount, setUnlinkAccount] = useState(false)

  const handleClose = () => {
    if (submitting) return
    setUnlinkAccount(false)
    onClose?.()
  }

  const handleConfirm = () => {
    onConfirm?.({ unlinkAccount: linked ? unlinkAccount : false })
  }

  return (
    <AppUiBackdrop
      open={open}
      onClose={submitting ? undefined : handleClose}
      className="coach-lifecycle-backdrop"
    >
      <section
        className="coach-lifecycle-sheet"
        role="dialog"
        aria-modal="true"
        aria-labelledby="coach-end-coaching-title"
        data-testid="coach-end-coaching-sheet"
        onClick={(event) => event.stopPropagation()}
      >
        <header className="coach-lifecycle-sheet-header">
          <div>
            <span className="eyebrow">CLIENT MANAGEMENT</span>
            <h2 id="coach-end-coaching-title">{END_COACHING_COPY.title}</h2>
            <p>
              End coaching with {clientName}?
            </p>
            <p>{END_COACHING_COPY.message}</p>
          </div>
          <AppUiCloseButton onClick={handleClose} disabled={submitting} />
        </header>

        {linked ? (
          <div className="coach-lifecycle-sheet-body">
            <label className="coach-lifecycle-checkbox">
              <input
                type="checkbox"
                checked={unlinkAccount}
                onChange={(event) => setUnlinkAccount(event.target.checked)}
                disabled={submitting}
              />
              <span>Also unlink AVAREN account</span>
            </label>
          </div>
        ) : null}

        <footer className="coach-lifecycle-sheet-footer">
          <button
            type="button"
            className="coach-secondary-button"
            onClick={handleClose}
            disabled={submitting}
          >
            Cancel
          </button>
          <button
            type="button"
            className="gold-button machined coach-primary-action"
            onClick={handleConfirm}
            disabled={submitting}
          >
            {submitting ? 'Ending…' : END_COACHING_COPY.confirmLabel}
          </button>
        </footer>
      </section>
    </AppUiBackdrop>
  )
}

export function CoachCoachingRequirementsPanel({
  client,
  submitting = false,
  onUpdateWeeklyCheckInRequired,
}) {
  const requirements = readCoachingRequirementsFromClient(client)
  const canConfigure = canConfigureWeeklyCheckInRequirement(client)
  const savedValue =
    requirements[COACHING_REQUIREMENT_KEYS.WEEKLY_CHECK_IN] ===
    WEEKLY_CHECK_IN_REQUIREMENT.NOT_REQUIRED
      ? WEEKLY_CHECK_IN_REQUIREMENT.NOT_REQUIRED
      : WEEKLY_CHECK_IN_REQUIREMENT.REQUIRED
  const [saveError, setSaveError] = useState(null)
  const [savedNotice, setSavedNotice] = useState(false)
  const isSaving = submitting

  useEffect(() => {
    setSavedNotice(false)
    setSaveError(null)
  }, [savedValue])

  const handleChange = async (event) => {
    const nextValue = event.target.value
    if (nextValue === savedValue) return
    if (!onUpdateWeeklyCheckInRequired) return

    setSaveError(null)
    setSavedNotice(false)

    try {
      await onUpdateWeeklyCheckInRequired(
        nextValue === WEEKLY_CHECK_IN_REQUIREMENT.REQUIRED,
      )
      setSavedNotice(true)
    } catch {
      setSaveError('Unable to update weekly check-in requirement.')
    }
  }

  return (
    <section
      className="coach-coaching-requirements-panel"
      data-testid="coach-coaching-requirements-panel"
    >
      <header>
        <span className="eyebrow">COACHING REQUIREMENTS</span>
        <h2>Recurring obligations</h2>
      </header>

      <div className="coach-requirement-item">
        <div className="coach-requirement-copy">
          <strong className="coach-requirement-label">Weekly check-in</strong>
          <p className="coach-requirement-description">
            {canConfigure
              ? 'Choose whether this client is required to complete a weekly check-in.'
              : 'Connect an AVAREN account to enable weekly check-ins.'}
          </p>
          {isSaving ? (
            <p className="coach-requirement-status" role="status">
              Saving…
            </p>
          ) : savedNotice ? (
            <p className="coach-requirement-status" role="status">
              Saved
            </p>
          ) : null}
          {saveError ? (
            <p className="coach-requirement-error" role="alert">
              {saveError}
            </p>
          ) : null}
        </div>
        <select
          className="coach-requirement-select"
          value={savedValue}
          disabled={!canConfigure || isSaving || !onUpdateWeeklyCheckInRequired}
          onChange={handleChange}
          data-testid="coach-weekly-checkin-requirement-select"
        >
          <option value={WEEKLY_CHECK_IN_REQUIREMENT.REQUIRED}>Required</option>
          <option value={WEEKLY_CHECK_IN_REQUIREMENT.NOT_REQUIRED}>
            Not required
          </option>
        </select>
      </div>
    </section>
  )
}

export function CoachClientManagementPanel({
  client,
  submitting = false,
  onEndCoaching,
  onReopenCoaching,
  onUnlinkAccount,
}) {
  const linked = hasLinkedAthlete(client)
  const archived =
    String(client?.status ?? client?.business_client_status ?? 'active') ===
    'archived'

  return (
    <section
      className="coach-client-management-panel"
      data-testid="coach-client-management-panel"
    >
      <header>
        <span className="eyebrow">CLIENT MANAGEMENT</span>
        <h2>Relationship</h2>
      </header>

      <div className="coach-client-management-actions">
        {!archived ? (
          <button
            type="button"
            className="coach-secondary-button"
            data-testid="coach-end-coaching-button"
            disabled={submitting}
            onClick={onEndCoaching}
          >
            End coaching
          </button>
        ) : (
          <button
            type="button"
            className="coach-secondary-button"
            data-testid="coach-reopen-coaching-button"
            disabled={submitting}
            onClick={onReopenCoaching}
          >
            Reopen coaching
          </button>
        )}

        {linked ? (
          <button
            type="button"
            className="coach-secondary-button"
            data-testid="coach-unlink-account-button"
            disabled={submitting}
            onClick={onUnlinkAccount}
          >
            Unlink AVAREN account
          </button>
        ) : null}
      </div>
    </section>
  )
}
