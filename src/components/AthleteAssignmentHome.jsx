import { CalendarDays, ChevronRight, ClipboardList } from 'lucide-react'
import { useEffect, useState } from 'react'
import { coachBackend } from '../lib/coachBackend'

const dueLabel = (value) => {
  if (!value) return 'No due date'
  const due = new Date(`${value}T12:00:00`)
  const today = new Date(); today.setHours(12,0,0,0)
  const days = Math.round((due - today) / 86400000)
  if (days === 0) return 'Due today'
  if (days === 1) return 'Due tomorrow'
  if (days < 0) return `${Math.abs(days)} day${Math.abs(days) === 1 ? '' : 's'} overdue`
  return `Due ${due.toLocaleDateString([], { month: 'short', day: 'numeric' })}`
}

export default function AthleteAssignmentHome({ onStartAssignment }) {
  const [assignment, setAssignment] = useState(null)
  useEffect(() => {
    coachBackend.listAthleteAssignments().then((items) => setAssignment(items[0] ?? null)).catch(() => {})
  }, [])
  if (!assignment) return null
  return (
    <section className="home-assignment-feature">
      <div className="home-assignment-icon"><ClipboardList size={22} /></div>
      <div className="home-assignment-copy">
        <span className="eyebrow">TODAY’S ASSIGNMENT</span>
        <h2>{assignment.title}</h2>
        {assignment.coach_notes && <p>{assignment.coach_notes}</p>}
        <small><CalendarDays size={14} />{dueLabel(assignment.due_date)}</small>
      </div>
      <button className="gold-button machined" onClick={() => onStartAssignment?.(assignment)}>
        Start <ChevronRight size={17} />
      </button>
    </section>
  )
}
