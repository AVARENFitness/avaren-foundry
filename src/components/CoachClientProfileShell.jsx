import { ArrowLeft } from 'lucide-react'

export const CLIENT_PROFILE_SECTIONS = [
  { id: 'overview', label: 'Overview' },
  { id: 'sessions', label: 'Sessions' },
  { id: 'training', label: 'Training' },
  { id: 'notes', label: 'Notes' },
  { id: 'progress', label: 'Progress' },
]

const ICON = { size: 18, strokeWidth: 1.75 }

export default function CoachClientProfileShell({
  clientName,
  clientEmail,
  profileStatusLine = '',
  connectionDetail = '',
  connectedSince = '',
  activeSection = 'overview',
  onSectionChange,
  onBack,
  coachingStatusPanel = null,
  children,
}) {
  const statusLine = profileStatusLine || connectedSince

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
          {clientEmail ? <p>{clientEmail}</p> : null}
          {statusLine ? <small>{statusLine}</small> : null}
          {connectionDetail ? <small>{connectionDetail}</small> : null}
        </div>

        {coachingStatusPanel ? (
          <div className="coach-client-profile-status-stack coach-client-profile-status-stack--compact">
            {coachingStatusPanel}
          </div>
        ) : null}

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
