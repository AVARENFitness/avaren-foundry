import { ArrowLeft, ChevronDown } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'

export const CLIENT_PROFILE_SECTIONS = [
  { id: 'overview', label: 'Coaching' },
  { id: 'sessions', label: 'Sessions' },
  { id: 'training', label: 'Training' },
  { id: 'notes', label: 'Notes' },
  { id: 'progress', label: 'Progress' },
  { id: 'documents', label: 'Documents' },
  { id: 'manage', label: 'Manage' },
]

const PRIMARY_SECTION_IDS = new Set([
  'overview',
  'sessions',
  'training',
  'notes',
])

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
  const [moreOpen, setMoreOpen] = useState(false)
  const statusLine = profileStatusLine || connectedSince
  const primarySections = useMemo(
    () =>
      CLIENT_PROFILE_SECTIONS.filter((section) =>
        PRIMARY_SECTION_IDS.has(section.id),
      ),
    [],
  )
  const secondarySections = useMemo(
    () =>
      CLIENT_PROFILE_SECTIONS.filter(
        (section) => !PRIMARY_SECTION_IDS.has(section.id),
      ),
    [],
  )
  const secondaryActive = secondarySections.some(
    (section) => section.id === activeSection,
  )
  const showSecondary = moreOpen || secondaryActive

  useEffect(() => {
    if (!secondaryActive) setMoreOpen(false)
  }, [activeSection, secondaryActive])

  const selectSection = (id) => {
    onSectionChange?.(id)
    if (!PRIMARY_SECTION_IDS.has(id)) setMoreOpen(false)
  }

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
          {primarySections.map(({ id, label }) => (
            <button
              key={id}
              type="button"
              className={activeSection === id ? 'active' : ''}
              aria-current={activeSection === id ? 'page' : undefined}
              onClick={() => selectSection(id)}
            >
              {label}
            </button>
          ))}
          <button
            type="button"
            className={secondaryActive ? 'active' : ''}
            aria-expanded={showSecondary}
            onClick={() => setMoreOpen((current) => !current)}
          >
            More
            <ChevronDown
              size={14}
              aria-hidden="true"
              className={showSecondary ? 'rotated' : ''}
            />
          </button>
        </nav>

        {showSecondary ? (
          <div
            className="coach-client-profile-more-row"
            role="group"
            aria-label="More client profile sections"
          >
            {secondarySections.map(({ id, label }) => (
              <button
                key={id}
                type="button"
                className={activeSection === id ? 'active' : ''}
                aria-current={activeSection === id ? 'page' : undefined}
                onClick={() => selectSection(id)}
              >
                {label}
              </button>
            ))}
          </div>
        ) : null}
      </header>

      <div className="coach-client-profile-shell-body">
        {children}
      </div>
    </div>
  )
}
