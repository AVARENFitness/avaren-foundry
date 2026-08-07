import { Activity, ArrowUpRight, Trophy, UtensilsCrossed } from 'lucide-react'

const ICON = { size: 18, strokeWidth: 1.75 }

const eventIcon = (type) => {
  switch (type) {
    case 'pr':
      return Trophy
    case 'nutrition':
      return UtensilsCrossed
    default:
      return Activity
  }
}

export default function CoachActivityFeed({ events = [], onSelectClient }) {
  return (
    <section className="coach-command-panel">
      <header>
        <span className="eyebrow">TIMELINE</span>
        <h2>Recent Activity</h2>
      </header>

      {events.length ? (
        <div className="coach-command-activity-list">
          {events.map((event) => {
            const Icon = eventIcon(event.type)
            return (
              <article key={event.id} className="coach-command-activity-row">
                <span className="coach-profile-card-icon" aria-hidden="true">
                  <Icon {...ICON} />
                </span>
                <div>
                  <strong>{event.title}</strong>
                  <span>
                    {event.relativeLabel}
                    {event.subtitle ? ` · ${event.subtitle}` : ''}
                  </span>
                </div>
                {event.client && (
                  <button
                    type="button"
                    className="coach-secondary-button coach-command-inline-action"
                    onClick={() => onSelectClient?.(event.client)}
                  >
                    Open
                    <ArrowUpRight size={16} />
                  </button>
                )}
              </article>
            )
          })}
        </div>
      ) : (
        <div className="coach-command-empty-copy">
          <strong>No recent client activity.</strong>
          <span>Completed workouts and wins will appear here.</span>
        </div>
      )}
    </section>
  )
}
