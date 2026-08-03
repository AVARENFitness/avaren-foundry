import { ArrowLeft, ChevronDown, Trash2 } from 'lucide-react'
import { useState } from 'react'
import { sessionVolume } from '../lib/metrics'

const durationMinutes = (session) => {
  if (!session.startedAt || !session.finishedAt) return null
  return Math.max(
    1,
    Math.round(
      (new Date(session.finishedAt) - new Date(session.startedAt)) / 60000,
    ),
  )
}

export default function HistoryScreen({
  history,
  onClose,
  onDelete,
}) {
  const [openId, setOpenId] = useState(null)

  return (
    <section className="history-screen">
      <header className="builder-header">
        <button className="builder-back" onClick={onClose}>
          <ArrowLeft size={18} /> Back
        </button>
        <div>
          <span className="eyebrow">TRAINING JOURNAL</span>
          <h1>Workout History</h1>
        </div>
      </header>

      {!history.length && (
        <section className="empty-state">
          <h2>No completed workouts yet.</h2>
          <p>Your finished sessions will appear here automatically.</p>
        </section>
      )}

      <div className="history-journal">
        {[...history].reverse().map((session) => {
          const open = openId === session.id
          const grouped = session.sets.reduce((result, set) => {
            result[set.exercise] ??= []
            result[set.exercise].push(set)
            return result
          }, {})
          const minutes = durationMinutes(session)

          return (
            <article className="history-entry" key={session.id}>
              <button
                className="history-entry-head"
                onClick={() => setOpenId(open ? null : session.id)}
              >
                <div>
                  <span>{session.date}</span>
                  <h2>{session.name}</h2>
                  <p>
                    {session.sets.length} sets ·{' '}
                    {sessionVolume(session).toLocaleString()} lb
                    {minutes ? ` · ${minutes} min` : ''}
                  </p>
                </div>
                <ChevronDown className={open ? 'open' : ''} />
              </button>

              {open && (
                <div className="history-entry-body">
                  {Object.entries(grouped).map(([exercise, sets]) => (
                    <section key={exercise}>
                      <strong>{exercise}</strong>
                      <div>
                        {sets.map((set, index) => (
                          <span key={`${exercise}-${index}`}>
                            {set.weight} × {set.reps}
                            <small>{set.type}</small>
                          </span>
                        ))}
                      </div>
                    </section>
                  ))}

                  <button
                    className="history-delete"
                    onClick={() => {
                      if (confirm('Delete this completed workout?')) {
                        onDelete(session.id)
                      }
                    }}
                  >
                    <Trash2 size={16} /> Delete workout
                  </button>
                </div>
              )}
            </article>
          )
        })}
      </div>
    </section>
  )
}
