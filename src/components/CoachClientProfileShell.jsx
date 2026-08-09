import { ArrowLeft } from 'lucide-react'

export const CLIENT_PROFILE_SECTIONS = [
  { id: 'today', label: 'Today' },
  { id: 'training', label: 'Training' },
  { id: 'business', label: 'Business' },
  { id: 'notes', label: 'Notes' },
  { id: 'progress', label: 'Progress' },
]

const ICON = { size: 18, strokeWidth: 1.75 }

export default function CoachClientProfileShell({
  clientName,
  clientEmail,
  connectedSince,
  activeSection = 'today',
  onSectionChange,
  onBack,
  weeklyReviewAction = null,
  weeklyCheckInPanel = null,
  children,
}) {
  return (
    <div className="coach-client-profile-shell">
      <header className="coach-client-profile-shell-header">
        <button type="button" className="coach-back-link" onClick={onBack}>
          <ArrowLeft {...ICON} />
          Back to clients
        </button>

        <div className="coach-client-profile-header">
          <span className="eyebrow">CLIENT PROFILE</span>
          <h1>{clientName}</h1>
          <p>{clientEmail}</p>
          {connectedSince && <small>{connectedSince}</small>}
        </div>

        <div className="coach-client-profile-status-stack">
          {weeklyCheckInPanel}
          {weeklyReviewAction}
        </div>

        <nav
          className="coach-client-profile-section-nav"
          aria-label="Client profile sections"
        >
          {CLIENT_PROFILE_SECTIONS.map(({ id, label }) => (
            <button
              key={id}
              type="button"
              className={
                activeSection === id ? 'active' : ''
              }
              aria-current={
                activeSection === id ? 'page' : undefined
              }
              onClick={() => onSectionChange?.(id)}
            >
              {label}
            </button>
          ))}
        </nav>
      </header>

      <div className="coach-client-profile-shell-body">
        {children}
      </div>
    </div>
  )
}
