import { Check, ChevronRight, Layers3, X } from 'lucide-react'

export default function WorkoutSelector({
  workouts = [],
  recommendedWorkout = null,
  selectedWorkout,
  onSelect,
  onClose,
  onOpenBuilder,
  coachAssignedWorkout = null,
}) {
  const otherWorkouts = workouts.filter((workout) => workout !== recommendedWorkout)

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
            {coachAssignedWorkout ? (
              <p className="workout-selector-coach-note">
                Your assigned workout ({coachAssignedWorkout}) stays incomplete if
                you choose something else.
              </p>
            ) : null}
          </div>
          <button className="selector-close" onClick={onClose}>
            <X size={20} />
          </button>
        </header>

        <div className="workout-selector-list">
          {recommendedWorkout ? (
            <>
              <span className="workout-selector-section-label">TODAY</span>
              <button
                className={
                  selectedWorkout === recommendedWorkout ||
                  (!selectedWorkout && recommendedWorkout)
                    ? 'selected'
                    : ''
                }
                onClick={() => onSelect(recommendedWorkout)}
              >
                <span>
                  <small>RECOMMENDED</small>
                  <strong>{recommendedWorkout}</strong>
                </span>
                {selectedWorkout === recommendedWorkout ||
                (!selectedWorkout && recommendedWorkout) ? (
                  <span className="selector-check"><Check size={17} /></span>
                ) : (
                  <ChevronRight size={18} />
                )}
              </button>
            </>
          ) : null}

          {otherWorkouts.length ? (
            <>
              <span className="workout-selector-section-label">OTHER WORKOUTS</span>
              {otherWorkouts.map((workout) => (
                <button
                  key={workout}
                  className={selectedWorkout === workout ? 'selected' : ''}
                  onClick={() => onSelect(workout)}
                >
                  <span>
                    <small>WORKOUT</small>
                    <strong>{workout}</strong>
                  </span>
                  {selectedWorkout === workout ? (
                    <span className="selector-check"><Check size={17} /></span>
                  ) : (
                    <ChevronRight size={18} />
                  )}
                </button>
              ))}
            </>
          ) : null}

          {!recommendedWorkout && !otherWorkouts.length
            ? workouts.map((workout) => (
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
              ))
            : null}
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
