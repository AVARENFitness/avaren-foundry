import { X } from 'lucide-react'
import { useEffect, useState } from 'react'
import AppUiBackdrop from './ui/AppUiBackdrop'

const MUSCLES = [
  'Chest','Back','Shoulders','Traps','Biceps','Triceps','Rear Delts',
  'Quads','Hamstrings','Calves','Core','Lower Back','Glutes','Forearms','Other',
]

export default function QuickAddModal({
  onClose,
  onAdd,
  canSaveToPlan = false,
  workoutName = '',
}) {
  const [name, setName] = useState('')
  const [sets, setSets] = useState(3)
  const [muscle, setMuscle] = useState('Other')
  const [saveToPlan, setSaveToPlan] = useState(false)
  const [viewportStyle, setViewportStyle] = useState(undefined)

  useEffect(() => {
    const viewport = window.visualViewport
    if (!viewport) return undefined

    const syncViewport = () => {
      setViewportStyle({
        '--quick-add-visible-height': `${Math.round(viewport.height)}px`,
        '--quick-add-visible-top': `${Math.round(viewport.offsetTop)}px`,
      })
    }

    syncViewport()
    viewport.addEventListener('resize', syncViewport)
    viewport.addEventListener('scroll', syncViewport)

    return () => {
      viewport.removeEventListener('resize', syncViewport)
      viewport.removeEventListener('scroll', syncViewport)
    }
  }, [])

  return (
    <AppUiBackdrop
      open
      onClose={onClose}
      className="modal-backdrop-host quick-add-backdrop"
      style={viewportStyle}
    >
      <section
        className="quick-add-modal"
        role="dialog"
        aria-modal="true"
        aria-label="Add exercise"
        onClick={(event) => event.stopPropagation()}
      >
        <header>
          <div>
            <span className="eyebrow">IN-WORKOUT</span>
            <h2>Add Exercise</h2>
          </div>
          <button type="button" onClick={onClose} aria-label="Close">
            <X size={20} />
          </button>
        </header>

        <label htmlFor="quick-add-exercise-name">Exercise name</label>
        <input
          id="quick-add-exercise-name"
          autoFocus
          value={name}
          placeholder="Cable Flys"
          onChange={(event) => setName(event.target.value)}
        />

        <div className="modal-grid">
          <div>
            <label htmlFor="quick-add-sets">Starting sets</label>
            <input
              id="quick-add-sets"
              type="number"
              min="1"
              max="12"
              value={sets}
              onChange={(event) => setSets(Number(event.target.value))}
            />
          </div>
          <div>
            <label htmlFor="quick-add-muscle">Muscle region</label>
            <select
              id="quick-add-muscle"
              value={muscle}
              onChange={(event) => setMuscle(event.target.value)}
            >
              {MUSCLES.map((item) => <option key={item}>{item}</option>)}
            </select>
          </div>
        </div>

        {canSaveToPlan ? (
          <div className="quick-add-plan-choice" role="group" aria-label="Save exercise">
            <button
              type="button"
              className={!saveToPlan ? 'active' : ''}
              onClick={() => setSaveToPlan(false)}
            >
              Today only
            </button>
            <button
              type="button"
              className={saveToPlan ? 'active' : ''}
              onClick={() => setSaveToPlan(true)}
            >
              Add to {workoutName || 'workout'} plan
            </button>
          </div>
        ) : null}

        <button
          type="button"
          className="gold-button machined"
          disabled={!name.trim()}
          onClick={() =>
            onAdd({
              name: name.trim(),
              sets,
              muscle,
              saveToPlan: canSaveToPlan && saveToPlan,
            })
          }
        >
          {saveToPlan && canSaveToPlan ? 'Add & Save to Plan' : 'Add to Today'}
        </button>
      </section>
    </AppUiBackdrop>
  )
}
