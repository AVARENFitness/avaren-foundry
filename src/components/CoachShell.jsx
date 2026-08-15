import { useEffect, useRef } from 'react'
import {
  CalendarDays,
  ClipboardList,
  CalendarRange,
  LogOut,
  Settings2,
  Users,
} from 'lucide-react'

const tabs = [
  {
    id: 'clients',
    label: 'Clients',
    Icon: Users,
  },
  {
    id: 'calendar',
    label: 'Calendar',
    Icon: CalendarDays,
  },
  {
    id: 'assignments',
    label: 'Assignments',
    Icon: ClipboardList,
  },
  {
    id: 'programs',
    label: 'Programs',
    Icon: CalendarRange,
  },
  {
    id: 'settings',
    label: 'Coach',
    Icon: Settings2,
  },
]

export default function CoachShell({
  screen,
  setScreen,
  onNavigate,
  children,
  coachName,
  onExit,
  profileMode = false,
}) {
  const mainRef = useRef(null)

  useEffect(() => {
    document.body.classList.add('coach-mode-active')
    document.documentElement.classList.add('coach-mode-active')
    window.scrollTo({ top: 0, left: 0, behavior: 'auto' })

    return () => {
      document.body.classList.remove('coach-mode-active')
      document.documentElement.classList.remove('coach-mode-active')
    }
  }, [])

  useEffect(() => {
    window.scrollTo({ top: 0, left: 0, behavior: 'auto' })
    mainRef.current?.scrollTo?.({ top: 0, left: 0, behavior: 'auto' })
  }, [screen, profileMode])

  return (
    <div className={`coach-shell${profileMode ? ' coach-shell--profile' : ''}`}>
      {!profileMode && (
        <header className="coach-shell-header">
          <div>
            <span className="eyebrow">
              AVAREN COACH
            </span>
            <strong>{coachName}</strong>
          </div>

          <button type="button" onClick={onExit}>
            <LogOut size={16} />
            Athlete App
          </button>
        </header>
      )}

      <main ref={mainRef} className="coach-shell-main">
        {children}
      </main>

      {!profileMode && (
        <nav className="coach-shell-nav">
          {tabs.map(
            ({ id, label, Icon }) => (
              <button
                key={id}
                type="button"
                className={
                  screen === id
                    ? 'active'
                    : ''
                }
                onClick={() => {
                  onNavigate?.(id)
                  setScreen(id)
                }}
              >
                <Icon size={20} />
                <span>{label}</span>
              </button>
            ),
          )}
        </nav>
      )}
    </div>
  )
}
