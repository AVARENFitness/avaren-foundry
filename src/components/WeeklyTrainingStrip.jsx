import {
  CalendarDays,
  Check,
  Flame,
  Moon,
  Wind,
  X,
} from 'lucide-react'
import {
  buildTrainingWeek,
  weeklyTrainingSummary,
} from '../lib/trainingWeek'

const STATUS_ICON = {
  completed: Check,
  today: CalendarDays,
  'rest-today': Moon,
  rest: Moon,
  missed: X,
  upcoming: CalendarDays,
}

export default function WeeklyTrainingStrip({
  state,
  onOpenPlanner,
}) {
  const days = buildTrainingWeek(state)
  const summary = weeklyTrainingSummary(state)

  return (
    <section className="weekly-training-strip">
      <header>
        <div>
          <span className="eyebrow">YOUR WEEK</span>
          <h2>{summary.adherence}% adherence</h2>
        </div>
        <button onClick={onOpenPlanner}>
          Edit plan
        </button>
      </header>

      <div className="weekly-training-days">
        {days.map((day) => {
          const Icon = STATUS_ICON[day.status]

          return (
            <button
              key={day.dateKey}
              className={`weekly-training-day ${day.status}`}
              onClick={onOpenPlanner}
              aria-label={`${day.dayName}: ${day.plannedWorkout}`}
            >
              <span>{day.dayShort}</span>
              <strong>{day.dateNumber}</strong>
              <div className="weekly-day-status">
                <Icon size={13} />
              </div>

              <small>
                {day.completedWorkout?.name ??
                  day.plannedWorkout}
              </small>

              {(day.dailyReset || day.recoveryFlow) && (
                <div className="weekly-mobility-icons">
                  {day.dailyReset && <Flame size={10} />}
                  {day.recoveryFlow && <Wind size={10} />}
                </div>
              )}
            </button>
          )
        })}
      </div>
    </section>
  )
}
