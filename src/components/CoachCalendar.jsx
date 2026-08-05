import {
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  Copy,
  Plus,
  RefreshCcw,
  Trash2,
} from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { coachBackend } from '../lib/coachBackend'
import SectionHeader from './ui/SectionHeader'
import EmptyState from './ui/EmptyState'

const DAY_MS = 86400000
const dateKey = (date) => new Date(date).toISOString().slice(0, 10)
const mondayOf = (input) => {
  const date = new Date(input)
  date.setHours(12, 0, 0, 0)
  const day = date.getDay() || 7
  date.setDate(date.getDate() - day + 1)
  return date
}
const addDays = (date, days) => new Date(new Date(date).getTime() + days * DAY_MS)
const weekDays = (anchor) => Array.from({ length: 7 }, (_, index) => addDays(mondayOf(anchor), index))
const formatShort = (date) => date.toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' })

export default function CoachCalendar({ clients, assignments, templates, program, onRefresh, initialClientId = '' }) {
  const [anchor, setAnchor] = useState(new Date())
  const [clientId, setClientId] = useState(initialClientId)
  const [notice, setNotice] = useState('')
  const [scheduleItems, setScheduleItems] = useState([])
  const reloadSchedule = async () => { try { setScheduleItems(await coachBackend.listScheduleItems({ athleteId: clientId || null, startDate: dateKey(days[0]), endDate: dateKey(days[6]) })) } catch { setScheduleItems([]) } }
  const [showComposer, setShowComposer] = useState(false)
  const [draft, setDraft] = useState({ athleteId: initialClientId, kind: 'workout', title: '', dueDate: dateKey(new Date()), templateId: '', notes: '' })

  useEffect(() => {
    if (initialClientId) {
      setClientId(initialClientId)
      setDraft((current) => ({ ...current, athleteId: initialClientId }))
    }
  }, [initialClientId])

  const days = useMemo(() => weekDays(anchor), [anchor])
  useEffect(() => { reloadSchedule() }, [clientId, anchor])
  const visible = useMemo(
    () =>
      assignments.filter(
        (item) =>
          ['assigned', 'started'].includes(item.status) &&
          (!clientId || item.athlete_id === clientId),
      ),
    [assignments, clientId],
  )
  const byDate = useMemo(() => Object.fromEntries(days.map((day) => { const key=dateKey(day); const workouts=visible.filter((item)=>item.due_date===key).map(item=>({...item,kind:'workout'})); const nonWorkouts=scheduleItems.filter(item=>item.scheduled_date===key && item.kind!=='workout'); return [key,[...workouts,...nonWorkouts]] })), [days, visible, scheduleItems])
  const availableWorkouts = useMemo(() => {
    const entries = []
    templates.forEach((template) => entries.push({ id: `template:${template.id}`, name: template.name, workout: template.workout_payload }))
    Object.entries(program?.workouts ?? {}).forEach(([name, exercises]) => entries.push({ id: `program:${name}`, name, workout: { name, exercises } }))
    return entries
  }, [templates, program])

  const create = async () => {
    if (!draft.athleteId) return setNotice('Select a client.')
    if (draft.kind === 'workout') {
      const selected = availableWorkouts.find((item) => item.id === draft.templateId)
      if (!selected) return setNotice('Choose a workout or template.')
      await coachBackend.createScheduledAssignment({ athleteId: draft.athleteId, title: draft.title || selected.name, workout: selected.workout, coachNotes: draft.notes, dueDate: draft.dueDate })
    } else {
      await coachBackend.createScheduleItem({ athleteId: draft.athleteId, kind: draft.kind, title: draft.title || (draft.kind === 'rest' ? 'Rest Day' : 'Deload Day'), scheduledDate: draft.dueDate, notes: draft.notes })
    }
    setNotice('Schedule updated.')
    setShowComposer(false)
    await onRefresh?.()
    await reloadSchedule()
  }

  const move = async (assignmentId, nextDate) => {
    await coachBackend.rescheduleAssignment(assignmentId, nextDate)
    setNotice('Workout moved and athlete notified.')
    await onRefresh?.()
    await reloadSchedule()
  }

  const cancelItem = async (assignment) => {
    if (!confirm(`Cancel ${assignment.title}? It will be removed from active schedules.`)) return
    await coachBackend.cancelAssignment(assignment.id)
    setNotice('Assignment cancelled.')
    await onRefresh?.()
    await reloadSchedule()
  }

  const deleteItem = async (assignment) => {
    if (!confirm(`Permanently delete ${assignment.title} everywhere?`)) return
    await coachBackend.deleteAssignment(assignment.id)
    setNotice('Assignment deleted everywhere.')
    await onRefresh?.()
    await reloadSchedule()
  }

  const duplicateWeek = async () => {
    const sourceStart = dateKey(mondayOf(anchor))
    const sourceEnd = dateKey(addDays(mondayOf(anchor), 6))
    await coachBackend.duplicateAssignmentWeek({ startDate: sourceStart, endDate: sourceEnd, athleteId: clientId || null })
    setAnchor(addDays(anchor, 7))
    setNotice('Week duplicated forward.')
    await onRefresh?.()
    await reloadSchedule()
  }

  return <section className="coach-calendar-screen">
    <SectionHeader eyebrow="PROGRAMMING CALENDAR" title="Coach Calendar" description="Schedule, move, and repeat training from one weekly workspace." action={<button className="gold-button machined" onClick={() => setShowComposer(true)}><Plus size={16}/>Schedule</button>}/>
    <div className="coach-calendar-toolbar">
      <div className="coach-calendar-nav"><button onClick={() => setAnchor(addDays(anchor,-7))}><ChevronLeft size={17}/></button><strong>{formatShort(days[0])} – {formatShort(days[6])}</strong><button onClick={() => setAnchor(addDays(anchor,7))}><ChevronRight size={17}/></button></div>
      <select value={clientId} onChange={(event) => setClientId(event.target.value)}><option value="">All clients</option>{clients.map((client) => <option key={client.id} value={client.athlete_id}>{client.athlete_email}</option>)}</select>
      <button className="coach-secondary-button" onClick={duplicateWeek}><Copy size={15}/>Duplicate Week</button>
    </div>
    {notice && <p className="coach-hub-notice">{notice}</p>}
    <div className="coach-week-grid">
      {days.map((day) => {
        const key = dateKey(day)
        return <section className="coach-calendar-day" key={key} onDragOver={(event)=>event.preventDefault()} onDrop={(event)=>{const id=event.dataTransfer.getData('assignment-id');if(id)move(id,key)}}>
          <header><strong>{day.toLocaleDateString([], { weekday:'short' })}</strong><span>{day.getDate()}</span></header>
          <div>{(byDate[key] ?? []).map((assignment) => <article key={`${assignment.id}-${assignment.kind}`} draggable={assignment.kind==='workout'} onDragStart={(event)=>{if(assignment.kind==='workout')event.dataTransfer.setData('assignment-id',assignment.id)}} className={`priority-${assignment.priority??'normal'}`}><strong>{assignment.title}</strong><span>{clients.find((client)=>client.athlete_id===assignment.athlete_id)?.athlete_email ?? 'Athlete'}</span><small>{assignment.kind==='workout'?assignment.status:assignment.kind}</small>{assignment.kind==='workout'&&<div className="coach-calendar-item-actions"><button onClick={(event)=>{event.stopPropagation();cancelItem(assignment)}}>Cancel</button><button className="danger" onClick={(event)=>{event.stopPropagation();deleteItem(assignment)}}><Trash2 size={13}/>Delete</button></div>}</article>)}</div>
        </section>
      })}
    </div>
    {!visible.length && <EmptyState icon={CalendarDays} title="Nothing scheduled" description="Schedule a workout, rest day, or deload day for a client."/>}
    {showComposer && <div className="coach-designer-backdrop"><section className="coach-schedule-composer"><header><div><span className="eyebrow">NEW SCHEDULE ITEM</span><h2>Plan the day</h2></div><button onClick={()=>setShowComposer(false)}><Trash2 size={17}/></button></header>
      <label><span>Client</span><select value={draft.athleteId} onChange={(event)=>setDraft((current)=>({...current,athleteId:event.target.value}))}><option value="">Select client</option>{clients.map((client)=><option key={client.id} value={client.athlete_id}>{client.athlete_email}</option>)}</select></label>
      <label><span>Type</span><select value={draft.kind} onChange={(event)=>setDraft((current)=>({...current,kind:event.target.value}))}><option value="workout">Workout</option><option value="rest">Rest day</option><option value="deload">Deload day</option></select></label>
      {draft.kind==='workout' && <label><span>Workout or template</span><select value={draft.templateId} onChange={(event)=>setDraft((current)=>({...current,templateId:event.target.value}))}><option value="">Choose workout</option>{availableWorkouts.map((item)=><option key={item.id} value={item.id}>{item.name}</option>)}</select></label>}
      <label><span>Date</span><input type="date" value={draft.dueDate} onChange={(event)=>setDraft((current)=>({...current,dueDate:event.target.value}))}/></label>
      <label><span>Custom title</span><input value={draft.title} onChange={(event)=>setDraft((current)=>({...current,title:event.target.value}))} placeholder="Optional"/></label>
      <label><span>Coach notes</span><textarea rows={4} value={draft.notes} onChange={(event)=>setDraft((current)=>({...current,notes:event.target.value}))}/></label>
      <button className="gold-button machined" onClick={create}><RefreshCcw size={16}/>Publish Schedule</button>
    </section></div>}
  </section>
}
