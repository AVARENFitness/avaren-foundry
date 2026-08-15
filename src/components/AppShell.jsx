import {
  Bell,
  CalendarDays,
  Dumbbell,
  Home,
  LineChart,
  UtensilsCrossed,
} from 'lucide-react'

const tabs = [
  { id: 'home', label: 'Home', Icon: Home },
  { id: 'train', label: 'Train', Icon: Dumbbell },
  { id: 'nutrition', label: 'Food', Icon: UtensilsCrossed },
  { id: 'schedule', label: 'Schedule', Icon: CalendarDays },
  { id: 'progress', label: 'Progress', Icon: LineChart },
]

const isTabActive = (screen, tabId) =>
  screen === tabId ||
  (tabId === 'schedule' && screen === 'in-person-schedule')

export default function AppShell({
  screen,
  setScreen,
  children,
  activeWorkout,
  transitioning,
  immersive = false,
  notificationCount = 0,
  onOpenNotifications,
  onOpenAccount,
  accountLabel = 'Account',
  accountInitial = 'A',
}) {
  return (
    <div
      className={`app-shell ${transitioning ? 'is-transitioning' : ''} ${immersive ? 'is-immersive' : ''}`}
    >
      <header className="app-header">
        <div className="brand-lockup foundation-lockup">
          <img
            className="foundation-header-mark"
            src="/brand/foundation/icon-96.png"
            alt=""
            aria-hidden="true"
          />
          <div>
            <div className="brand-overline">AVAREN</div>
            <div className="brand-title">THE FOUNDRY</div>
            <div className="brand-subtitle">Strength, refined.</div>
          </div>
        </div>

        <div className="app-header-actions">
          <button
            className="app-notification-button"
            onClick={onOpenNotifications}
            aria-label={`Notifications${notificationCount ? `, ${notificationCount} unread` : ''}`}
          >
            <Bell size={19} />
            {notificationCount > 0 && (
              <span>{notificationCount > 99 ? '99+' : notificationCount}</span>
            )}
          </button>

          <button
            type="button"
            className={`app-profile-button${screen === 'more' ? ' active' : ''}`}
            onClick={onOpenAccount}
            aria-label={accountLabel}
            data-testid="app-profile-button"
          >
            <span aria-hidden="true">{accountInitial}</span>
          </button>

          <div className={`status-pill ${activeWorkout ? 'active' : ''}`}>
            <span />
            {activeWorkout ? 'ACTIVE' : 'READY'}
          </div>
        </div>
      </header>

      <div className="screen-stage">
        <main className="screen">{children}</main>
      </div>

      {!immersive && (
        <nav className="bottom-nav" aria-label="Primary">
          {tabs.map(({ id, label, Icon }) => (
            <button
              key={id}
              className={isTabActive(screen, id) ? 'active' : ''}
              onClick={() => setScreen(id)}
            >
              <Icon size={21} strokeWidth={1.65} />
              <span>{label}</span>
            </button>
          ))}
        </nav>
      )}
    </div>
  )
}
