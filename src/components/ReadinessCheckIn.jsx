import {
  ArrowLeft,
  ArrowRight,
  BatteryCharging,
  Brain,
  Check,
  Moon,
  X,
  Zap,
} from 'lucide-react'
import { useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import {
  READINESS_FIELDS,
  defaultReadinessCheckIn,
} from '../lib/readiness'

const FIELD_ICONS = {
  sleep: Moon,
  energy: Zap,
  soreness: BatteryCharging,
  stress: Brain,
}

const RATING_LABELS = {
  sleep: ['Poor', 'Restless', 'Fair', 'Good', 'Excellent'],
  energy: ['Drained', 'Low', 'Steady', 'Good', 'Energized'],
  soreness: ['Fresh', 'Light', 'Moderate', 'Sore', 'Very sore'],
  stress: ['Calm', 'Light', 'Moderate', 'High', 'Very high'],
}

const scoreFromValues = (values) =>
  Math.round(
    ((values.sleep +
      values.energy +
      (6 - values.soreness) +
      (6 - values.stress)) /
      20) *
      100,
  )

const ritualMessage = (score) => {
  if (score >= 82) {
    return {
      status: 'Ready to push',
      copy:
        'Your sleep, energy, and recovery signals support a strong training day.',
      tone: 'high',
    }
  }

  if (score >= 65) {
    return {
      status: 'Ready to train',
      copy:
        'You look prepared for normal training. Let the warm-up confirm the pace.',
      tone: 'medium',
    }
  }

  if (score >= 48) {
    return {
      status: 'Use a lighter approach',
      copy:
        'Today may feel better with flexible load, volume, or intensity.',
      tone: 'moderate',
    }
  }

  return {
    status: 'Recovery deserves attention',
    copy:
      'Your check-in suggests keeping today simple and protecting recovery.',
    tone: 'low',
  }
}

export default function ReadinessCheckIn({
  initialValues,
  onSave,
  onClose,
  userName,
}) {
  const [values, setValues] = useState(
    initialValues ?? defaultReadinessCheckIn(),
  )
  const [step, setStep] = useState(0)

  const isResult = step === READINESS_FIELDS.length
  const field = READINESS_FIELDS[step]
  const score = useMemo(
    () => scoreFromValues(values),
    [values],
  )
  const result = ritualMessage(score)
  const firstName =
    userName?.trim()?.split(/\s+/)[0] || null

  const chooseRating = (rating) => {
    setValues((current) => ({
      ...current,
      [field.id]: rating,
    }))

    window.setTimeout(() => {
      setStep((current) =>
        Math.min(
          READINESS_FIELDS.length,
          current + 1,
        ),
      )
    }, 150)
  }

  return createPortal(
    <div
      className="readiness-overlay morning-ritual-overlay"
      role="dialog"
      aria-modal="true"
      aria-label="Daily readiness check-in"
    >
      <section className="morning-ritual">
        <header className="morning-ritual-header">
          <div>
            <span className="eyebrow">
              MORNING RITUAL
            </span>
            <strong>
              {isResult
                ? 'Your readiness'
                : `${step + 1} of ${
                    READINESS_FIELDS.length
                  }`}
            </strong>
          </div>

          <button
            className="readiness-close"
            onClick={onClose}
            aria-label="Close readiness check-in"
          >
            <X size={18} />
          </button>
        </header>

        <div className="morning-ritual-progress">
          {READINESS_FIELDS.map(
            (item, index) => (
              <span
                key={item.id}
                className={
                  index < step || isResult
                    ? 'complete'
                    : index === step
                    ? 'active'
                    : ''
                }
              />
            ),
          )}
        </div>

        {!isResult ? (
          <div
            className="morning-ritual-question"
            key={field.id}
          >
            <div className="morning-ritual-icon">
              {(() => {
                const Icon = FIELD_ICONS[field.id]
                return <Icon size={25} />
              })()}
            </div>

            <span>
              {firstName && step === 0
                ? `Good morning, ${firstName}.`
                : 'How are you feeling?'}
            </span>

            <h2>
              {field.id === 'sleep'
                ? 'How did you sleep?'
                : field.id === 'energy'
                ? 'How is your energy?'
                : field.id === 'soreness'
                ? 'How sore do you feel?'
                : 'How is your stress?'}
            </h2>

            <p>
              Choose the answer that feels most
              accurate right now.
            </p>

            <div className="morning-ritual-options">
              {[1, 2, 3, 4, 5].map(
                (rating) => (
                  <button
                    key={rating}
                    className={
                      values[field.id] === rating
                        ? 'selected'
                        : ''
                    }
                    onClick={() =>
                      chooseRating(rating)
                    }
                  >
                    <strong>{rating}</strong>
                    <span>
                      {
                        RATING_LABELS[field.id][
                          rating - 1
                        ]
                      }
                    </span>
                  </button>
                ),
              )}
            </div>

            <div className="morning-ritual-scale">
              <span>{field.low}</span>
              <span>{field.high}</span>
            </div>
          </div>
        ) : (
          <div
            className={`morning-ritual-result ${result.tone}`}
          >
            <img
              src="/brand/foundation/icon-192.png"
              alt=""
              aria-hidden="true"
            />

            <span className="eyebrow">
              TODAY’S READINESS
            </span>

            <strong className="morning-ritual-score">
              {score}
            </strong>

            <h2>{result.status}</h2>
            <p>{result.copy}</p>

            <button
              className="gold-button machined morning-ritual-save"
              onClick={() => onSave(values)}
            >
              <Check size={18} />
              Begin Today
              <ArrowRight size={17} />
            </button>
          </div>
        )}

        <footer className="morning-ritual-footer">
          <button
            onClick={() =>
              setStep((current) =>
                Math.max(0, current - 1),
              )
            }
            disabled={step === 0}
          >
            <ArrowLeft size={16} />
            Back
          </button>

          {!isResult && (
            <button
              onClick={() =>
                setStep((current) =>
                  Math.min(
                    READINESS_FIELDS.length,
                    current + 1,
                  ),
                )
              }
            >
              Next
              <ArrowRight size={16} />
            </button>
          )}
        </footer>
      </section>
    </div>,
    document.body,
  )
}
