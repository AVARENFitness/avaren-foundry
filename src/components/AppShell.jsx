import { Dumbbell, Home, LineChart, MoreHorizontal } from 'lucide-react'

const tabs = [
  { id: 'home', label: 'Home', Icon: Home },
  { id: 'gym', label: 'Gym', Icon: Dumbbell },
  { id: 'progress', label: 'Progress', Icon: LineChart },
  { id: 'more', label: 'More', Icon: MoreHorizontal },
]

export default function AppShell({
  screen,
  setScreen,
  children,
  activeWorkout,
  transitioning,
}) {
  return (
    <div className={`app-shell ${transitioning ? 'is-transitioning' : ''}`}>
      <header className="app-header">
        <div className="brand-lockup">
          <div className="brand-mark">A</div>
          <div>
            <div className="brand-overline">AVAREN</div>
            <div className="brand-title">THE FOUNDRY</div>
            <div className="brand-subtitle">Strength, refined.</div>
          </div>
        </div>

        <div className={`status-pill ${activeWorkout ? 'active' : ''}`}>
          <span />
          {activeWorkout ? 'ACTIVE' : 'READY'}
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
