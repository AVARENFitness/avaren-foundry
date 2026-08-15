import {
  formatPrescriptionDisplay,
  normalizePrescription,
} from '../lib/exercisePrescription'
import { loadTypeLabel, normalizeLoadType } from '../lib/exerciseLoad'

export const formatAssignmentExerciseLine = (exercise = {}) => {
  const prescription = normalizePrescription(exercise)
  const loadType = normalizeLoadType(exercise.loadType, exercise.name)

  return {
    name: exercise.name ?? exercise.exercise ?? 'Exercise',
    prescription: formatPrescriptionDisplay(prescription),
    loadType:
      loadType !== 'external' ? loadTypeLabel(loadType) : null,
  }
}

export default function AssignmentExercisePreview({
  exercises = [],
  coachNotes = '',
  compact = false,
}) {
  if (!exercises.length && !coachNotes) return null

  const lines = exercises.map(formatAssignmentExerciseLine)

  return (
    <section
      className={`assignment-exercise-preview ${
        compact ? 'assignment-exercise-preview--compact' : ''
      }`}
      aria-label="Prescribed exercises"
    >
      {coachNotes ? (
        <p className="assignment-exercise-preview-notes">{coachNotes}</p>
      ) : null}

      {lines.length ? (
        <ul className="assignment-exercise-preview-list">
          {lines.map((line) => (
            <li key={line.name}>
              <strong>{line.name}</strong>
              <span>{line.prescription}</span>
              {line.loadType ? <small>{line.loadType}</small> : null}
            </li>
          ))}
        </ul>
      ) : null}
    </section>
  )
}
