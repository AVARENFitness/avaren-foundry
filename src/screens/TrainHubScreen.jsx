import {
  ArrowRight,
  BookOpen,
  CalendarDays,
  Dumbbell,
  Hammer,
  History,
  ListChecks,
  Settings2,
} from 'lucide-react'
import { useMemo } from 'react'
import { buildPlanningOwnership, coachOwnershipLabel } from '../lib/planOwnership'
import {
  executionPlanSummaryLabel,
  isExecutionPlanCurrent,
} from '../lib/sessionExecutionPlan'
import { resolveTodayWorkoutContext } from '../lib/todayWorkout'

const ActionCard = ({ icon: Icon, title, description, onClick, primary = false }) => (
  <button
    className={`train-hub-card ${primary ? 'primary' : ''}`}
    onClick={onClick}
  >
    <span className="train-hub-card-icon"><Icon size={20} /></span>
    <span>
      <strong>{title}</strong>
      <small>{description}</small>
    </span>
    <ArrowRight size={17} />
  </button>
)

export default function TrainHubScreen({ state, onStart, navigate }) {
  const activeWorkout = state.activeWorkout
  const todayContext = useMemo(
    () => resolveTodayWorkoutContext(state),
    [state],
  )
  const coachLabel = useMemo(
    () =>
      coachOwnershipLabel(
        buildPlanningOwnership({ todayWorkout: todayContext }),
      ),
    [todayContext],
  )
  const executionFocusLabel = useMemo(() => {
    if (!isExecutionPlanCurrent(state.sessionExecutionPlan)) return null
    return executionPlanSummaryLabel(state.sessionExecutionPlan)
  }, [state.sessionExecutionPlan])

  const nextWorkout =
    activeWorkout?.name ||
    todayContext.displayName ||
    state.selectedWorkout ||
    state.program?.nextWorkout

  return (
    <div className="train-hub-screen">
      <header className="train-hub-header">
        <span className="eyebrow">TRAIN</span>
        <h1>Your training, organized.</h1>
        <p>Start today’s session or open the exact training tool you need.</p>
      </header>

      <section className="train-hub-hero">
        <div>
          <span className="eyebrow">{activeWorkout ? 'IN PROGRESS' : 'UP NEXT'}</span>
          {coachLabel ? (
            <span className="train-coach-ownership eyebrow">{coachLabel}</span>
          ) : null}
          <h2>{nextWorkout}</h2>
          {executionFocusLabel ? (
            <p className="train-execution-focus">{executionFocusLabel} active</p>
          ) : null}
          <p>{activeWorkout ? 'Continue exactly where you left off.' : 'Your selected workout is ready when you are.'}</p>
        </div>
        <button className="gold-button machined" onClick={onStart}>
          <Dumbbell size={18} />
          {activeWorkout ? 'Continue Workout' : 'Start Workout'}
          <ArrowRight size={17} />
        </button>
      </section>

      <section className="train-hub-grid">
        <ActionCard icon={CalendarDays} title="Weekly Plan" description="Organize your training week" onClick={() => navigate('planner')} />
        <ActionCard icon={Settings2} title="Workout Builder" description="Create or edit workouts" onClick={() => navigate('builder')} />
        <ActionCard icon={History} title="Workout History" description="Review sessions, sets, and notes" onClick={() => navigate('history')} />
        <ActionCard icon={Hammer} title="The Forge" description="Achievements and milestones" onClick={() => navigate('forge')} />
        <ActionCard icon={ListChecks} title="Exercise Library" description="Browse movements in your programs" onClick={() => navigate('builder')} />
        <ActionCard icon={BookOpen} title="Programs" description="Program scheduling lives in Coach Hub today" onClick={() => navigate('more')} />
      </section>
    </div>
  )
}
