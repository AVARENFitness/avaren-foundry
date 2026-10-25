import { useEffect, useState } from 'react'
import { coachQuickPlanBackend } from '../lib/coachQuickPlanBackend'
import '../styles/screens/coach-quick-plan.css'

const blankRow = () => ({ id: globalThis.crypto?.randomUUID?.() ?? String(Date.now()), name: '', day: 'Day 1', sets: '3', reps: '10', load: '', notes: '' })
const STARTERS = {
  'Full body': ['Squat pattern', 'Horizontal push', 'Horizontal pull', 'Hip hinge', 'Core / carry'],
  'Upper body': ['Horizontal push', 'Horizontal pull', 'Vertical push', 'Vertical pull', 'Arm accessory'],
  'Lower body': ['Squat pattern', 'Hip hinge', 'Single-leg exercise', 'Calf exercise', 'Core'],
  'Mobility': ['Breathing / warm-up', 'Hip mobility', 'Thoracic mobility', 'Balance', 'Cooldown'],
}
const normalizePlan = (raw) => {
  if (!raw || typeof raw !== 'object') return null
  return {
    ...raw,
    title: typeof raw.title === 'string' ? raw.title : 'Training plan',
    focus: typeof raw.focus === 'string' ? raw.focus : '',
    coach_notes: typeof raw.coach_notes === 'string' ? raw.coach_notes : '',
    exercises: Array.isArray(raw.exercises)
      ? raw.exercises.filter(row => row && typeof row === 'object')
      : [],
  }
}
export default function CoachQuickPlan({ businessClientId, clientName, readOnly = false }) {
  const [plan, setPlan] = useState(null)
  const [baseline, setBaseline] = useState('')
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')
  const [loadError, setLoadError] = useState('')
  useEffect(() => {
    let active = true
    setPlan(null);
    (readOnly ? coachQuickPlanBackend.getForAthlete() : coachQuickPlanBackend.get(businessClientId)).then(data => {
      if (active) { setPlan(normalizePlan(data)); setBaseline(JSON.stringify(normalizePlan(data))); setLoadError('') }
    }).catch(error => { if (active) setLoadError(error.message || 'Could not load plan') })
    return () => { active = false }
  }, [businessClientId, readOnly])
  const dirty = Boolean(plan) && JSON.stringify(plan) !== baseline
  useEffect(() => {
    if (readOnly || !dirty) return undefined
    const beforeUnload = (event) => {
      event.preventDefault()
      event.returnValue = ''
    }
    window.addEventListener('beforeunload', beforeUnload)
    return () => window.removeEventListener('beforeunload', beforeUnload)
  }, [dirty, readOnly])
  const change = (key, value) => { setPlan(p => ({ ...p, [key]: value })); setMessage('') }
  const editRow = (index, key, value) => change('exercises', plan.exercises.map((row,i) => i === index ? { ...row, [key]: value } : row))
  const move = (index, direction) => {
    const target = index + direction
    if (target < 0 || target >= plan.exercises.length) return
    const next = [...plan.exercises]
    ;[next[index], next[target]] = [next[target], next[index]]
    change('exercises', next)
  }
  const addStarter = (name) => {
    const names = STARTERS[name] ?? []
    if (!names.length) return
    change('exercises', [...plan.exercises, ...names.map(item => ({...blankRow(), name: item, load: '', notes: ''}))])
  }
  const save = async () => {
    setBusy(true); setMessage('')
    try {
      const saved = await coachQuickPlanBackend.save({ businessClientId, plan })
      setPlan(saved); setBaseline(JSON.stringify(saved)); setMessage('Plan saved. Changes are available to connected athletes.')
    } catch (error) { setMessage(error.message || 'Could not save plan.') }
    finally { setBusy(false) }
  }
  if (loadError) return <p role="alert">Could not load this client's plan: {loadError}</p>
  if (!plan) return readOnly ? <p>No coach plan has been shared yet.</p> : <p>Loading plan…</p>
  return <section className="avaren-quick-plan">
    <div className="avaren-plan-toolbar">
      <div><span className="eyebrow">WORKOUT PLAN</span><h2>{clientName}</h2><small>{readOnly ? 'Your current plan' : 'Edit anytime · changes save to this plan'}</small></div>
      <div className="avaren-plan-toolbar-actions">
        <button type="button" className="coach-secondary-button" onClick={() => window.print()}>Print plan</button>
        {!readOnly && <button type="button" className="gold-button machined coach-primary-action" disabled={busy || !dirty} onClick={save}>{busy ? 'Saving…' : 'Save changes'}</button>}
      </div>
    </div>
    <div className="avaren-plan-paper">
      <label className="avaren-plan-field">Plan name
        <input aria-label="Plan name" disabled={readOnly} value={plan.title} onChange={e => change('title', e.target.value)} placeholder="Full-body strength" />
      </label>
      <label className="avaren-plan-field">Focus
        <input aria-label="Plan focus" disabled={readOnly} value={plan.focus ?? ''} onChange={e => change('focus', e.target.value)} placeholder="Strength, balance, mobility…" />
      </label>
      <div className="avaren-plan-exercises"><div className="avaren-plan-exercise-heading"><strong>Exercises</strong><span>Sets · Reps · Load</span></div>
        {plan.exercises.map((row,index) => <article className="avaren-plan-row" key={row.id ?? index}>
          <div className="avaren-plan-row-top"><strong>{String(index+1).padStart(2,'0')}</strong>
            {!readOnly && <div className="avaren-plan-row-actions"><button type="button" aria-label={`Move exercise ${index+1} up`} disabled={index === 0} onClick={() => move(index,-1)}>↑</button><button type="button" aria-label={`Move exercise ${index+1} down`} disabled={index === plan.exercises.length-1} onClick={() => move(index,1)}>↓</button><button type="button" aria-label={`Duplicate exercise ${index+1}`} onClick={() => change('exercises', [...plan.exercises.slice(0,index+1), {...row, id: blankRow().id}, ...plan.exercises.slice(index+1)])}>Copy</button><button type="button" aria-label={`Remove exercise ${index+1}`} onClick={() => change('exercises',plan.exercises.filter((_,i)=>i!==index))}>Remove</button></div>}
          </div>
          <label className="avaren-plan-exercise-day">Workout day
            <input aria-label={`Exercise ${index+1} day`} placeholder="Day 1" disabled={readOnly} value={row.day ?? 'Day 1'} onChange={e => editRow(index,'day',e.target.value)} />
          </label>
          <input aria-label={`Exercise ${index+1} name`} placeholder="Exercise name" disabled={readOnly} value={row.name ?? ''} onChange={e => editRow(index,'name',e.target.value)} />
          <div className="avaren-plan-recipe">{[['sets','Sets'],['reps','Reps'],['load','Load']].map(([field,label]) => <label key={field}>{label}<input disabled={readOnly} value={row[field] ?? ''} onChange={e => editRow(index,field,e.target.value)} /></label>)}</div>
          <textarea aria-label={`Exercise ${index+1} notes`} placeholder="Tempo, cues, rest, modifications…" disabled={readOnly} rows={2} value={row.notes ?? ''} onChange={e => editRow(index,'notes',e.target.value)} />
        </article>)}
        {!readOnly && <div className="avaren-plan-add-actions">
          <button className="avaren-plan-add" type="button" onClick={() => change('exercises',[...plan.exercises,blankRow()])}>+ Add exercise</button>
          <label>Start from a template
            <select aria-label="Add exercises from template" defaultValue="" onChange={e => { addStarter(e.target.value); e.target.value = '' }}>
              <option value="">Choose template…</option>{Object.keys(STARTERS).map(name => <option key={name} value={name}>{name}</option>)}
            </select>
          </label>
        </div>}
      </div>
      <label className="avaren-plan-field">Coach notes
        <textarea rows={3} disabled={readOnly} placeholder="Warm-up, cooldown, goals or reminders…" value={plan.coach_notes ?? ''} onChange={e => change('coach_notes',e.target.value)} />
      </label>
    </div>
    <p className="avaren-plan-feedback" role="status">{message || (dirty ? 'Unsaved changes' : 'Up to date')}</p>
  </section>
}
