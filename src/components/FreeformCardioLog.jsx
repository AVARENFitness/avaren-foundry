import { useState } from 'react'
import { Activity, Plus, Trash2 } from 'lucide-react'
import { CARDIO_ACTIVITIES, normalizeCardioEntry } from '../lib/freeformCardio'

export default function FreeformCardioLog({ entries = [], onChange }) {
  const [section, setSection] = useState('cardio')
  const [kind, setKind] = useState('walk')
  const [minutes, setMinutes] = useState('')
  const [distance, setDistance] = useState('')
  const [unit, setUnit] = useState('mi')
  const [error, setError] = useState('')

  const chooseSection = (next) => {
    setSection(next)
    setKind(next === 'mobility' ? 'mobility' : 'walk')
    setDistance('')
    setError('')
  }
  const cardioEntries = entries.filter((entry) => entry.kind !== 'mobility')
  const mobilityEntries = entries.filter((entry) => entry.kind === 'mobility')

  const addEntry = () => {
    const entry = normalizeCardioEntry({ kind, minutes, distance, unit })
    if (!entry) {
      setError('Enter a duration greater than zero and a valid distance, if provided.')
      return
    }
    onChange([...(entries ?? []), entry])
    setMinutes('')
    setDistance('')
    setError('')
  }

  return (
    <section className="freeform-cardio" aria-label="Cardio and movement log">
      <div className="freeform-cardio-heading">
        <Activity size={21} aria-hidden="true" />
        <div>
          <span className="eyebrow">MOVEMENT LOG</span>
          <h3>Cardio & recovery</h3>
          <p>Record a walk, ride, run, or other movement. Distance is optional.</p>
        </div>
      </div>
      <div className="freeform-section-switch" role="group" aria-label="Movement type">
        <button type="button" aria-pressed={section === 'cardio'} onClick={() => chooseSection('cardio')}>Cardio</button>
        <button type="button" aria-pressed={section === 'mobility'} onClick={() => chooseSection('mobility')}>Mobility</button>
      </div>
      {[
        { key: 'cardio', title: 'Cardio', items: cardioEntries },
        { key: 'mobility', title: 'Mobility', items: mobilityEntries },
      ].filter((group) => group.items.length > 0).map((group) => (
        <div key={group.key} className="freeform-activity-group">
          <h4>{group.title} · {group.items.length}</h4>
          <ul className="freeform-cardio-entries">
            {group.items.map((entry, index) => (
              <li key={entry.id ?? index}>
                <div>
                  <strong>{CARDIO_ACTIVITIES.find((item) => item.value === entry.kind)?.label ?? entry.kind}</strong>
                  <span>{entry.durationMinutes} min{entry.distance != null ? ` · ${entry.distance} ${entry.distanceUnit}` : ''}</span>
                </div>
                <button type="button" aria-label={`Remove ${entry.kind} entry`} onClick={() => onChange(entries.filter((item) => item !== entry))}>
                  <Trash2 size={17} />
                </button>
              </li>
            ))}
          </ul>
        </div>
      ))}
      <h4 className="freeform-log-subtitle">Add {section === 'mobility' ? 'mobility' : 'cardio'} activity</h4>
      <div className="freeform-cardio-form">
        <label>Activity
          <select value={kind} onChange={(event) => setKind(event.target.value)}>
            {CARDIO_ACTIVITIES.filter((activity) => section === 'mobility' ? activity.value === 'mobility' : activity.value !== 'mobility').map((activity) => <option key={activity.value} value={activity.value}>{activity.label}</option>)}
          </select>
        </label>
        <label>Duration (min)
          <input type="number" inputMode="decimal" min="0.1" step="any" placeholder="30" value={minutes} onChange={(event) => setMinutes(event.target.value)} />
        </label>
        {section === 'cardio' && <label>Distance (optional)
          <input type="number" inputMode="decimal" min="0" step="any" placeholder="2.5" value={distance} onChange={(event) => setDistance(event.target.value)} />
        </label>}
        {section === 'cardio' && <label>Unit
          <select value={unit} onChange={(event) => setUnit(event.target.value)}>
            <option value="mi">Miles</option>
            <option value="km">Kilometers</option>
          </select>
        </label>}
      </div>
      {error && <p className="freeform-cardio-error" role="alert">{error}</p>}
      <button type="button" className="freeform-cardio-add" onClick={addEntry}><Plus size={18} /> Add movement</button>
    </section>
  )
}
