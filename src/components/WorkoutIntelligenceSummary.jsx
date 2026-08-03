import {
  Activity,
  Award,
  BarChart3,
  Clock3,
  Dumbbell,
  Gauge,
} from 'lucide-react'

const sessionDuration = (session) => {
  if (!session?.startedAt || !session?.finishedAt) return null
  const minutes = Math.max(
    1,
    Math.round(
      (new Date(session.finishedAt) - new Date(session.startedAt)) / 60000,
    ),
  )
  return minutes
}

const exerciseGroups = (session) => {
  const grouped = {}

  ;(session?.sets ?? []).forEach((set) => {
    grouped[set.exercise] ??= {
      exercise: set.exercise,
      muscle: set.muscle,
      sets: 0,
      volume: 0,
      bestE1RM: 0,
    }

    grouped[set.exercise].sets += 1
    grouped[set.exercise].volume +=
      Number(set.weight || 0) * Number(set.reps || 0)
    grouped[set.exercise].bestE1RM = Math.max(
      grouped[set.exercise].bestE1RM,
      Number(set.estimatedOneRepMax || 0),
    )
  })

  return Object.values(grouped)
}

export default function WorkoutIntelligenceSummary({
  session,
  recentPrs = [],
}) {
  const groups = exerciseGroups(session)
  const volume = (session?.sets ?? []).reduce(
    (sum, set) =>
      sum + Number(set.weight || 0) * Number(set.reps || 0),
    0,
  )
  const duration = sessionDuration(session)
  const muscles = [
    ...new Set(
      (session?.sets ?? [])
        .map((set) => set.muscle)
        .filter(Boolean),
    ),
  ]

  const strongest =
    [...groups].sort((a, b) => {
      if (b.bestE1RM !== a.bestE1RM) return b.bestE1RM - a.bestE1RM
      return b.volume - a.volume
    })[0] ?? null

  return (
    <section className="workout-intelligence">
      <header>
        <span className="eyebrow">WORKOUT INTELLIGENCE</span>
        <h2>Today’s Training Summary</h2>
        <p>
          A clean look at what you accomplished—nothing extra during the workout.
        </p>
      </header>

      <div className="intelligence-metric-grid">
        <article>
          <BarChart3 />
          <span>Volume</span>
          <strong>{Math.round(volume).toLocaleString()} lb</strong>
        </article>

        <article>
          <Dumbbell />
          <span>Sets Logged</span>
          <strong>{session?.sets?.length ?? 0}</strong>
        </article>

        <article>
          <Clock3 />
          <span>Duration</span>
          <strong>{duration ? `${duration} min` : '—'}</strong>
        </article>

        <article>
          <Award />
          <span>PRs</span>
          <strong>{recentPrs.length}</strong>
        </article>
      </div>

      <div className="intelligence-detail-list">
        <article>
          <div className="intelligence-detail-icon">
            <Activity size={18} />
          </div>
          <div>
            <span>Muscles Trained</span>
            <strong>
              {muscles.length ? muscles.join(' · ') : 'No muscle data'}
            </strong>
          </div>
        </article>

        <article>
          <div className="intelligence-detail-icon">
            <Gauge size={18} />
          </div>
          <div>
            <span>Strongest Exercise</span>
            <strong>{strongest?.exercise ?? '—'}</strong>
            {strongest && (
              <small>
                {strongest.bestE1RM
                  ? `Best estimated 1RM · ${Math.round(strongest.bestE1RM)} lb`
                  : `${Math.round(strongest.volume).toLocaleString()} lb volume`}
              </small>
            )}
          </div>
        </article>
      </div>

      {recentPrs.length > 0 && (
        <div className="intelligence-prs">
          <span className="eyebrow">PERSONAL RECORDS</span>
          {recentPrs.slice(0, 3).map((pr) => (
            <article key={pr.id}>
              <Award size={16} />
              <div>
                <strong>{pr.exercise}</strong>
                <span>{pr.type}</span>
              </div>
              <strong>{pr.value}</strong>
            </article>
          ))}
        </div>
      )}
    </section>
  )
}
