import { Ticket } from 'lucide-react'
import { useAthletePassStatus } from '../hooks/useAthletePassStatus'
import {
  formatAthletePassRemainingLabel,
} from '../lib/athletePassStatus'
import { formatPackageDate } from '../lib/sessionPackages'

const ICON = { size: 16, strokeWidth: 1.75 }

function PassGroupBlock({ group, variant }) {
  const remainingLabel = formatAthletePassRemainingLabel(group.remaining)
  const lowClass = group.isLow ? ' athlete-pass-status--low' : ''

  if (variant === 'compact') {
    return (
      <div
        className={`athlete-pass-status-group athlete-pass-status-group--compact${lowClass}`}
      >
        <div className="athlete-pass-status-copy">
          <span className="eyebrow">Session passes</span>
          <strong>{remainingLabel}</strong>
        </div>
        {group.effectiveTotal > 0 ? (
          <span className="athlete-pass-status-meta">{group.usageLabel}</span>
        ) : null}
      </div>
    )
  }

  return (
    <div
      className={`athlete-pass-status-group athlete-pass-status-group--detailed${lowClass}`}
    >
      <div className="athlete-pass-status-copy">
        <span className="eyebrow">Session passes</span>
        <strong>{remainingLabel}</strong>
        <p>{group.usageLabel}</p>
      </div>
      {group.lastPurchaseAt ? (
        <span className="athlete-pass-status-meta">
          Last added {formatPackageDate(group.lastPurchaseAt)}
        </span>
      ) : null}
      {group.primaryPassName ? (
        <span className="athlete-pass-status-meta">{group.primaryPassName}</span>
      ) : null}
    </div>
  )
}

/**
 * Athlete-facing pass status from canonical RPC + funding display helper.
 * @param {'compact' | 'detailed'} variant
 */
export default function AthletePassStatus({ variant = 'compact' }) {
  const { status, loading } = useAthletePassStatus()

  if (loading || !status?.visible || !status.primary) return null

  return (
    <section
      className={`athlete-pass-status athlete-pass-status--${variant}`}
      aria-label="Session passes"
    >
      {variant === 'detailed' ? (
        <header className="athlete-pass-status-header">
          <span className="athlete-pass-status-icon" aria-hidden="true">
            <Ticket {...ICON} />
          </span>
          <span className="eyebrow">TRAINING PASS</span>
        </header>
      ) : null}

      {status.groups.map((group, index) => (
        <PassGroupBlock
          key={group.businessClientId ?? `pass-group-${index}`}
          group={group}
          variant={variant}
        />
      ))}

      {status.multipleRelationships ? (
        <p className="athlete-pass-status-note">
          Passes are shown per coaching relationship and are not combined.
        </p>
      ) : null}
    </section>
  )
}
