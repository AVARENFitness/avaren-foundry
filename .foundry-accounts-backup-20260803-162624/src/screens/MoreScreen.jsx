import {
  CalendarDays,
  Download,
  History,
  RotateCcw,
  Settings2,
} from 'lucide-react'
import ImportBackupButton from '../components/ImportBackupButton'
import {
  clearState,
  exportState,
  importState,
  lastBackupAt,
} from '../lib/storage'

const formatTime = (value) => {
  if (!value) return 'Never'
  return new Date(value).toLocaleString([], {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  })
}

export default function MoreScreen({
  state,
  setState,
  fallbackState,
  onOpenBuilder,
  onOpenPlanner,
  onOpenHistory,
}) {
  return (
    <>
      <section className="section-heading">
        <span className="eyebrow">CONTROL ROOM</span>
        <h1>Built around your training.</h1>
      </section>

      <section className="luxury-panel settings-group">
        <div className="settings-caption">YOUR DATA</div>

        <button
          className="setting-row"
          onClick={() => {
            exportState(state)
            setState((current) => ({
              ...current,
              lastBackupAt: new Date().toISOString(),
            }))
          }}
        >
          <Download /> Export backup <span>›</span>
        </button>

        <ImportBackupButton
          onImport={async (file) => {
            try {
              const restored = await importState(file, fallbackState)
              setState(restored)
              alert('Backup restored successfully.')
            } catch {
              alert('That backup file could not be restored.')
            }
          }}
        />

        <div className="settings-note">
          Last backup · {formatTime(state.lastBackupAt ?? lastBackupAt())}
        </div>
      </section>

      <section className="luxury-panel settings-group">
        <div className="settings-caption">TRAINING</div>

        <button className="setting-row" onClick={onOpenHistory}>
          <History /> Workout History <span>›</span>
        </button>

        <button className="setting-row" onClick={onOpenPlanner}>
          <CalendarDays /> Weekly Program <span>›</span>
        </button>

        <button className="setting-row" onClick={onOpenBuilder}>
          <Settings2 /> Workout Builder <span>›</span>
        </button>
      </section>

      <section className="luxury-panel settings-group">
        <div className="settings-caption">APP</div>
        <div className="settings-version">
          <span>Version</span>
          <strong>1.0 Beta · Daily Driver</strong>
        </div>

        <button
          className="setting-row danger-text"
          onClick={() => {
            if (
              confirm(
                'Reset all local Foundry data? Export a backup first. This cannot be undone.',
              )
            ) {
              clearState()
              location.reload()
            }
          }}
        >
          <RotateCcw /> Reset local data <span>›</span>
        </button>
      </section>
    </>
  )
}
