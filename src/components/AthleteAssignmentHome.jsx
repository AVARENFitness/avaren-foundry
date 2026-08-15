import {
  CalendarDays,
  ChevronRight,
  ClipboardList,
  Moon,
  RefreshCcw,
} from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { coachBackend } from '../lib/coachBackend'
import AssignmentExercisePreview from './AssignmentExercisePreview'

const dueLabel = (value) => {
  if (!value) return 'No due date'
  const due = new Date(`${value}T12:00:00`)
  const today = new Date(); today.setHours(12,0,0,0)
  const days = Math.round((due - today) / 86400000)
  if (days === 0) return 'Today'
  if (days === 1) return 'Tomorrow'
  if (days < 0) return `${Math.abs(days)} day${Math.abs(days) === 1 ? '' : 's'} overdue`
  return due.toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' })
}

export default function AthleteAssignmentHome({ onStartAssignment, compact = false }) {
  const [assignments, setAssignments] = useState([])
  const [schedule, setSchedule] = useState([])

  useEffect(() => {
    const start = new Date().toISOString().slice(0,10)
    const endDate = new Date(); endDate.setDate(endDate.getDate()+14)
    Promise.all([
      coachBackend.listAthleteAssignments(),
      coachBackend.listAthleteSchedule({ startDate:start, endDate:endDate.toISOString().slice(0,10) }).catch(()=>[]),
    ]).then(([nextAssignments,nextSchedule])=>{setAssignments(nextAssignments);setSchedule(nextSchedule)}).catch(()=>{})
  }, [])

  const upcoming = useMemo(() => {
    const restItems = schedule.filter(item => item.kind !== 'workout')
    return [...assignments.map(item=>({...item,kind:'workout',scheduled_date:item.due_date})),...restItems]
      .filter(item=>item.scheduled_date)
      .sort((a,b)=>String(a.scheduled_date).localeCompare(String(b.scheduled_date)))
      .slice(0,4)
  }, [assignments,schedule])

  if (!upcoming.length) return null
  const primary = upcoming[0]
  const isWorkout = primary.kind === 'workout'
  return <section className={`athlete-schedule-feature ${compact ? 'athlete-schedule-feature--compact' : ''}`}>
    <header><div><span className="eyebrow">YOUR SCHEDULE</span><h2>{isWorkout ? primary.title : primary.title || (primary.kind==='rest'?'Rest Day':'Deload Day')}</h2><p>{primary.coach_notes || primary.notes || (isWorkout?'Your next coached session is ready.':'Recovery is part of the program.')}</p><small><CalendarDays size={14}/>{dueLabel(primary.scheduled_date)}</small>{isWorkout ? <AssignmentExercisePreview exercises={primary.workout_payload?.exercises ?? []} coachNotes="" compact /> : null}</div>{isWorkout?<button className={compact ? 'avaren-secondary-button athlete-schedule-start' : 'gold-button machined'} onClick={()=>onStartAssignment?.(primary)}>Start Session <ChevronRight size={17}/></button>:<div className="athlete-schedule-kind">{primary.kind==='rest'?<Moon size={20}/>:<RefreshCcw size={20}/>}<span>{primary.kind}</span></div>}</header>
    {upcoming.length>1&&<div className="athlete-upcoming-strip">{upcoming.slice(1).map(item=><article key={`${item.id}-${item.kind}`}><span>{item.kind==='workout'?<ClipboardList size={15}/>:item.kind==='rest'?<Moon size={15}/>:<RefreshCcw size={15}/>}</span><div><strong>{item.title}</strong><small>{dueLabel(item.scheduled_date)}</small></div></article>)}</div>}
  </section>
}
