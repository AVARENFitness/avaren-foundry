import { ChevronRight, Sparkles, Trophy } from 'lucide-react'
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
  const { client, clientName, status, card, attentionCount, hasWin, winLabel } =
    entry

  return (
    <button
      type="button"
      className="coach-command-client-card"
      onClick={() => onSelect?.(client)}
    >
      <div className="coach-command-client-card-top">
        <div className="coach-client-avatar">{clientName.charAt(0)}</div>
        <div className="coach-command-client-card-heading">
          <strong>{clientName}</strong>
          <span className={`coach-command-status ${statusClass(status)}`}>
            {status}
          </span>
        </div>
        {attentionCount > 0 && (
          <span className="coach-command-attention-dot" aria-label="Needs attention">
            {attentionCount}
          </span>
        )}
      </div>

      <div className="coach-command-client-card-body">
        <span>
          {card.workoutsThisWeek
            ? `${card.workoutsThisWeek} workout${card.workoutsThisWeek === 1 ? '' : 's'} this week`
            : 'No workouts this week'}
        </span>
        {card.lastWorkoutLabel && (
          <span>Last trained {card.lastWorkoutLabel.toLowerCase()}</span>
        )}
        {card.readinessLabel && <span>Readiness {card.readinessLabel}</span>}
        {card.assignmentLabel && (
          <span>
            {card.activeAssignmentTitle
              ? `${card.assignmentLabel} · ${card.activeAssignmentTitle}`
              : card.assignmentLabel}
          </span>
        )}
      </div>

      <div className="coach-command-client-card-footer">
        {hasWin ? (
          <span className="coach-command-win-badge">
            <Trophy size={14} />
            {winLabel}
          </span>
        ) : (
          <span className="coach-command-win-badge muted">
            <Sparkles size={14} />
            View client
          </span>
        )}
        <ChevronRight {...ICON} />
      </div>
    </button>
  )
}
