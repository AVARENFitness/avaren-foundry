import {
  ArrowDown,
  ArrowUp,
  Check,
  Copy,
  Dumbbell,
  Plus,
  Save,
  Search,
  Trash2,
  X,
} from 'lucide-react'
import { useMemo, useState } from 'react'
import { COMMON_EXERCISES } from '../data/commonExercises'

const MUSCLES = [
  'Chest','Back','Shoulders','Traps','Biceps','Triceps','Rear Delts',
  'Quads','Hamstrings','Calves','Core','Lower Back','Glutes','Forearms','Other',
]

const makeExercise = (name = 'New Exercise', muscle = 'Other') => ({
  id: crypto.randomUUID(),
  name,
  muscle,
  sets: 3,
  reps: '8-12',
  weightGuidance: '',
  restSeconds: 90,
  tempo: '',
  rir: '2',
  rpe: '',
  supersetGroup: '',
  notes: '',
})

const normalizeExercise = (exercise) => ({
  ...makeExercise(exercise?.name, exercise?.muscle),
  ...exercise,
  id: exercise?.id ?? crypto.randomUUID(),
  sets: Number(exercise?.sets) || 3,
})

export default function CoachWorkoutDesigner({
  clients = [],
  program,
  templates = [],
  initialClientId = '',
  initialTemplate = null,
  onClose,
  onSaveTemplate,
  onAssign,
}) {
  const library = useMemo(() => {
    const map = new Map()

    COMMON_EXERCISES.forEach((exercise) => {
      map.set(
        `${exercise.name}-${exercise.muscle}`.toLowerCase(),
        exercise,
      )
    })

    Object.values(program?.workouts ?? {}).flat().forEach((exercise) => {
      const key = `${exercise.name}-${exercise.muscle ?? 'Other'}`.toLowerCase()
      if (!map.has(key)) map.set(key, exercise)
    })
    templates.flatMap((template) => template.workout_payload?.exercises ?? []).forEach((exercise) => {
      const key = `${exercise.name}-${exercise.muscle ?? 'Other'}`.toLowerCase()
      if (!map.has(key)) map.set(key, exercise)
    })
    return [...map.values()].sort((a,b)=>a.name.localeCompare(b.name))
  }, [program, templates])

  const source = initialTemplate?.workout_payload
  const [draft, setDraft] = useState(() => ({
    name: source?.name ?? initialTemplate?.name ?? 'Custom Workout',
    athleteId: initialClientId,
    dueDate: '',
    priority: 'normal',
    coachNotes: '',
    exercises: (source?.exercises ?? []).map(normalizeExercise),
  }))
  const [query, setQuery] = useState('')
  const [muscleFilter, setMuscleFilter] = useState('All')
  const [notice, setNotice] = useState('')

  const filteredLibrary = library.filter((exercise) => {
    const matchesQuery = `${exercise.name} ${exercise.muscle}`.toLowerCase().includes(query.trim().toLowerCase())
    const matchesMuscle = muscleFilter === 'All' || exercise.muscle === muscleFilter
    return matchesQuery && matchesMuscle
  })

  const updateExercise = (index, patch) => {
    setDraft((current) => ({
      ...current,
      exercises: current.exercises.map((exercise, exerciseIndex) =>
        exerciseIndex === index ? { ...exercise, ...patch } : exercise,
      ),
    }))
  }

  const moveExercise = (index, direction) => {
    setDraft((current) => {
      const exercises = [...current.exercises]
      const target = index + direction
      if (target < 0 || target >= exercises.length) return current
      ;[exercises[index], exercises[target]] = [exercises[target], exercises[index]]
      return { ...current, exercises }
    })
  }

  const addFromLibrary = (exercise) => {
    setDraft((current) => ({
      ...current,
      exercises: [...current.exercises, normalizeExercise(exercise)],
    }))
  }

  const removeExercise = (index) => {
    setDraft((current) => ({
      ...current,
      exercises: current.exercises.filter((_, exerciseIndex) => exerciseIndex !== index),
    }))
  }

  const workoutPayload = () => ({
    name: draft.name.trim() || 'Custom Workout',
    exercises: draft.exercises.map(({ id, ...exercise }) => exercise),
  })

  const validate = ({ assigning = false } = {}) => {
    if (!draft.name.trim()) return 'Name the workout first.'
    if (!draft.exercises.length) return 'Add at least one exercise.'
    if (assigning && !draft.athleteId) return 'Select a client.'
    return ''
  }

  return (
    <section className="coach-designer-overlay">
      <div className="coach-designer-shell">
        <header className="coach-designer-header">
          <div>
            <span className="eyebrow">COACH WORKOUT DESIGNER</span>
            <h1>Build an individual workout.</h1>
            <p>Create once, save as a template, or send it directly to one client.</p>
          </div>
          <button className="coach-designer-close" onClick={onClose} aria-label="Close designer">
            <X size={20}/>
          </button>
        </header>

        <div className="coach-designer-layout">
          <aside className="coach-exercise-library">
            <div className="coach-library-heading">
              <Dumbbell size={19}/>
              <div><strong>Exercise library</strong><span>281 common exercises are ready to use. Create only unique movements.</span></div>
            </div>
            <label className="coach-library-search"><Search size={16}/><input value={query} onChange={(event)=>setQuery(event.target.value)} placeholder="Search exercises"/></label>
            <select value={muscleFilter} onChange={(event)=>setMuscleFilter(event.target.value)}>
              <option>All</option>{MUSCLES.map((muscle)=><option key={muscle}>{muscle}</option>)}
            </select>
            <button className="coach-new-exercise" onClick={()=>addFromLibrary(makeExercise())}><Plus size={16}/>Custom exercise</button>
            <div className="coach-library-results">
              {filteredLibrary.map((exercise)=><button key={`${exercise.name}-${exercise.muscle}`} onClick={()=>addFromLibrary(exercise)}><div><strong>{exercise.name}</strong><span>{exercise.muscle}{exercise.equipment ? ` · ${exercise.equipment}` : ''}</span></div><Plus size={16}/></button>)}
            </div>
          </aside>

          <main className="coach-designer-main">
            <section className="coach-designer-meta">
              <label><span>Workout name</span><input value={draft.name} onChange={(event)=>setDraft((current)=>({...current,name:event.target.value}))}/></label>
              <div className="coach-designer-meta-grid">
                <label><span>Client</span><select value={draft.athleteId} onChange={(event)=>setDraft((current)=>({...current,athleteId:event.target.value}))}><option value="">Choose client</option>{clients.map((client)=><option key={client.id} value={client.athlete_id}>{client.athlete_email}</option>)}</select></label>
                <label><span>Due date</span><input type="date" value={draft.dueDate} onChange={(event)=>setDraft((current)=>({...current,dueDate:event.target.value}))}/></label>
                <label><span>Priority</span><select value={draft.priority} onChange={(event)=>setDraft((current)=>({...current,priority:event.target.value}))}><option value="normal">Normal</option><option value="high">High</option><option value="optional">Optional</option></select></label>
              </div>
              <label><span>Coach notes</span><textarea rows={3} value={draft.coachNotes} onChange={(event)=>setDraft((current)=>({...current,coachNotes:event.target.value}))} placeholder="Session goal, effort target, substitutions, or personal coaching cues."/></label>
            </section>

            <section className="coach-designer-exercises">
              <header><div><span className="eyebrow">WORKOUT ORDER</span><h2>{draft.exercises.length} exercises</h2></div></header>
              {!draft.exercises.length && <div className="coach-designer-empty"><Dumbbell size={24}/><strong>Start with an exercise.</strong><span>Use the library or add a custom movement.</span></div>}
              {draft.exercises.map((exercise,index)=><article className="coach-designed-exercise" key={exercise.id}>
                <div className="coach-designed-exercise-top"><span>{String(index+1).padStart(2,'0')}</span><div><button disabled={index===0} onClick={()=>moveExercise(index,-1)}><ArrowUp size={16}/></button><button disabled={index===draft.exercises.length-1} onClick={()=>moveExercise(index,1)}><ArrowDown size={16}/></button><button onClick={()=>removeExercise(index)}><Trash2 size={16}/></button></div></div>
                <div className="coach-designed-grid">
                  <label className="wide"><span>Exercise</span><input value={exercise.name} onChange={(event)=>updateExercise(index,{name:event.target.value})}/></label>
                  <label><span>Muscle</span><select value={exercise.muscle} onChange={(event)=>updateExercise(index,{muscle:event.target.value})}>{MUSCLES.map((muscle)=><option key={muscle}>{muscle}</option>)}</select></label>
                  <label><span>Sets</span><input type="number" min="1" max="12" value={exercise.sets} onChange={(event)=>updateExercise(index,{sets:Number(event.target.value)})}/></label>
                  <label><span>Reps</span><input value={exercise.reps} onChange={(event)=>updateExercise(index,{reps:event.target.value})} placeholder="8-12"/></label>
                  <label><span>Weight guidance</span><input value={exercise.weightGuidance} onChange={(event)=>updateExercise(index,{weightGuidance:event.target.value})} placeholder="Moderate / 70%"/></label>
                  <label><span>Rest (sec)</span><input type="number" min="0" step="15" value={exercise.restSeconds} onChange={(event)=>updateExercise(index,{restSeconds:Number(event.target.value)})}/></label>
                  <label><span>Tempo</span><input value={exercise.tempo} onChange={(event)=>updateExercise(index,{tempo:event.target.value})} placeholder="3-1-1"/></label>
                  <label><span>RIR</span><input value={exercise.rir} onChange={(event)=>updateExercise(index,{rir:event.target.value})} placeholder="2"/></label>
                  <label><span>RPE</span><input value={exercise.rpe} onChange={(event)=>updateExercise(index,{rpe:event.target.value})} placeholder="8"/></label>
                  <label><span>Superset</span><input value={exercise.supersetGroup} onChange={(event)=>updateExercise(index,{supersetGroup:event.target.value.toUpperCase()})} placeholder="A"/></label>
                  <label className="wide"><span>Exercise notes</span><textarea rows={2} value={exercise.notes} onChange={(event)=>updateExercise(index,{notes:event.target.value})} placeholder="Setup, range of motion, substitutions, or technique cues."/></label>
                </div>
              </article>)}
            </section>

            {notice && <p className="coach-hub-notice">{notice}</p>}
            <footer className="coach-designer-actions">
              <button className="coach-secondary-button" onClick={async()=>{const error=validate();if(error)return setNotice(error);await onSaveTemplate?.({name:draft.name.trim(),workout:workoutPayload()});setNotice('Template saved.')}}><Save size={17}/>Save Template</button>
              <button className="gold-button machined" onClick={async()=>{const error=validate({assigning:true});if(error)return setNotice(error);await onAssign?.({athleteId:draft.athleteId,title:draft.name.trim(),workout:workoutPayload(),dueDate:draft.dueDate,priority:draft.priority,coachNotes:draft.coachNotes});onClose?.();}}><Check size={17}/>Assign Workout</button>
            </footer>
          </main>
        </div>
      </div>
    </section>
  )
}
