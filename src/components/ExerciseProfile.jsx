import { ChevronRight } from 'lucide-react'
import { formatLegacyCompletedSetDisplay } from '../lib/exerciseLoad'
import { exerciseProfile } from '../lib/metrics'

export default function ExerciseProfile({
  history,
  exercise,
  onOpenSession,
}) {
  const profile = exerciseProfile(history, exercise)
  const recent = [...profile.sessions].reverse().slice(0, 6)

  return (
    <section className="exercise-profile-panel">
      <div className="profile-heading">
        <div>
          <span className="eyebrow">EXERCISE PROFILE</span>
          <h2>{exercise}</h2>
        </div>
      </div>

      <div className="profile-metric-grid">
        <div><span>Heaviest</span><strong>{profile.heaviest || '—'}{profile.heaviest ? ' lb' : ''}</strong></div>
        <div><span>Best</span><strong>{profile.provenBest || profile.bestE1RM ? `${Math.round(profile.provenBest || profile.bestE1RM)} lb` : '—'}</strong></div>
        <div><span>Current estimate</span><strong>{profile.currentEstimate ? `${Math.round(profile.currentEstimate)} lb` : '—'}</strong></div>
        <div><span>Sessions</span><strong>{profile.sessionCount}</strong></div>
        <div><span>Lifetime Volume</span><strong>{Math.round(profile.lifetimeVolume).toLocaleString()}</strong></div>
      </div>

      <div className="profile-replay">
        <h3>Recent sessions</h3>
        {!recent.length && <p>No sessions recorded yet.</p>}
        {recent.map((session) => {
          const fullSession =
            history.find((item) => item.id === session.id) ?? null
          const canOpen = Boolean(onOpenSession && fullSession?.id)

          const content = (
            <>
              <div>
                <strong>{session.date || 'Session'}</strong>
                <span>{session.sets.length} sets · {session.volume.toLocaleString()} lb</span>
              </div>
              <div className="profile-session-sets">
                {session.sets.map((set, index) => (
                  <span key={`${session.id}-${index}`}>
                    {formatLegacyCompletedSetDisplay(set)}
                  </span>
                ))}
              </div>
              {canOpen ? <ChevronRight size={17} /> : null}
            </>
          )

          if (!canOpen) {
            return (
              <article key={session.id}>
                {content}
              </article>
            )
          }

          return (
            <button
              key={session.id}
              type="button"
              className="profile-session-row"
              onClick={() => onOpenSession(fullSession)}
            >
              {content}
            </button>
          )
        })}
      </div>
    </section>
  )
}
