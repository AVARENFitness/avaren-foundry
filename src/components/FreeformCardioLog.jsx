import { useState } from 'react'
import { Activity, Plus, Trash2, Pencil, X } from 'lucide-react'
import { CARDIO_ACTIVITIES, normalizeCardioEntry, isMobilityActivity, activityDisplayName } from '../lib/freeformCardio'

export default function FreeformCardioLog({ entries = [], onChange }) {
  const [section, setSection] = useState('cardio')
  const [kind, setKind] = useState('walk')
  const [customName, setCustomName] = useState('')
  const [minutes, setMinutes] = useState('')
  const [distance, setDistance] = useState('')
  const [unit, setUnit] = useState('mi')
  const [error, setError] = useState('')
  const [editingId, setEditingId] = useState(null)

  const resetFields = () => {
    setMinutes('')
    setCustomName('')
    setDistance('')
    setError('')
    setEditingId(null)
  }
  const startEditing = (entry) => {
    setEditingId(entry.id)
    setSection(isMobilityActivity(entry.kind) ? 'mobility' : 'cardio')
    setKind(entry.kind)
    setCustomName(entry.customName ?? '')
    setMinutes(String(entry.durationMinutes))
    setDistance(entry.distance == null ? '' : String(entry.distance))
    setUnit(entry.distanceUnit === 'km' ? 'km' : 'mi')
    setError('')
  }
  const cancelEditing = () => {
    resetFields()
  }
  const chooseSection = (next) => {
    resetFields()
    setSection(next)
    setKind(next === 'mobility' ? 'mobility' : 'walk')
    setDistance('')
    setError('')
  }
  const cardioEntries = entries.filter((entry) => !isMobilityActivity(entry.kind))
  const mobilityEntries = entries.filter((entry) => isMobilityActivity(entry.kind))

  const addEntry = () => {
    const entry = normalizeCardioEntry({ kind, minutes, distance: section === 'mobility' ? '' : distance, unit, customName })
    if (!entry) {
      setError('Enter a valid duration and distance. For Other movement, provide an activity name (up to 60 characters).')
      return
    }
    if (editingId) {
      onChange(entries.map((item) => item.id === editingId ? { ...entry, id: editingId } : item))
    } else {
      onChange([...(entries ?? []), entry])
    }
    resetFields()
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
                  <strong>{activityDisplayName(entry)}</strong>
                  <span>{entry.durationMinutes} min{entry.distance != null ? ` · ${entry.distance} ${entry.distanceUnit}` : ''}</span>
                </div>
                <div className="freeform-entry-actions">
                  <button type="button" aria-label={`Edit ${entry.kind} entry`} onClick={() => startEditing(entry)}>
                    <Pencil size={17} />
                  </button>
                  <button type="button" aria-label={`Remove ${entry.kind} entry`} onClick={() => {
                    if (editingId === entry.id) resetFields()
                    onChange(entries.filter((item) => item !== entry))
                  }}>
                  <Trash2 size={17} />
                  </button>
                </div>
              </li>
            ))}
          </ul>
        </div>
      ))}
      <h4 className="freeform-log-subtitle">{editingId ? 'Edit' : 'Add'} {section === 'mobility' ? 'mobility' : 'cardio'} activity</h4>
      <div className="freeform-cardio-form">
        <label>Activity
          <select value={kind} onChange={(event) => { setKind(event.target.value); setError(''); if (event.target.value !== 'other') setCustomName('') }}>
            {CARDIO_ACTIVITIES.filter((activity) => section === 'mobility' ? isMobilityActivity(activity.value) : !isMobilityActivity(activity.value)).map((activity) => <option key={activity.value} value={activity.value}>{activity.label}</option>)}
          </select>
        </label>
        {kind === 'other' && <label className="freeform-custom-activity-name">Activity name
          <input value={customName} maxLength={60} placeholder="Basketball, dance, climbing…" onChange={(event) => setCustomName(event.target.value)} />
        </label>}
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
      <div className="freeform-entry-form-actions">
        {editingId && <button type="button" className="freeform-entry-cancel" onClick={cancelEditing}><X size={17} /> Cancel</button>}
        <button type="button" className="freeform-cardio-add" onClick={addEntry}><Plus size={18} /> {editingId ? 'Save changes' : 'Add movement'}</button>
      </div>
    </section>
  )
}
