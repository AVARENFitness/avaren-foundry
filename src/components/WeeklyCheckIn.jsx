import {
  ArrowLeft,
  ArrowRight,
  CalendarCheck2,
  Check,
  X,
} from 'lucide-react'
import { useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import {
  WEEKLY_CHECK_IN_STEPS,
  emptyWeeklyCheckInDraft,
  validateWeeklyCheckInDraft,
} from '../lib/weeklyCheckIn'

export default function WeeklyCheckIn({
  initialDraft = null,
  onSubmit,
  onClose,
  userName,
}) {
  const [draft, setDraft] = useState(initialDraft ?? emptyWeeklyCheckInDraft())
  const [step, setStep] = useState(0)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [complete, setComplete] = useState(false)

  const steps = WEEKLY_CHECK_IN_STEPS
  const current = steps[step]
  const isLast = step === steps.length - 1
  const firstName = userName?.trim()?.split(/\s+/)[0] || null

  const canContinue = useMemo(() => {
    if (!current) return false
    if (current.type === 'rating') {
      const value = draft[current.id]
      return Number.isFinite(Number(value)) && value >= 1 && value <= 5
    }
    if (current.type === 'choice') {
      return Boolean(draft[current.id])
    }
    return true
  }, [current, draft])

  const updateDraft = (patch = {}) => {
    setDraft((currentDraft) => ({ ...currentDraft, ...patch }))
    setError('')
  }

  const goNext = async () => {
    if (!canContinue) return

    if (!isLast) {
      setStep((value) => Math.min(value + 1, steps.length - 1))
      return
    }

    const validation = validateWeeklyCheckInDraft(draft)
    if (!validation.ok) {
      setError(validation.message)
      return
    }

    setSaving(true)
    setError('')
    try {
      await onSubmit?.(validation.draft)
      setComplete(true)
    } catch (submitError) {
      setError(
        submitError?.message ??
          'Could not send your check-in. Your answers are still here.',
      )
    } finally {
      setSaving(false)
    }
  }

  return createPortal(
    <div
      className="readiness-overlay morning-ritual-overlay weekly-checkin-overlay"
      role="dialog"
      aria-modal="true"
      aria-label="Weekly check-in"
    >
      <section className="morning-ritual weekly-checkin">
        <header className="morning-ritual-header">
          <div>
            <span className="eyebrow">WEEKLY CHECK-IN</span>
            <strong>
              {complete
                ? 'Sent'
                : `${step + 1} of ${steps.length}`}
            </strong>
          </div>

          <button
            className="readiness-close"
            onClick={onClose}
            aria-label="Close weekly check-in"
            disabled={saving}
          >
            <X size={18} />
          </button>
        </header>

        <div className="morning-ritual-progress">
          {steps.map((item, index) => (
            <span
              key={item.id}
              className={
                complete || index < step
                  ? 'complete'
                  : index === step
                  ? 'active'
                  : ''
              }
            />
          ))}
        </div>

        {complete ? (
          <div className="morning-ritual-result weekly-checkin-result">
            <div className="morning-ritual-icon">
              <Check size={28} />
            </div>
            <h2>Check-in sent</h2>
            <p>
              {firstName ? `${firstName}, your` : 'Your'} coach has your weekly
              update.
            </p>
            <button
              type="button"
              className="gold-button machined morning-ritual-save"
              onClick={onClose}
            >
              Done
            </button>
          </div>
        ) : (
          <>
            <div className="morning-ritual-question">
              <div className="morning-ritual-icon">
                <CalendarCheck2 size={24} />
              </div>
              <span>{current.eyebrow ?? 'THIS WEEK'}</span>
              <h2>{current.title}</h2>
              {current.type === 'rating' && (
                <>
                  <div className="morning-ritual-options">
                    {current.labels.map((label, index) => {
                      const rating = index + 1
                      const selected = draft[current.id] === rating
                      return (
                        <button
                          key={label}
                          type="button"
                          className={selected ? 'selected' : ''}
                          onClick={() => updateDraft({ [current.id]: rating })}
                        >
                          <strong>{rating}</strong>
                          <span>{label}</span>
                        </button>
                      )
                    })}
                  </div>
                  <div className="morning-ritual-scale">
                    <span>{current.low}</span>
                    <span>{current.high}</span>
                  </div>
                </>
              )}

              {current.type === 'choice' && (
                <div className="weekly-checkin-choices">
                  {current.choices.map((choice) => (
                    <button
                      key={choice.value}
                      type="button"
                      className={
                        draft[current.id] === choice.value ? 'selected' : ''
                      }
                      onClick={() =>
                        updateDraft({ [current.id]: choice.value })
                      }
                    >
                      {choice.label}
                    </button>
                  ))}
                  {(draft[current.id] === 'coach_should_know' ||
                    draft[current.id] === 'minor_issue') && (
                    <textarea
                      className="weekly-checkin-note"
                      value={draft[current.noteField] ?? ''}
                      placeholder={current.notePlaceholder}
                      onChange={(event) =>
                        updateDraft({ [current.noteField]: event.target.value })
                      }
                    />
                  )}
                </div>
              )}

              {current.type === 'text' && (
                <textarea
                  className="weekly-checkin-note"
                  value={draft[current.id] ?? ''}
                  placeholder={current.placeholder}
                  onChange={(event) =>
                    updateDraft({ [current.id]: event.target.value })
                  }
                />
              )}
            </div>

            {error && <p className="weekly-checkin-error">{error}</p>}

            <footer className="morning-ritual-footer">
              <button
                type="button"
                onClick={() => setStep((value) => Math.max(0, value - 1))}
                disabled={step === 0 || saving}
              >
                <ArrowLeft size={16} />
                Back
              </button>

              <button
                type="button"
                className="gold-button machined"
                onClick={goNext}
                disabled={!canContinue || saving}
              >
                {saving ? 'Sending…' : isLast ? 'Submit' : 'Next'}
                {!saving && !isLast && <ArrowRight size={16} />}
              </button>
            </footer>
          </>
        )}
      </section>
    </div>,
    document.body,
  )
}
