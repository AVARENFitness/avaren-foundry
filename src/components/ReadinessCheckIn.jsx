import {
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

export default function ReadinessCheckIn({
  initialValues,
  onSave,
  onClose,
}) {
  const [values, setValues] = useState(
    initialValues ?? defaultReadinessCheckIn(),
  )

  const average = useMemo(
    () =>
      Math.round(
        ((values.sleep +
          values.energy +
          (6 - values.soreness) +
          (6 - values.stress)) /
          20) *
          100,
      ),
    [values],
  )

  return createPortal(
    <div className="readiness-overlay" role="dialog">
      <section className="readiness-modal">
        <header>
          <div>
            <span className="eyebrow">DAILY READINESS</span>
            <h2>How are you feeling today?</h2>
            <p>
              Four quick ratings help AVAREN adjust today’s
              training and recovery guidance.
            </p>
          </div>
          <button
            className="readiness-close"
            onClick={onClose}
            aria-label="Close readiness check-in"
          >
            <X size={18} />
          </button>
        </header>

        <div className="readiness-preview">
          <strong>{average}</strong>
          <span>Live check-in estimate</span>
        </div>

        <div className="readiness-fields">
          {READINESS_FIELDS.map((field) => {
            const Icon = FIELD_ICONS[field.id]

            return (
              <div className="readiness-field" key={field.id}>
                <header>
                  <div>
                    <Icon size={17} />
                    <strong>{field.label}</strong>
                  </div>
                  <span>{values[field.id]} / 5</span>
                </header>

                <div className="readiness-options">
                  {[1, 2, 3, 4, 5].map((rating) => (
                    <button
                      key={rating}
                      className={
                        values[field.id] === rating
                          ? 'active'
                          : ''
                      }
                      onClick={() =>
                        setValues((current) => ({
                          ...current,
                          [field.id]: rating,
                        }))
                      }
                    >
                      {rating}
                    </button>
                  ))}
                </div>

                <div className="readiness-scale">
                  <span>{field.low}</span>
                  <span>{field.high}</span>
                </div>
              </div>
            )
          })}
        </div>

        <button
          className="gold-button machined readiness-save"
          onClick={() => onSave(values)}
        >
          <Check size={18} />
          Save Today’s Check-In
        </button>
      </section>
    </div>,
    document.body,
  )
}
