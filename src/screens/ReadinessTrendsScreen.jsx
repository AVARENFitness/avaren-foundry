import {
  ArrowLeft,
  BatteryCharging,
  Brain,
  CalendarDays,
  Dumbbell,
  Flame,
  Moon,
  Sparkles,
  TrendingDown,
  TrendingUp,
  Zap,
} from 'lucide-react'
import {
  readinessCorrelationSnapshot,
  readinessTrendSnapshot,
} from '../lib/readiness'
import { recentPRs } from '../lib/metrics'

const formatDate = (value) =>
  value
    ? new Date(`${value}T12:00:00`).toLocaleDateString([], {
        month: 'short',
        day: 'numeric',
      })
    : '—'

const factorMeta = [
  ['sleep', 'Sleep', Moon],
  ['energy', 'Energy', Zap],
  ['soreness', 'Soreness', BatteryCharging],
  ['stress', 'Stress', Brain],
]

const scoreTone = (score) => {
  if (score >= 82) return 'high'
  if (score >= 65) return 'medium'
  if (score >= 48) return 'moderate'
  return 'low'
}

function MiniTrend({ entries, field, invert = false }) {
  const values = entries.map((entry) => {
    const raw =
      field === 'score'
        ? entry.score
        : Number(entry[field] ?? 0)

    return field === 'score'
      ? raw
      : invert
      ? (6 - raw) * 20
      : raw * 20
  })

  const max = Math.max(100, ...values)

  return (
    <div className="readiness-mini-trend">
      {values.map((value, index) => (
        <span
          key={`${field}-${index}`}
          style={{
            height: `${Math.max(8, (value / max) * 100)}%`,
          }}
        />
      ))}
    </div>
  )
}

export default function ReadinessTrendsScreen({
  state,
  onClose,
}) {
  const seven = readinessTrendSnapshot(state, 7)
  const thirty = readinessTrendSnapshot(state, 30)
  const correlation = readinessCorrelationSnapshot(state)
  const prs = recentPRs(state.history, 1000)

  const prReadiness = prs
    .map((pr) =>
      thirty.entries.find((entry) => entry.date === pr.date),
    )
    .filter(Boolean)

  const averagePrReadiness = prReadiness.length
    ? Math.round(
        prReadiness.reduce(
          (sum, entry) => sum + entry.score,
          0,
        ) / prReadiness.length,
      )
    : null

  if (!thirty.count) {
    return (
      <section className="readiness-trends-screen">
        <header className="builder-header">
          <button className="builder-back" onClick={onClose}>
            <ArrowLeft size={18} /> Back
          </button>
          <div>
            <span className="eyebrow">READINESS ANALYTICS</span>
            <h1>Readiness Trends</h1>
          </div>
        </header>

        <section className="empty-state">
          <Sparkles size={26} />
          <h2>Your readiness history starts here.</h2>
          <p>
            Complete daily check-ins to unlock 7-day and
            30-day trends, training comparisons, and
            performance insights.
          </p>
        </section>
      </section>
    )
  }

  return (
    <section className="readiness-trends-screen">
      <header className="builder-header">
        <button className="builder-back" onClick={onClose}>
          <ArrowLeft size={18} /> Back
        </button>
        <div>
          <span className="eyebrow">READINESS ANALYTICS</span>
          <h1>Readiness Trends</h1>
        </div>
      </header>

      <section className="readiness-trends-hero">
        <div
          className={`readiness-trends-score ${scoreTone(
            seven.average ?? thirty.average ?? 0,
          )}`}
        >
          <strong>{seven.average ?? thirty.average ?? '—'}</strong>
          <span>7-day average</span>
        </div>

        <div>
          <span className="eyebrow">RECOVERY PATTERN</span>
          <h2>
            {seven.average >= 82
              ? 'You are trending ready.'
              : seven.average >= 65
              ? 'Your readiness is holding steady.'
              : seven.average >= 48
              ? 'A lighter approach may help.'
              : 'Recovery deserves priority.'}
          </h2>
          <p>
            Based on {thirty.count} saved check-in
            {thirty.count === 1 ? '' : 's'} in the last 30 days.
          </p>
        </div>
      </section>

      <section className="readiness-summary-grid">
        <article>
          <CalendarDays />
          <span>30-day average</span>
          <strong>{thirty.average ?? '—'}</strong>
        </article>
        <article>
          <TrendingUp />
          <span>Best day</span>
          <strong>{thirty.best?.score ?? '—'}</strong>
          <small>{formatDate(thirty.best?.date)}</small>
        </article>
        <article>
          <TrendingDown />
          <span>Lowest day</span>
          <strong>{thirty.lowest?.score ?? '—'}</strong>
          <small>{formatDate(thirty.lowest?.date)}</small>
        </article>
        <article>
          <Flame />
          <span>Consistency</span>
          <strong>{thirty.consistency ?? '—'}%</strong>
        </article>
      </section>

      <section className="readiness-chart-panel">
        <header>
          <div>
            <span className="eyebrow">DAILY READINESS</span>
            <h2>Last 30 days</h2>
          </div>
          <strong>{thirty.average ?? '—'}</strong>
        </header>

        <MiniTrend entries={thirty.entries} field="score" />

        <div className="readiness-chart-dates">
          <span>{formatDate(thirty.entries[0]?.date)}</span>
          <span>{formatDate(thirty.entries.at(-1)?.date)}</span>
        </div>
      </section>

      <section className="readiness-factor-grid">
        {factorMeta.map(([id, label, Icon]) => (
          <article key={id}>
            <header>
              <Icon size={17} />
              <span>{label}</span>
              <strong>{thirty[id] ?? '—'}</strong>
            </header>
            <MiniTrend
              entries={thirty.entries}
              field={id}
              invert={id === 'soreness' || id === 'stress'}
            />
          </article>
        ))}
      </section>

      <section className="readiness-correlation-panel">
        <div className="panel-title">
          <span className="eyebrow">TRAINING CORRELATION</span>
          <h2>How readiness meets performance.</h2>
        </div>

        <div className="readiness-correlation-grid">
          <article>
            <Dumbbell size={18} />
            <span>Workout-day average</span>
            <strong>{thirty.workoutDayAverage ?? '—'}</strong>
          </article>
          <article>
            <Moon size={18} />
            <span>Rest-day average</span>
            <strong>{thirty.restDayAverage ?? '—'}</strong>
          </article>
          <article>
            <Sparkles size={18} />
            <span>PR-day average</span>
            <strong>{averagePrReadiness ?? '—'}</strong>
          </article>
          <article>
            <BatteryCharging size={18} />
            <span>Low-readiness workouts</span>
            <strong>{thirty.lowReadinessWorkoutCount}</strong>
          </article>
        </div>

        <p className="readiness-correlation-note">
          {correlation.workoutDays.length
            ? `AVAREN has matched ${correlation.workoutDays.length} workout day${
                correlation.workoutDays.length === 1 ? '' : 's'
              } with saved readiness entries.`
            : 'Complete a readiness check-in on workout days to build stronger performance comparisons.'}
        </p>
      </section>

      {seven.average !== null && seven.average < 50 && (
        <section className="readiness-low-guidance">
          <BatteryCharging size={22} />
          <div>
            <span className="eyebrow">RECOVERY EMPHASIS</span>
            <h2>Your recent average supports a lighter week.</h2>
            <p>
              Consider shorter sessions, fewer working sets,
              reduced intensity, and equipment-free mobility
              until sleep and energy improve.
            </p>
          </div>
        </section>
      )}
    </section>
  )
}
