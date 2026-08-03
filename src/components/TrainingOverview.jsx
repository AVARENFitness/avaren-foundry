import {
  Activity,
  CalendarDays,
  Clock3,
  Dumbbell,
  Flame,
  Layers3,
  RefreshCw,
  Trophy,
} from 'lucide-react'
import { analyticsSnapshot } from '../lib/analytics'

const compactNumber = (value) => {
  const number = Number(value || 0)

  if (number >= 1_000_000) {
    return `${(number / 1_000_000).toFixed(number >= 10_000_000 ? 0 : 1)}M`
  }

  if (number >= 1_000) {
    return `${(number / 1_000).toFixed(number >= 100_000 ? 0 : 1)}K`
  }

  return Math.round(number).toLocaleString()
}

export default function TrainingOverview({ state }) {
  const analytics = analyticsSnapshot(state)

  const metrics = [
    {
      label: 'Workouts',
      value: analytics.totalWorkouts,
      icon: Trophy,
    },
    {
      label: 'Lifetime Volume',
      value: `${compactNumber(analytics.lifetimeVolume)} lb`,
      icon: Dumbbell,
    },
    {
      label: 'Weekly Volume',
      value: `${compactNumber(analytics.weeklyVolume)} lb`,
      icon: CalendarDays,
    },
    {
      label: 'Sets Logged',
      value: compactNumber(analytics.totalSets),
      icon: Layers3,
    },
    {
      label: 'Current Streak',
      value: `${analytics.currentStreak} day${analytics.currentStreak === 1 ? '' : 's'}`,
      icon: Flame,
    },
    {
      label: 'Longest Streak',
      value: `${analytics.longestStreak} day${analytics.longestStreak === 1 ? '' : 's'}`,
      icon: Activity,
    },
    {
      label: 'Avg. Duration',
      value: analytics.averageDurationMinutes
        ? `${analytics.averageDurationMinutes} min`
        : '—',
      icon: Clock3,
    },
    {
      label: 'Mobility Flows',
      value: analytics.mobility.total,
      icon: RefreshCw,
    },
  ]

  const muscleEntries = Object.entries(analytics.muscleVolume)
    .sort(([, first], [, second]) => second - first)
    .slice(0, 5)

  const maximumMuscleVolume = Math.max(
    1,
    ...muscleEntries.map(([, volume]) => volume),
  )

  return (
    <section className="training-overview">
      <header>
        <span className="eyebrow">YOUR TRAINING</span>
        <h2>Built over time.</h2>
        <p>
          Your work, consistency, and recovery—measured without adding noise to Gym Mode.
        </p>
      </header>

      <div className="training-overview-grid">
        {metrics.map(({ label, value, icon: Icon }) => (
          <article key={label}>
            <Icon size={17} />
            <span>{label}</span>
            <strong>{value}</strong>
          </article>
        ))}
      </div>

      <div className="muscle-volume-panel">
        <div className="muscle-volume-heading">
          <div>
            <span className="eyebrow">MUSCLE VOLUME</span>
            <h3>Where your work is going.</h3>
          </div>
          <small>Lifetime</small>
        </div>

        {!muscleEntries.length && (
          <p className="analytics-empty">
            Complete workouts to begin building your muscle-volume profile.
          </p>
        )}

        {muscleEntries.map(([muscle, volume]) => (
          <div className="muscle-volume-row" key={muscle}>
            <div>
              <strong>{muscle}</strong>
              <span>{Math.round(volume).toLocaleString()} lb</span>
            </div>
            <div className="muscle-volume-track">
              <div
                style={{
                  width: `${Math.max(
                    5,
                    (volume / maximumMuscleVolume) * 100,
                  )}%`,
                }}
              />
            </div>
          </div>
        ))}
      </div>
    </section>
  )
}
