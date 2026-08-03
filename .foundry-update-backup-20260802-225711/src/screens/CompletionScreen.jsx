import { ArrowRight, Check, Trophy } from 'lucide-react'
import { sessionVolume } from '../lib/metrics'

export default function CompletionScreen({ session, nextWorkout, onDone, recentPrs = [] }) {
  if (!session) return null

  const volume = sessionVolume(session)
  const bestSet = session.sets.reduce(
    (best, set) => (set.weight > (best?.weight ?? -1) ? set : best),
    null,
  )

  return (
    <section className="completion-screen">
      <div className="completion-seal">
        <div className="completion-ring one" />
        <div className="completion-ring two" />
        <Check size={30} />
      </div>
      <span className="eyebrow">AVAREN · THE FOUNDRY</span>
      <h1>Forged.</h1>
      <p>{session.name} complete.</p>

      <div className="completion-metrics">
        <div><span>Sets</span><strong>{session.sets.length}</strong></div>
        <div><span>Volume</span><strong>{volume.toLocaleString()} lb</strong></div>
      </div>

      {bestSet && (
        <div className="completion-highlight">
          <Trophy size={19} />
          <div>
            <span>Strongest set</span>
            <strong>{bestSet.exercise} · {bestSet.weight} × {bestSet.reps}</strong>
          </div>
        </div>
      )}

      {recentPrs.length > 0 && (
        <div className="completion-prs">
          <span className="eyebrow">NEW PERSONAL RECORDS</span>
          {recentPrs.slice(0, 3).map((pr) => (
            <div key={pr.id}>
              <strong>{pr.exercise}</strong>
              <span>{pr.type} · {pr.value}</span>
            </div>
          ))}
        </div>
      )}

      <div className="next-workout-card">
        <span>Next workout</span>
        <strong>{nextWorkout}</strong>
      </div>

      <button className="gold-button machined" onClick={onDone}>
        Done <ArrowRight size={18} />
      </button>
    </section>
  )
}
