import { ChevronRight } from 'lucide-react'
import { exerciseProfile } from '../lib/metrics'

export default function ExerciseProfile({ history, exercise }) {
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
        <div><span>Best e1RM</span><strong>{profile.bestE1RM ? `${Math.round(profile.bestE1RM)} lb` : '—'}</strong></div>
        <div><span>Sessions</span><strong>{profile.sessionCount}</strong></div>
        <div><span>Lifetime Volume</span><strong>{Math.round(profile.lifetimeVolume).toLocaleString()}</strong></div>
      </div>

      <div className="profile-replay">
        <h3>Recent sessions</h3>
        {!recent.length && <p>No sessions recorded yet.</p>}
        {recent.map((session) => (
          <article key={session.id}>
            <div>
              <strong>{session.date}</strong>
              <span>{session.sets.length} sets · {session.volume.toLocaleString()} lb</span>
            </div>
            <div className="profile-session-sets">
              {session.sets.map((set, index) => (
                <span key={`${session.id}-${index}`}>
                  {set.weight} × {set.reps}
                </span>
              ))}
            </div>
            <ChevronRight size={17} />
          </article>
        ))}
      </div>
    </section>
  )
}
