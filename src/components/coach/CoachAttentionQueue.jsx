import { ArrowUpRight } from 'lucide-react'

export default function CoachAttentionQueue({
  items = [],
  totalCount = 0,
  onViewClient,
  onViewAll,
  onLeadFollowUp = null,
  leadFollowUpCount = 0,
}) {
  const visible = items.slice(0, 5)

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

      {leadFollowUpCount > 0 && onLeadFollowUp ? (
        <button
          type="button"
          className="coach-command-attention-item severity-watch coach-leads-attention-row"
          onClick={onLeadFollowUp}
        >
          <div>
            <strong>{leadFollowUpCount} lead follow-up{leadFollowUpCount === 1 ? '' : 's'} due</strong>
            <p>Review prospects waiting on your next step.</p>
          </div>
          <span className="coach-secondary-button coach-command-inline-action">
            Open leads
            <ArrowUpRight size={16} />
          </span>
        </button>
      ) : null}

      {visible.length ? (
        <div className="coach-command-attention-list">
          {visible.map((entry) => (
            <article
              key={`${entry.client?.athlete_id ?? entry.client?.id}-${entry.item.id}`}
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
                {entry.actionLabel ?? 'Open client'}
                <ArrowUpRight size={16} />
              </button>
            </article>
          ))}
        </div>
      ) : (
        <div className="coach-command-empty-copy">
          <strong>You&apos;re caught up</strong>
          <span>No clients need attention right now.</span>
        </div>
      )}
    </section>
  )
}
