import { ChevronRight } from 'lucide-react'
import { CLIENT_ROSTER_STATUS } from '../../lib/clientIntelligence'

const ICON = { size: 18, strokeWidth: 1.75 }

const statusClass = (status) => {
  switch (status) {
    case CLIENT_ROSTER_STATUS.ON_TRACK:
      return 'status-on-track'
    case CLIENT_ROSTER_STATUS.NEEDS_ATTENTION:
      return 'status-attention'
    case CLIENT_ROSTER_STATUS.RECOVERY_PRIORITY:
      return 'status-recovery'
    case CLIENT_ROSTER_STATUS.INACTIVE:
      return 'status-inactive'
    case CLIENT_ROSTER_STATUS.NEW_CLIENT:
      return 'status-new'
    default:
      return ''
  }
}

export default function CoachClientCard({ entry, onSelect }) {
  const {
    client,
    clientName,
    status,
    card,
    attentionCount,
  } = entry

  const detailLine = card.lastWorkoutLabel
    ? `Last trained ${card.lastWorkoutLabel.toLowerCase()}`
    : card.workoutsThisWeek
      ? `${card.workoutsThisWeek} workout${card.workoutsThisWeek === 1 ? '' : 's'} this week`
      : 'No recent training logged'

  return (
    <button
      type="button"
      className="coach-command-client-card coach-command-client-card--compact"
      onClick={() => onSelect?.(client)}
    >
      <div className="coach-command-client-card-top">
        <div className="coach-command-client-card-heading">
          <strong>{clientName}</strong>
          {attentionCount > 0 ? (
            <span className={`coach-command-status ${statusClass(status)}`}>
              Needs attention
            </span>
          ) : null}
        </div>
        {attentionCount > 0 && (
          <span className="coach-command-attention-dot" aria-label="Needs attention">
            {attentionCount}
          </span>
        )}
      </div>

      <div className="coach-command-client-card-body">
        <span>{detailLine}</span>
      </div>

      <div className="coach-command-client-card-footer">
        <span>View client</span>
        <ChevronRight {...ICON} />
      </div>
    </button>
  )
}
