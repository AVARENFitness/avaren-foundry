import { X } from 'lucide-react'
import { useState } from 'react'

const MUSCLES = [
  'Chest','Back','Shoulders','Traps','Biceps','Triceps','Rear Delts',
  'Quads','Hamstrings','Calves','Core','Lower Back','Glutes','Forearms','Other',
]

export default function QuickAddModal({ onClose, onAdd }) {
  const [name, setName] = useState('')
  const [sets, setSets] = useState(3)
  const [muscle, setMuscle] = useState('Other')

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <section className="quick-add-modal" onClick={(event) => event.stopPropagation()}>
        <header>
          <div>
            <span className="eyebrow">IN-WORKOUT</span>
            <h2>Add Exercise</h2>
          </div>
          <button onClick={onClose}><X size={20} /></button>
        </header>

        <label>Exercise name</label>
        <input
          autoFocus
          value={name}
          placeholder="Cable Flys"
          onChange={(event) => setName(event.target.value)}
        />

        <div className="modal-grid">
          <div>
            <label>Starting sets</label>
            <input
              type="number"
              min="1"
              max="12"
              value={sets}
              onChange={(event) => setSets(Number(event.target.value))}
            />
          </div>
          <div>
            <label>Muscle region</label>
            <select value={muscle} onChange={(event) => setMuscle(event.target.value)}>
              {MUSCLES.map((item) => <option key={item}>{item}</option>)}
            </select>
          </div>
        </div>

        <button
          className="gold-button machined"
          disabled={!name.trim()}
          onClick={() => onAdd({ name: name.trim(), sets, muscle })}
        >
          Add to Today
        </button>
      </section>
    </div>
  )
}
