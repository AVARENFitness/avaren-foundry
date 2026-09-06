import { Package } from 'lucide-react'
import { useEffect, useState } from 'react'
import { coachBackend } from '../lib/coachBackend'
import { buildAthletePassStatus } from '../lib/athletePassStatus'
import { normalizeAthletePassHistory } from '../lib/coachPass'
import { formatPackageDate } from '../lib/sessionPackages'

const ICON = { size: 18, strokeWidth: 1.75 }

export default function AthleteSessionPackageCard() {
  const [status, setStatus] = useState(null)
  const [loading, setLoading] = useState(true)
  const [showHistory, setShowHistory] = useState(false)
  const [history, setHistory] = useState([])

  useEffect(() => {
    let active = true
    setLoading(true)

    Promise.all([
      coachBackend.getAthleteTrainingPassSummary(),
      coachBackend.listAthletePassUsageHistory(20),
    ])
      .then(([summaryRows, historyRows]) => {
        if (!active) return
        setStatus(buildAthletePassStatus({ summaryRows, historyRows }))
        setHistory(normalizeAthletePassHistory(historyRows))
      })
      .catch(() => {
        if (active) {
          setStatus(null)
          setHistory([])
        }
      })
      .finally(() => {
        if (active) setLoading(false)
      })

    return () => {
      active = false
    }
  }, [])

  if (loading || !status?.visible || !status.primary) return null

  const primary = status.primary

  return (
    <section className="athlete-session-package-card" aria-label="Training pass">
      <header>
        <span className="coach-profile-card-icon" aria-hidden="true">
          <Package {...ICON} />
        </span>
        <div>
          <span className="eyebrow">TRAINING PASS</span>
          <h2>{primary.remaining} sessions remaining</h2>
        </div>
      </header>
      <p>{primary.usageLabel}</p>
      {primary.primaryPassName ? <p>{primary.primaryPassName}</p> : null}
      <div className="athlete-session-package-meta">
        {primary.lastPurchaseAt ? (
          <span>Last added {formatPackageDate(primary.lastPurchaseAt)}</span>
        ) : null}
      </div>
      {history.length > 0 ? (
        <button
          type="button"
          className="coach-secondary-button athlete-session-package-history-toggle"
          onClick={() => setShowHistory((current) => !current)}
        >
          {showHistory ? 'Hide usage' : 'View usage'}
        </button>
      ) : null}
      {showHistory ? (
        <ul className="athlete-session-package-history">
          {history.map((entry, index) => (
            <li key={`${entry.occurredAt}-${index}`}>
              <strong>{entry.label}</strong>
              <span>
                {entry.quantity > 0 ? '+' : ''}
                {entry.quantity}
              </span>
            </li>
          ))}
        </ul>
      ) : null}
    </section>
  )
}
