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
import { useMemo, useState } from 'react'
import { buildAthleteAppointmentContextLine } from '../ava/coach/avaAthleteAppointmentPipeline'
import WorkoutSelector from '../components/WorkoutSelector'
import { useAthleteAppointments } from '../hooks/useAthleteAppointments'
import {
  listProgramWorkoutChoices,
  normalizeProgramWorkoutName,
  resolveWorkoutDaySummary,
} from '../lib/programWorkout'
import { buildPlanningOwnership, coachOwnershipLabel } from '../lib/planOwnership'
import {
  executionPlanSummaryLabel,
  isExecutionPlanCurrent,
} from '../lib/sessionExecutionPlan'
import { sessionModeLabel } from '../lib/sessionMode'
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

export default function TrainHubScreen({
  state,
  onStart,
  navigate,
  onSelectWorkout,
}) {
  const activeWorkout = state.activeWorkout
  const [showWorkoutSelector, setShowWorkoutSelector] = useState(false)
  const { upcomingAppointments } = useAthleteAppointments()

  const todayContext = useMemo(
    () => resolveTodayWorkoutContext(state),
    [state],
  )
  const workoutDaySummary = useMemo(
    () =>
      resolveWorkoutDaySummary(state, { todayWorkoutContext: todayContext }),
    [state, todayContext],
  )
  const programWorkouts = useMemo(
    () => listProgramWorkoutChoices(state),
    [state],
  )
  const recommendedWorkout =
    workoutDaySummary.nextRecommendedWorkout ??
    normalizeProgramWorkoutName(state.program?.nextWorkout) ??
    state.program?.rotation?.[0] ??
    null
  const appointmentContext = useMemo(
    () =>
      buildAthleteAppointmentContextLine(upcomingAppointments, {
        assignmentId:
          activeWorkout?.assignmentId ?? todayContext.assignmentId ?? null,
      }),
    [upcomingAppointments, activeWorkout?.assignmentId, todayContext.assignmentId],
  )
  const coachLabel = useMemo(() => {
    const fromSession = sessionModeLabel(activeWorkout?.sessionMode)
    if (fromSession) return fromSession
    return coachOwnershipLabel(
      buildPlanningOwnership({ todayWorkout: todayContext }),
    )
  }, [activeWorkout?.sessionMode, todayContext])
  const executionFocusLabel = useMemo(() => {
    if (!isExecutionPlanCurrent(state.sessionExecutionPlan)) return null
    return executionPlanSummaryLabel(state.sessionExecutionPlan)
  }, [state.sessionExecutionPlan])

  const heroTitle = activeWorkout
    ? activeWorkout.name
    : workoutDaySummary.completedToday
      ? 'Workout complete'
      : todayContext.displayName ?? recommendedWorkout ?? 'Open schedule'

  const heroCopy = activeWorkout
    ? 'Continue exactly where you left off.'
    : workoutDaySummary.completedToday
      ? `${workoutDaySummary.completedWorkoutName} · Today${
          workoutDaySummary.nextRecommendedWorkout
            ? `. Next: ${workoutDaySummary.nextRecommendedWorkout} tomorrow.`
            : ''
        }`
      : 'Your selected workout is ready when you are.'

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
          <h2>{heroTitle}</h2>
          {appointmentContext ? (
            <p className="train-appointment-context">{appointmentContext}</p>
          ) : null}
          {executionFocusLabel ? (
            <p className="train-execution-focus">{executionFocusLabel} active</p>
          ) : null}
          <p>{heroCopy}</p>
        </div>
        <button className="gold-button machined" onClick={onStart}>
          <Dumbbell size={18} />
          {activeWorkout ? 'Resume Workout' : 'Start Session'}
          <ArrowRight size={17} />
        </button>
        {!activeWorkout && programWorkouts.length > 1 ? (
          <button
            type="button"
            className="ui-btn-secondary athlete-choose-workout-action train-choose-workout-link"
            onClick={() => setShowWorkoutSelector(true)}
          >
            Choose another workout
            <ArrowRight size={16} />
          </button>
        ) : null}
      </section>

      <section className="train-hub-grid">
        <ActionCard icon={CalendarDays} title="Weekly Plan" description="Organize your training week" onClick={() => navigate('planner')} />
        <ActionCard icon={Settings2} title="Workout Builder" description="Create or edit workouts" onClick={() => navigate('builder')} />
        <ActionCard icon={History} title="Workout History" description="Review sessions, sets, and notes" onClick={() => navigate('history')} />
        <ActionCard icon={Hammer} title="The Forge" description="Achievements and milestones" onClick={() => navigate('forge')} />
        <ActionCard icon={ListChecks} title="Exercise Library" description="Browse movements in your programs" onClick={() => navigate('builder')} />
        <ActionCard icon={BookOpen} title="Programs" description="Program scheduling lives in Coach Hub today" onClick={() => navigate('more')} />
      </section>

      {showWorkoutSelector ? (
        <WorkoutSelector
          workouts={programWorkouts}
          recommendedWorkout={recommendedWorkout}
          selectedWorkout={state.selectedWorkout}
          onSelect={(workout) => {
            onSelectWorkout?.(workout)
            setShowWorkoutSelector(false)
          }}
          onClose={() => setShowWorkoutSelector(false)}
          onOpenBuilder={() => {
            setShowWorkoutSelector(false)
            navigate('builder')
          }}
        />
      ) : null}
    </div>
  )
}
