import { ChevronRight } from 'lucide-react'
import { buildRosterRowMeta, getClientInitials } from '../../lib/coachClientRosterUi'

const ICON = { size: 16, strokeWidth: 1.75 }

export default function CoachClientCard({
  entry,
  onSelect,
  nextSession = null,
  passSummary = null,
}) {
  const { client, clientName } = entry
  const meta = buildRosterRowMeta(entry, { nextSession, passSummary })

  return (
    <button
      type="button"
      className="coach-roster-row"
      data-attention={meta.attentionLabel ? 'true' : 'false'}
      data-pass-low={meta.passIsLow ? 'true' : 'false'}
      data-pass-empty={meta.passIsEmpty ? 'true' : 'false'}
      aria-label={`Open ${clientName}`}
      onClick={() => onSelect?.(client)}
    >
      <span className="coach-roster-row-avatar" aria-hidden="true">
        {getClientInitials(clientName)}
      </span>

      <span className="coach-roster-row-body">
        <span className="coach-roster-row-primary">
          <strong>{clientName}</strong>
          {meta.connectionHint ? (
            <span className="coach-roster-row-connection">{meta.connectionHint}</span>
          ) : null}
        </span>
        <span className="coach-roster-row-secondary">{meta.secondaryLine}</span>
      </span>

      <ChevronRight {...ICON} className="coach-roster-row-chevron" aria-hidden="true" />
    </button>
  )
}
