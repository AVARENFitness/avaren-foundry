import { Download, RotateCcw, Settings2 } from 'lucide-react'
import { exportState } from '../lib/storage'

export default function MoreScreen({ state, setState, onOpenBuilder }) {
  return (
    <>
      <section className="section-heading">
        <span className="eyebrow">CONTROL ROOM</span>
        <h1>Built around your training.</h1>
      </section>

      <section className="luxury-panel">
        <button className="setting-row" onClick={() => exportState(state)}>
          <Download /> Export backup <span>›</span>
        </button>
        <button className="setting-row" onClick={onOpenBuilder}>
          <Settings2 /> Workout Builder <span>›</span>
        </button>
        <button
          className="setting-row danger-text"
          onClick={() => {
            if (confirm('Reset all local Foundry data?')) {
              localStorage.clear()
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
