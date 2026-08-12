import { ArrowUpRight } from 'lucide-react'

export default function CoachAttentionQueue({
  items = [],
  totalCount = 0,
  onViewClient,
  onViewAll,
}) {
  const visible = items.slice(0, 3)

  return (
    <section className="coach-command-panel coach-command-attention">
      <header className="coach-command-panel-header">
        <div>
          <span className="eyebrow">NEEDS ATTENTION</span>
          <h2>Needs Attention</h2>
        </div>
        {totalCount > visible.length && (
          <button
            type="button"
            className="coach-secondary-button coach-command-inline-action"
            onClick={onViewAll}
          >
            View All
            <ArrowUpRight size={16} />
          </button>
        )}
      </header>

      {visible.length ? (
        <div className="coach-command-attention-list">
          {visible.map((entry) => (
            <article
              key={`${entry.client.athlete_id}-${entry.item.id}`}
              className={`coach-command-attention-item severity-${entry.item.severity}`}
            >
              <div>
                <strong>{entry.clientName}</strong>
                <p>{entry.item.description}</p>
              </div>
              <button
                type="button"
                className="coach-secondary-button coach-command-inline-action"
                onClick={() => onViewClient?.(entry.client)}
              >
                {entry.actionLabel}
                <ArrowUpRight size={16} />
              </button>
            </article>
          ))}
        </div>
      ) : (
        <div className="coach-command-empty-copy">
          <strong>All caught up</strong>
          <span>No clients need attention right now.</span>
        </div>
      )}
    </section>
  )
}
