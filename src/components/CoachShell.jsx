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

          <button onClick={onExit}>
            <LogOut size={16} />
            Athlete App
          </button>
        </header>
      )}

      <main className="coach-shell-main">
        {children}
      </main>

      {!profileMode && (
        <nav className="coach-shell-nav">
          {tabs.map(
            ({ id, label, Icon }) => (
              <button
                key={id}
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
