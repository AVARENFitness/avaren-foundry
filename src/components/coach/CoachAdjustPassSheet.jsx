import { useEffect, useId, useMemo, useRef, useState } from 'react'
import AppUiBackdrop from '../ui/AppUiBackdrop'
import AppUiCloseButton from '../ui/AppUiCloseButton'
import { formatPackageDate } from '../../lib/sessionPackages'
import {
  PASS_CREDIT_REASON,
  PASS_DEBIT_REASON,
  PASS_CREDIT_REASON_OPTIONS,
  PASS_DEBIT_REASON_OPTIONS,
  listEligibleCreditPasses,
  listEligibleDebitPasses,
} from '../../lib/coachPassAdjustment'

const MODES = {
  MENU: 'menu',
  REMOVE: 'remove',
  ADD: 'add',
}

export default function CoachAdjustPassSheet({
  open = false,
  submitting = false,
  passes = [],
  totalBalance = 0,
  onClose,
  onRemoveSession,
  onAddSession,
}) {
  const titleId = useId()
  const panelRef = useRef(null)
  const [mode, setMode] = useState(MODES.MENU)
  const [selectedPassId, setSelectedPassId] = useState('')
  const [quantity, setQuantity] = useState('1')
  const [reasonCode, setReasonCode] = useState('')
  const [note, setNote] = useState('')
  const [error, setError] = useState('')

  const debitPasses = useMemo(() => listEligibleDebitPasses(passes), [passes])
  const creditPasses = useMemo(() => listEligibleCreditPasses(passes), [passes])
  const activePasses =
    mode === MODES.REMOVE ? debitPasses : mode === MODES.ADD ? creditPasses : passes

  const selectedPass =
    activePasses.find((pass) => pass.id === selectedPassId) ??
    activePasses[0] ??
    null

  const parsedQuantity = Math.max(0, Number.parseInt(quantity, 10) || 0)
  const removeDisabled =
    debitPasses.length === 0 ||
    !selectedPass ||
    parsedQuantity <= 0 ||
    parsedQuantity > Number(selectedPass?.balance ?? 0)
  const removeBlockedByBalance = debitPasses.length === 0

  useEffect(() => {
    if (!open) return undefined

    setMode(MODES.MENU)
    setQuantity('1')
    setReasonCode('')
    setNote('')
    setError('')
    setSelectedPassId('')
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

  useEffect(() => {
    if (!open || mode === MODES.MENU) return
    const pool = mode === MODES.REMOVE ? debitPasses : creditPasses
    if (!pool.length) return
    if (!pool.some((pass) => pass.id === selectedPassId)) {
      setSelectedPassId(pool[0]?.id ?? '')
    }
  }, [open, mode, debitPasses, creditPasses, selectedPassId])

  const handleRemove = () => {
    if (!selectedPass) {
      setError('Select a pass to charge.')
      return
    }
    if (!reasonCode) {
      setError('Enter a reason.')
      return
    }
    if (reasonCode === PASS_DEBIT_REASON.OTHER && !note.trim()) {
      setError('Enter a reason.')
      return
    }
    if (parsedQuantity <= 0) {
      setError('Enter a valid quantity.')
      return
    }
    if (parsedQuantity > Number(selectedPass.balance ?? 0)) {
      setError('This pass has no sessions remaining.')
      return
    }

    setError('')
    onRemoveSession?.({
      passId: selectedPass.id,
      quantity: parsedQuantity,
      reasonCode,
      note: note.trim(),
      balanceBefore: Number(selectedPass.balance ?? 0),
    })
  }

  const handleAdd = () => {
    if (!selectedPass) {
      setError('Select a pass to charge.')
      return
    }
    if (!reasonCode) {
      setError('Enter a reason.')
      return
    }
    if (reasonCode === PASS_CREDIT_REASON.OTHER && !note.trim()) {
      setError('Enter a reason.')
      return
    }
    if (parsedQuantity <= 0) {
      setError('Enter a valid quantity.')
      return
    }

    setError('')
    onAddSession?.({
      passId: selectedPass.id,
      quantity: parsedQuantity,
      reasonCode,
      note: note.trim(),
      balanceBefore: Number(selectedPass.balance ?? 0),
    })
  }

  const renderPassPicker = () => {
    if (activePasses.length <= 1) {
      if (!selectedPass) return null
      return (
        <section className="coach-adjust-pass-target">
          <span className="eyebrow">PASS</span>
          <strong>{selectedPass.name}</strong>
          <p>{selectedPass.balance} remaining</p>
          {selectedPass.expiresAt ? (
            <small>Expires {formatPackageDate(selectedPass.expiresAt)}</small>
          ) : null}
        </section>
      )
    }

    return (
      <label className="coach-field coach-field--wide">
        <span>Pass *</span>
        <select
          className="coach-field-input"
          value={selectedPassId}
          onChange={(event) => setSelectedPassId(event.target.value)}
          disabled={submitting}
          aria-label="Pass"
        >
          {activePasses.map((pass) => (
            <option key={pass.id} value={pass.id}>
              {pass.name} · {pass.balance} remaining
              {pass.expiresAt
                ? ` · expires ${formatPackageDate(pass.expiresAt)}`
                : ''}
            </option>
          ))}
        </select>
      </label>
    )
  }

  const renderMenu = () => (
    <>
      <section className="coach-adjust-pass-balance">
        <span className="eyebrow">CURRENT BALANCE</span>
        <strong>{totalBalance} sessions</strong>
      </section>

      <div className="coach-adjust-pass-actions">
        <button
          type="button"
          className="coach-secondary-button"
          disabled={submitting || creditPasses.length === 0}
          onClick={() => {
            setMode(MODES.ADD)
            setReasonCode(PASS_CREDIT_REASON.ADMINISTRATIVE)
            setError('')
          }}
        >
          Add session
        </button>
        <button
          type="button"
          className="coach-secondary-button"
          disabled={submitting || removeBlockedByBalance}
          onClick={() => {
            setMode(MODES.REMOVE)
            setReasonCode('')
            setError('')
          }}
        >
          Remove session
        </button>
      </div>

      {removeBlockedByBalance ? (
        <p className="coach-adjust-pass-note">
          No sessions remaining on this pass.
        </p>
      ) : null}
    </>
  )

  const renderRemove = () => (
    <>
      {renderPassPicker()}

      <label className="coach-field coach-field--wide">
        <span>Quantity</span>
        <input
          className="coach-field-input"
          type="number"
          min="1"
          max={selectedPass?.balance ?? 1}
          inputMode="numeric"
          value={quantity}
          onChange={(event) => setQuantity(event.target.value)}
          disabled={submitting}
          aria-label="Quantity"
        />
      </label>

      <label className="coach-field coach-field--wide">
        <span>Reason *</span>
        <select
          className="coach-field-input"
          value={reasonCode}
          onChange={(event) => setReasonCode(event.target.value)}
          disabled={submitting}
          aria-label="Reason"
        >
          <option value="">Select a reason</option>
          {PASS_DEBIT_REASON_OPTIONS.map((option) => (
            <option key={option.id} value={option.id}>
              {option.label}
            </option>
          ))}
        </select>
      </label>

      <label className="coach-field coach-field--wide">
        <span>Note</span>
        <textarea
          className="coach-field-input"
          rows={3}
          value={note}
          onChange={(event) => setNote(event.target.value)}
          disabled={submitting}
          placeholder="Optional context for this adjustment"
          aria-label="Note"
        />
      </label>

      <p className="coach-adjust-pass-warning">
        This removes sessions from the pass ledger. It cannot be undone — add
        sessions back separately if needed.
      </p>
    </>
  )

  const renderAdd = () => (
    <>
      {renderPassPicker()}

      <label className="coach-field coach-field--wide">
        <span>Quantity</span>
        <input
          className="coach-field-input"
          type="number"
          min="1"
          inputMode="numeric"
          value={quantity}
          onChange={(event) => setQuantity(event.target.value)}
          disabled={submitting}
          aria-label="Quantity"
        />
      </label>

      <label className="coach-field coach-field--wide">
        <span>Reason *</span>
        <select
          className="coach-field-input"
          value={reasonCode}
          onChange={(event) => setReasonCode(event.target.value)}
          disabled={submitting}
          aria-label="Reason"
        >
          <option value="">Select a reason</option>
          {PASS_CREDIT_REASON_OPTIONS.map((option) => (
            <option key={option.id} value={option.id}>
              {option.label}
            </option>
          ))}
        </select>
      </label>

      <label className="coach-field coach-field--wide">
        <span>Note</span>
        <textarea
          className="coach-field-input"
          rows={3}
          value={note}
          onChange={(event) => setNote(event.target.value)}
          disabled={submitting}
          placeholder="Optional context for this adjustment"
          aria-label="Note"
        />
      </label>
    </>
  )

  const title =
    mode === MODES.REMOVE
      ? 'Remove session'
      : mode === MODES.ADD
        ? 'Add session'
        : 'Pass adjustment'

  return (
    <AppUiBackdrop
      open={open}
      onClose={submitting ? undefined : onClose}
      className="coach-adjust-pass-backdrop"
    >
      <section
        ref={panelRef}
        className="coach-adjust-pass-sheet"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        data-testid="coach-adjust-pass-sheet"
        tabIndex={-1}
        onClick={(event) => event.stopPropagation()}
      >
        <header className="coach-adjust-pass-sheet-header">
          <div>
            <span className="eyebrow">PASS ADJUSTMENT</span>
            <h2 id={titleId}>{title}</h2>
            {mode === MODES.MENU ? (
              <p>Adjust sessions on the canonical pass ledger.</p>
            ) : null}
          </div>
          <AppUiCloseButton onClick={onClose} disabled={submitting} />
        </header>

        <div className="coach-adjust-pass-sheet-body">
          {mode === MODES.MENU
            ? renderMenu()
            : mode === MODES.REMOVE
              ? renderRemove()
              : renderAdd()}
          {error ? <p className="coach-adjust-pass-error">{error}</p> : null}
        </div>

        <footer className="coach-adjust-pass-sheet-footer">
          {mode === MODES.MENU ? (
            <button
              type="button"
              className="coach-secondary-button coach-adjust-pass-footer-wide"
              onClick={onClose}
              disabled={submitting}
            >
              Close
            </button>
          ) : (
            <>
              <button
                type="button"
                className="coach-secondary-button"
                onClick={() => {
                  setMode(MODES.MENU)
                  setError('')
                }}
                disabled={submitting}
              >
                Back
              </button>
              {mode === MODES.REMOVE ? (
                <button
                  type="button"
                  className="gold-button machined coach-primary-action"
                  onClick={handleRemove}
                  disabled={submitting || removeDisabled}
                >
                  {submitting
                    ? 'Removing…'
                    : `Remove ${parsedQuantity || 1} session${parsedQuantity === 1 ? '' : 's'}`}
                </button>
              ) : (
                <button
                  type="button"
                  className="gold-button machined coach-primary-action"
                  onClick={handleAdd}
                  disabled={submitting || parsedQuantity <= 0 || !selectedPass}
                >
                  {submitting
                    ? 'Adding…'
                    : `Add ${parsedQuantity || 1} session${parsedQuantity === 1 ? '' : 's'}`}
                </button>
              )}
            </>
          )}
        </footer>
      </section>
    </AppUiBackdrop>
  )
}
