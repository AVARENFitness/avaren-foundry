import {
  ArrowLeft,
  CalendarDays,
  Check,
  Flame,
  Moon,
  Save,
  Wind,
  X,
} from 'lucide-react'
import { useMemo, useState } from 'react'
import {
  WEEKDAY_NAMES,
  buildTrainingWeek,
  weeklyTrainingSummary,
} from '../lib/trainingWeek'

const statusLabel = (day) => {
  if (day.completedWorkout) return 'Completed'
  if (day.status === 'missed') return 'Missed'
  if (day.status === 'today') return 'Today'
  if (day.status === 'rest-today') return 'Rest today'
  if (day.status === 'rest') return 'Rest day'
  return 'Upcoming'
}

const StatusIcon = ({ day }) => {
  if (day.completedWorkout) return <Check size={15} />
  if (day.status === 'missed') return <X size={15} />
  if (day.isRest) return <Moon size={15} />
  return <CalendarDays size={15} />
}

export default function WeeklyPlannerScreen({
  program,
  schedule,
  state,
  onSave,
  onClose,
}) {
  const [draft, setDraft] = useState(schedule)
  const choices = ['Rest', ...program.rotation]

  const previewState = useMemo(
    () => ({
      ...(state ?? {}),
      weeklySchedule: draft,
    }),
    [state, draft],
  )

  const week = buildTrainingWeek(previewState)
  const summary = weeklyTrainingSummary(previewState)

  return (
    <section className="planner-screen weekly-calendar-screen">
      <header className="builder-header">
        <button className="builder-back" onClick={onClose}>
          <ArrowLeft size={18} /> Back
        </button>
        <div>
          <span className="eyebrow">TRAINING WEEK</span>
          <h1>Weekly Calendar</h1>
        </div>
      </header>

      <section className="weekly-calendar-hero">
        <CalendarDays size={26} />
        <div>
          <span className="eyebrow">CURRENT WEEK</span>
          <h2>{summary.adherence}% adherence</h2>
          <p>
            Your plan updates automatically as workouts,
            Daily Resets, and Recovery Flows are completed.
          </p>
        </div>
      </section>

      <section className="weekly-calendar-summary">
        <article>
          <span>Planned</span>
          <strong>{summary.planned}</strong>
        </article>
        <article>
          <span>Completed</span>
          <strong>{summary.completed}</strong>
        </article>
        <article>
          <span>Missed</span>
          <strong>{summary.missed}</strong>
        </article>
        <article>
          <span>Recovery</span>
          <strong>
            {summary.resets + summary.recoveryFlows}
          </strong>
        </article>
      </section>

      <div className="weekly-calendar-days">
        {week.map((day) => (
          <article
            key={day.dateKey}
            className={`weekly-calendar-day ${day.status}`}
          >
            <header>
              <div className="weekly-calendar-date">
                <span>{WEEKDAY_NAMES[day.dayIndex]}</span>
                <strong>{day.dateNumber}</strong>
              </div>

              <div className="weekly-calendar-status">
                <StatusIcon day={day} />
                <span>{statusLabel(day)}</span>
              </div>
            </header>

            <label>
              <span>Planned session</span>
              <select
                value={draft[day.dayIndex] ?? 'Rest'}
                onChange={(event) =>
                  setDraft((current) => ({
                    ...current,
                    [day.dayIndex]: event.target.value,
                  }))
                }
              >
                {choices.map((choice) => (
                  <option key={choice}>{choice}</option>
                ))}
              </select>
            </label>

            {day.completedWorkout && (
              <div className="weekly-completed-workout">
                <Check size={14} />
                <div>
                  <span>Completed workout</span>
                  <strong>{day.completedWorkout.name}</strong>
                </div>
              </div>
            )}

            {(day.dailyReset || day.recoveryFlow) && (
              <div className="weekly-recovery-tags">
                {day.dailyReset && (
                  <span>
                    <Flame size={12} /> Daily Reset
                  </span>
                )}
                {day.recoveryFlow && (
                  <span>
                    <Wind size={12} /> Recovery Flow
                  </span>
                )}
              </div>
            )}
          </article>
        ))}
      </div>

      <div className="builder-save-bar">
        <button
          className="gold-button machined"
          onClick={() => onSave(draft)}
        >
          <Save size={18} /> Save Weekly Calendar
        </button>
      </div>
    </section>
  )
}
