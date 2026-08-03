import { Check, ChevronRight, Layers3, X } from 'lucide-react'

export default function WorkoutSelector({
  workouts,
  selectedWorkout,
  onSelect,
  onClose,
  onOpenBuilder,
}) {
  return (
    <div className="workout-selector-backdrop" onClick={onClose}>
      <section
        className="workout-selector-sheet"
        onClick={(event) => event.stopPropagation()}
      >
        <header>
          <div>
            <span className="eyebrow">TODAY AT AVAREN</span>
            <h2>Choose your workout</h2>
            <p>This changes today only. Your normal rotation stays intact.</p>
          </div>
          <button className="selector-close" onClick={onClose}>
            <X size={20} />
          </button>
        </header>

        <div className="workout-selector-list">
          {workouts.map((workout) => (
            <button
              key={workout}
              className={selectedWorkout === workout ? 'selected' : ''}
              onClick={() => onSelect(workout)}
            >
              <span>
                <small>{selectedWorkout === workout ? 'SELECTED' : 'WORKOUT'}</small>
                <strong>{workout}</strong>
              </span>
              {selectedWorkout === workout ? (
                <span className="selector-check"><Check size={17} /></span>
              ) : (
                <ChevronRight size={18} />
              )}
            </button>
          ))}
        </div>

        <button className="selector-builder" onClick={onOpenBuilder}>
          <Layers3 size={18} />
          Create or edit workouts
          <ChevronRight size={18} />
        </button>
      </section>
    </div>
  )
}
