import {
  ArrowDown,
  ArrowLeft,
  ArrowUp,
  Copy,
  Link2,
  Plus,
  Save,
  Trash2,
  Unlink,
} from 'lucide-react'
import { useMemo, useState } from 'react'
import {
  LOAD_TYPE_OPTIONS,
  suggestDefaultLoadType,
} from '../lib/exerciseLoad'

const MUSCLES = [
  'Chest','Back','Shoulders','Traps','Biceps','Triceps','Rear Delts',
  'Quads','Hamstrings','Calves','Core','Lower Back','Glutes','Forearms','Other',
]

const SUPERSET_GROUPS = ['', 'A', 'B', 'C', 'D']

export default function WorkoutBuilderScreen({
  program,
  onSave,
  onClose,
}) {
  const [draft, setDraft] = useState(() => structuredClone(program))
  const [selectedWorkout, setSelectedWorkout] = useState(program.rotation[0])
  const [saved, setSaved] = useState(false)

  const exercises = draft.workouts[selectedWorkout] ?? []

  const updateExercise = (index, key, value) => {
    setDraft((current) => {
      const next = structuredClone(current)
      next.workouts[selectedWorkout][index][key] = value
      return next
    })
    setSaved(false)
  }

  const moveExercise = (index, direction) => {
    setDraft((current) => {
      const next = structuredClone(current)
      const list = next.workouts[selectedWorkout]
      const target = index + direction
      if (target < 0 || target >= list.length) return current
      ;[list[index], list[target]] = [list[target], list[index]]
      return next
    })
    setSaved(false)
  }

  const removeExercise = (index) => {
    setDraft((current) => {
      const next = structuredClone(current)
      next.workouts[selectedWorkout].splice(index, 1)
      return next
    })
    setSaved(false)
  }

  const addExercise = () => {
    setDraft((current) => {
      const next = structuredClone(current)
      next.workouts[selectedWorkout].push({
        name: 'New Exercise',
        sets: 3,
        muscle: 'Other',
        supersetGroup: '',
        loadType: suggestDefaultLoadType('New Exercise'),
      })
      return next
    })
    setSaved(false)
  }

  const duplicateWorkout = () => {
    const baseName = `${selectedWorkout} Copy`
    let name = baseName
    let suffix = 2
    while (draft.workouts[name]) {
      name = `${baseName} ${suffix++}`
    }

    setDraft((current) => ({
      ...current,
      rotation: [...current.rotation, name],
      workouts: {
        ...current.workouts,
        [name]: structuredClone(current.workouts[selectedWorkout]),
      },
    }))
    setSelectedWorkout(name)
    setSaved(false)
  }

  const addWorkout = () => {
    let number = 1
    let name = `New Workout ${number}`
    while (draft.workouts[name]) name = `New Workout ${++number}`

    setDraft((current) => ({
      ...current,
      rotation: [...current.rotation, name],
      workouts: { ...current.workouts, [name]: [] },
    }))
    setSelectedWorkout(name)
    setSaved(false)
  }

  const renameWorkout = (name) => {
    const trimmed = name.trim()
    if (!trimmed || trimmed === selectedWorkout || draft.workouts[trimmed]) return

    setDraft((current) => {
      const workouts = { ...current.workouts }
      workouts[trimmed] = workouts[selectedWorkout]
      delete workouts[selectedWorkout]
      return {
        ...current,
        nextWorkout:
          current.nextWorkout === selectedWorkout ? trimmed : current.nextWorkout,
        rotation: current.rotation.map((item) =>
          item === selectedWorkout ? trimmed : item,
        ),
        workouts,
      }
    })
    setSelectedWorkout(trimmed)
    setSaved(false)
  }

  const deleteWorkout = () => {
    if (draft.rotation.length <= 1) return
    const index = draft.rotation.indexOf(selectedWorkout)
    const replacement =
      draft.rotation[index + 1] ?? draft.rotation[index - 1]

    setDraft((current) => {
      const workouts = { ...current.workouts }
      delete workouts[selectedWorkout]
      return {
        ...current,
        rotation: current.rotation.filter((item) => item !== selectedWorkout),
        nextWorkout:
          current.nextWorkout === selectedWorkout
            ? replacement
            : current.nextWorkout,
        workouts,
      }
    })
    setSelectedWorkout(replacement)
    setSaved(false)
  }

  const groups = useMemo(() => {
    const counts = {}
    exercises.forEach((exercise) => {
      if (exercise.supersetGroup) {
        counts[exercise.supersetGroup] =
          (counts[exercise.supersetGroup] ?? 0) + 1
      }
    })
    return counts
  }, [exercises])

  const saveBuilder = () => {
    onSave(draft)
    setSaved(true)
    if (navigator.vibrate) navigator.vibrate([12, 40, 12])
  }

  return (
    <section className="builder-screen">
      <header className="builder-header">
        <button className="builder-back" onClick={onClose}>
          <ArrowLeft size={19} /> Back
        </button>
        <div>
          <span className="eyebrow">PROGRAM DESIGN</span>
          <h1>Workout Builder</h1>
        </div>
      </header>

      <section className="builder-workout-tabs">
        {draft.rotation.map((workout) => (
          <button
            key={workout}
            className={selectedWorkout === workout ? 'active' : ''}
            onClick={() => setSelectedWorkout(workout)}
          >
            {workout}
          </button>
        ))}
        <button className="builder-add-workout" onClick={addWorkout}>
          <Plus size={16} />
        </button>
      </section>

      <section className="builder-name-card">
        <label>Workout name</label>
        <input
          value={selectedWorkout}
          onChange={(event) => {
            const value = event.target.value
            if (value !== selectedWorkout) renameWorkout(value)
          }}
          onBlur={(event) => renameWorkout(event.target.value)}
        />
        <div>
          <button onClick={duplicateWorkout}><Copy size={15} /> Duplicate</button>
          <button
            className="builder-delete-workout"
            disabled={draft.rotation.length <= 1}
            onClick={deleteWorkout}
          >
            <Trash2 size={15} /> Delete
          </button>
        </div>
      </section>

      <div className="builder-exercise-list">
        {exercises.map((exercise, index) => (
          <article
            className={`builder-exercise-card ${
              exercise.supersetGroup ? 'superset-linked' : ''
            }`}
            key={`${selectedWorkout}-${index}`}
          >
            <div className="builder-card-top">
              <span>{String(index + 1).padStart(2, '0')}</span>
              <div className="builder-order-buttons">
                <button
                  disabled={index === 0}
                  onClick={() => moveExercise(index, -1)}
                >
                  <ArrowUp size={16} />
                </button>
                <button
                  disabled={index === exercises.length - 1}
                  onClick={() => moveExercise(index, 1)}
                >
                  <ArrowDown size={16} />
                </button>
                <button onClick={() => removeExercise(index)}>
                  <Trash2 size={16} />
                </button>
              </div>
            </div>

            <label>Exercise</label>
            <input
              value={exercise.name}
              onChange={(event) =>
                updateExercise(index, 'name', event.target.value)
              }
            />

            <div className="builder-field-grid">
              <div>
                <label>Default sets</label>
                <input
                  type="number"
                  min="1"
                  max="12"
                  value={exercise.sets}
                  onChange={(event) =>
                    updateExercise(index, 'sets', Number(event.target.value))
                  }
                />
              </div>
              <div>
                <label>Muscle</label>
                <select
                  value={exercise.muscle}
                  onChange={(event) =>
                    updateExercise(index, 'muscle', event.target.value)
                  }
                >
                  {MUSCLES.map((muscle) => (
                    <option key={muscle}>{muscle}</option>
                  ))}
                </select>
              </div>
            </div>

            <label>Load type</label>
            <select
              value={exercise.loadType ?? suggestDefaultLoadType(exercise.name)}
              aria-label="Load type"
              onChange={(event) =>
                updateExercise(index, 'loadType', event.target.value)
              }
            >
              {LOAD_TYPE_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>

            <label>Superset</label>
            <div className="builder-superset-control">
              <select
                value={exercise.supersetGroup ?? ''}
                onChange={(event) =>
                  updateExercise(
                    index,
                    'supersetGroup',
                    event.target.value,
                  )
                }
              >
                {SUPERSET_GROUPS.map((group) => (
                  <option key={group} value={group}>
                    {group ? `Superset ${group}` : 'Not linked'}
                  </option>
                ))}
              </select>
              {exercise.supersetGroup ? <Link2 size={18} /> : <Unlink size={18} />}
            </div>

            {exercise.supersetGroup && (
              <p className="builder-superset-note">
                Superset {exercise.supersetGroup} ·{' '}
                {groups[exercise.supersetGroup] ?? 1} linked exercises
              </p>
            )}
          </article>
        ))}
      </div>

      <button className="builder-add-exercise" onClick={addExercise}>
        <Plus size={18} /> Add Exercise
      </button>

      <div className="builder-save-bar">
        <button className="gold-button machined" onClick={saveBuilder}>
          <Save size={18} />
          {saved ? 'Saved' : 'Save Program'}
        </button>
      </div>
    </section>
  )
}
