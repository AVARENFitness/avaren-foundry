import { ArrowLeft, CalendarDays, Save } from 'lucide-react'
import { useState } from 'react'

const DAYS = [
  ['0', 'Sunday'],
  ['1', 'Monday'],
  ['2', 'Tuesday'],
  ['3', 'Wednesday'],
  ['4', 'Thursday'],
  ['5', 'Friday'],
  ['6', 'Saturday'],
]

export default function WeeklyPlannerScreen({
  program,
  schedule,
  onSave,
  onClose,
}) {
  const [draft, setDraft] = useState(schedule)
  const choices = ['Rest', ...program.rotation]

  return (
    <section className="planner-screen">
      <header className="builder-header">
        <button className="builder-back" onClick={onClose}>
          <ArrowLeft size={18} /> Back
        </button>
        <div>
          <span className="eyebrow">TRAINING WEEK</span>
          <h1>Weekly Program</h1>
        </div>
      </header>

      <section className="planner-intro">
        <CalendarDays />
        <div>
          <strong>Choose your default week.</strong>
          <p>You can still override today from Home without changing this plan.</p>
        </div>
      </section>

      <div className="planner-days">
        {DAYS.map(([key, label]) => (
          <label key={key} className="planner-day">
            <span>{label}</span>
            <select
              value={draft[key] ?? 'Rest'}
              onChange={(event) =>
                setDraft((current) => ({
                  ...current,
                  [key]: event.target.value,
                }))
              }
            >
              {choices.map((choice) => (
                <option key={choice}>{choice}</option>
              ))}
            </select>
          </label>
        ))}
      </div>

      <div className="builder-save-bar">
        <button
          className="gold-button machined"
          onClick={() => onSave(draft)}
        >
          <Save size={18} /> Save Weekly Program
        </button>
      </div>
    </section>
  )
}
