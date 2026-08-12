import { Package } from 'lucide-react'
import { useEffect, useState } from 'react'
import { coachBackend } from '../lib/coachBackend'
import { formatPackageDate } from '../lib/sessionPackages'
import {
  normalizeAthletePassHistory,
  normalizeAthletePassSummary,
  summarizeClientPasses,
} from '../lib/coachPass'

const ICON = { size: 18, strokeWidth: 1.75 }

export default function AthleteSessionPackageCard() {
  const [passes, setPasses] = useState([])
  const [history, setHistory] = useState([])
  const [loading, setLoading] = useState(true)
  const [showHistory, setShowHistory] = useState(false)

  useEffect(() => {
    let active = true
    setLoading(true)

    Promise.all([
      coachBackend.getAthleteTrainingPassSummary(),
      coachBackend.listAthletePassUsageHistory(20),
    ])
      .then(([summaryRows, historyRows]) => {
        if (!active) return
        setPasses(normalizeAthletePassSummary(summaryRows))
        setHistory(normalizeAthletePassHistory(historyRows))
      })
      .catch(() => {
        if (active) {
          setPasses([])
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

  const summary = summarizeClientPasses(
    passes.map((pass) => ({
      ...pass,
      sessionsPurchased: pass.balance,
    })),
  )

  if (loading || summary.totalBalance <= 0) return null

  const primary = summary.primaryPass ?? passes[0]

  return (
    <section className="athlete-session-package-card" aria-label="Training pass">
      <header>
        <span className="coach-profile-card-icon" aria-hidden="true">
          <Package {...ICON} />
        </span>
        <div>
          <span className="eyebrow">TRAINING PASS</span>
          <h2>{summary.totalBalance} sessions remaining</h2>
        </div>
      </header>
      <p>{primary?.name ?? 'Training pass'}</p>
      <div className="athlete-session-package-meta">
        {primary?.startsAt && (
          <span>Started {formatPackageDate(primary.startsAt)}</span>
        )}
        {primary?.expiresAt && (
          <span>Expires {formatPackageDate(primary.expiresAt)}</span>
        )}
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
