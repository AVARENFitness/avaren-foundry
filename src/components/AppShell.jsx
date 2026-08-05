import { Bell, Dumbbell, Home, LineChart, UserRound, Utensils } from 'lucide-react'

const tabs = [
  { id: 'home', label: 'Home', Icon: Home },
  { id: 'train', label: 'Train', Icon: Dumbbell },
  { id: 'nutrition', label: 'Nutrition', Icon: Utensils },
  { id: 'progress', label: 'Progress', Icon: LineChart },
  { id: 'more', label: 'Account', Icon: UserRound },
]

export default function AppShell({
  screen,
  setScreen,
  children,
  activeWorkout,
  transitioning,
  notificationCount = 0,
  onOpenNotifications,
}) {
  return (
    <div className={`app-shell ${transitioning ? 'is-transitioning' : ''}`}>
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

          <div className={`status-pill ${activeWorkout ? 'active' : ''}`}>
            <span />
            {activeWorkout ? 'ACTIVE' : 'READY'}
          </div>
        </div>
      </header>

      <div className="screen-stage">
        <main className="screen">{children}</main>
      </div>

      <nav className="bottom-nav">
        {tabs.map(({ id, label, Icon }) => (
          <button
            key={id}
            className={screen === id ? 'active' : ''}
            onClick={() => setScreen(id)}
          >
            <Icon size={21} strokeWidth={1.65} />
            <span>{label}</span>
          </button>
        ))}
      </nav>
    </div>
  )
}
