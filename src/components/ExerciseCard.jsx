import { Check, ChevronDown, ChevronUp, Plus } from 'lucide-react'
import Stepper from './Stepper'

const SET_TYPES = [
  'Warm-up',
  'Working',
  'Top Set',
  'Back-off',
  'Drop Set',
  'Failure',
  'AMRAP',
  'Superset',
]

export default function ExerciseCard({
  exercise,
  index,
  previousSets,
  expanded,
  onToggle,
  onSetChange,
  onAddSet,
}) {
  const entered = exercise.sets.filter((set) => set.weight !== '' && set.reps !== '')
  const complete = entered.length > 0 && entered.every((set) => set.done)

  return (
    <article className={`exercise-card ${complete ? 'complete' : ''}`}>
      <button className="exercise-header" onClick={onToggle}>
        <div>
          <div className="exercise-number">{String(index + 1).padStart(2, '0')}</div>
          <h2>{complete && <Check size={19} />} {exercise.name}</h2>
          <span className="muscle-pill">{exercise.muscle}</span>
          <p>
            {previousSets.length
              ? `Last: ${previousSets.map((set) => `${set.weight}×${set.reps}`).join(' · ')}`
              : 'No previous workout'}
          </p>
        </div>
        {expanded ? <ChevronUp /> : <ChevronDown />}
      </button>

      {expanded && (
        <div className="exercise-body">
          <div className="set-heading">
            <span>Set</span>
            <span>Type</span>
            <span>Weight</span>
            <span>Reps</span>
            <span>Done</span>
          </div>

          {exercise.sets.map((set, setIndex) => (
            <div className={`set-row ${set.done ? 'done' : ''}`} key={set.id}>
              <span className="set-number">{setIndex + 1}</span>

              <select
                value={set.type}
                onChange={(event) =>
                  onSetChange(setIndex, 'type', event.target.value)
                }
              >
                {SET_TYPES.map((type) => (
                  <option key={type}>{type}</option>
                ))}
              </select>

              <Stepper
                value={set.weight}
                step={5}
                inputMode="decimal"
                onChange={(value) => onSetChange(setIndex, 'weight', value)}
              />

              <Stepper
                value={set.reps}
                step={1}
                onChange={(value) => onSetChange(setIndex, 'reps', value)}
              />

              <label className="check-button">
                <input
                  type="checkbox"
                  checked={set.done}
                  onChange={(event) =>
                    onSetChange(setIndex, 'done', event.target.checked)
                  }
                />
                <span><Check size={17} /></span>
              </label>
            </div>
          ))}

          <button className="add-set-button" onClick={onAddSet}>
            <Plus size={18} /> Add set
          </button>
        </div>
      )}
    </article>
  )
}
