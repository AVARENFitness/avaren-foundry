import { useEffect, useId, useRef, useState } from 'react'
import AppUiBackdrop from '../ui/AppUiBackdrop'
import AppUiCloseButton from '../ui/AppUiCloseButton'

export default function CoachCreateClientSheet({
  open = false,
  submitting = false,
  onClose,
  onSubmit,
}) {
  const titleId = useId()
  const panelRef = useRef(null)
  const [firstName, setFirstName] = useState('')
  const [lastName, setLastName] = useState('')
  const [preferredName, setPreferredName] = useState('')
  const [email, setEmail] = useState('')
  const [phone, setPhone] = useState('')
  const [error, setError] = useState('')

  useEffect(() => {
    if (!open) return undefined

    setFirstName('')
    setLastName('')
    setPreferredName('')
    setEmail('')
    setPhone('')
    setError('')
    panelRef.current?.focus()

    const onKeyDown = (event) => {
      if (event.key === 'Escape' && !submitting) {
        event.preventDefault()
        onClose?.()
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [open, onClose, submitting])

  const handleSubmit = () => {
    const trimmedFirst = firstName.trim()
    if (!trimmedFirst) {
      setError('First name is required.')
      return
    }

    setError('')
    onSubmit?.({
      firstName: trimmedFirst,
      lastName: lastName.trim(),
      preferredName: preferredName.trim(),
      email: email.trim() || null,
      phone: phone.trim() || null,
    })
  }

  return (
    <AppUiBackdrop
      open={open}
      onClose={submitting ? undefined : onClose}
      className="coach-create-client-backdrop"
    >
      <section
        ref={panelRef}
        className="coach-create-client-sheet coach-lifecycle-sheet"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        data-testid="coach-create-client-sheet"
        tabIndex={-1}
        onClick={(event) => event.stopPropagation()}
      >
        <header className="coach-lifecycle-sheet-header">
          <div>
            <span className="eyebrow">ADD CLIENT</span>
            <h2 id={titleId}>Add client</h2>
          </div>
          <AppUiCloseButton onClick={onClose} disabled={submitting} />
        </header>

        <div className="coach-lifecycle-sheet-body">
          <label className="coach-field coach-field--wide">
            <span>First name *</span>
            <input
              className="coach-field-input"
              value={firstName}
              onChange={(event) => setFirstName(event.target.value)}
              autoComplete="given-name"
              aria-label="First name"
              disabled={submitting}
            />
          </label>
          <label className="coach-field coach-field--wide">
            <span>Last name</span>
            <input
              className="coach-field-input"
              value={lastName}
              onChange={(event) => setLastName(event.target.value)}
              autoComplete="family-name"
              aria-label="Last name"
              disabled={submitting}
            />
          </label>
          <label className="coach-field coach-field--wide">
            <span>Preferred name</span>
            <input
              className="coach-field-input"
              value={preferredName}
              onChange={(event) => setPreferredName(event.target.value)}
              disabled={submitting}
            />
          </label>
          <label className="coach-field coach-field--wide">
            <span>Email</span>
            <input
              className="coach-field-input"
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              autoComplete="email"
              disabled={submitting}
            />
          </label>
          <label className="coach-field coach-field--wide">
            <span>Phone</span>
            <input
              className="coach-field-input"
              type="tel"
              value={phone}
              onChange={(event) => setPhone(event.target.value)}
              autoComplete="tel"
              disabled={submitting}
            />
          </label>

          <section className="coach-create-client-app-access">
            <span className="eyebrow">APP ACCESS</span>
            <p>No AVAREN account required</p>
          </section>

          {error ? <p className="coach-create-client-error">{error}</p> : null}
        </div>

        <footer className="coach-lifecycle-sheet-footer">
          <button
            type="button"
            className="coach-secondary-button"
            onClick={onClose}
            disabled={submitting}
          >
            Cancel
          </button>
          <button
            type="button"
            className="gold-button machined coach-primary-action"
            onClick={handleSubmit}
            disabled={submitting}
          >
            {submitting ? 'Creating…' : 'Create client'}
          </button>
        </footer>
      </section>
    </AppUiBackdrop>
  )
}
