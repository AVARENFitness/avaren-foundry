import { Package } from 'lucide-react'
import { useEffect, useState } from 'react'
import { coachBackend } from '../lib/coachBackend'
import {
  emptySessionPackage,
  formatPackageDate,
  normalizeSessionPackage,
} from '../lib/sessionPackages'

const ICON = { size: 18, strokeWidth: 1.75 }

export default function AthleteSessionPackageCard() {
  const [pkg, setPkg] = useState(emptySessionPackage())
  const [loading, setLoading] = useState(true)
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    let active = true
    setLoading(true)

    coachBackend
      .getAthleteSessionPackage()
      .then((row) => {
        if (!active) return
        const normalized = normalizeSessionPackage(row)
        setPkg(normalized)
        setVisible(normalized.totalSessions > 0)
      })
      .catch(() => {
        if (active) {
          setPkg(emptySessionPackage())
          setVisible(false)
        }
      })
      .finally(() => {
        if (active) setLoading(false)
      })

    return () => {
      active = false
    }
  }, [])

  if (loading || !visible) return null

  return (
    <section className="athlete-session-package-card" aria-label="Session package">
      <header>
        <span className="coach-profile-card-icon" aria-hidden="true">
          <Package {...ICON} />
        </span>
        <div>
          <span className="eyebrow">SESSION PACKAGE</span>
          <h2>{pkg.sessionsRemaining} sessions remaining</h2>
        </div>
      </header>
      <p>
        {pkg.sessionsUsed} of {pkg.totalSessions} used
      </p>
      <div className="athlete-session-package-meta">
        {pkg.purchasedAt && (
          <span>Purchased {formatPackageDate(pkg.purchasedAt)}</span>
        )}
        {pkg.expiresAt && (
          <span>Expires {formatPackageDate(pkg.expiresAt)}</span>
        )}
      </div>
    </section>
  )
}
