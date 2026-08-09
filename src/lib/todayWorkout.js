import {
  assignmentDisplayName,
  resolveActiveCoachAssignment,
} from './coachAssignments'

const todayKey = (date = new Date()) =>
  new Date(date).toISOString().slice(0, 10)

const normalizeWorkoutName = (value) => {
  if (!value) return null
  if (typeof value === 'string') return value
  if (typeof value === 'object' && value.name) return String(value.name)
  return null
}

export const WORKOUT_SOURCE = {
  ACTIVE: 'active',
  COACH_ASSIGNMENT: 'coach-assignment',
  SELECTED: 'selected',
  SCHEDULED: 'scheduled',
  PROGRAM: 'program',
  NONE: 'none',
}

const resolveAssignment = (context = {}, now = new Date()) =>
  context.activeCoachAssignment ??
  resolveActiveCoachAssignment(context.assignments ?? [], now) ??
  context.assignmentDueToday ??
  null

/**
 * Resolves today's canonical workout using the same priority as the athlete app:
 *
 * 1. Active workout in progress
 * 2. Active coach assignment (assigned/started)
 * 3. state.selectedWorkout
 * 4. Weekly schedule entry for today (when not Rest)
 * 5. program.nextWorkout
 */
export const resolveTodayWorkoutContext = (state = {}, context = {}) => {
  const now = context.now ?? new Date()
  const activeAssignment = resolveAssignment(context, now)
  const scheduled = state.weeklySchedule?.[now.getDay()] ?? null
  const isRestDay = scheduled === 'Rest'

  if (state.activeWorkout?.name) {
    return {
      workoutId: state.activeWorkout.id ?? state.activeWorkout.name,
      id: state.activeWorkout.id ?? state.activeWorkout.name,
      name: state.activeWorkout.name,
      workoutName: state.activeWorkout.name,
      displayName: state.activeWorkout.name,
      source: WORKOUT_SOURCE.ACTIVE,
      assignmentId: state.activeWorkout.assignmentId ?? null,
      coachAssigned: Boolean(state.activeWorkout.assignmentId),
      isStartable: false,
      startable: false,
      isRestDay: false,
      scheduledWorkout: scheduled,
      scheduledFor: todayKey(now),
      date: todayKey(now),
      assignment: null,
    }
  }

  if (activeAssignment) {
    const assignmentName = assignmentDisplayName(activeAssignment)
    if (assignmentName) {
      return {
        workoutId: activeAssignment.id,
        id: activeAssignment.id,
        name: assignmentName,
        workoutName: assignmentName,
        displayName: assignmentName,
        source: WORKOUT_SOURCE.COACH_ASSIGNMENT,
        assignmentId: activeAssignment.id,
        coachAssigned: true,
        isStartable: Boolean(
          activeAssignment.workout_payload?.exercises?.length,
        ),
        startable: Boolean(
          activeAssignment.workout_payload?.exercises?.length,
        ),
        isRestDay: false,
        scheduledWorkout: scheduled,
        scheduledFor:
          activeAssignment.due_date ??
          activeAssignment.scheduled_date ??
          todayKey(now),
        date: todayKey(now),
        assignment: activeAssignment,
      }
    }
  }

  const name =
    normalizeWorkoutName(state.selectedWorkout) ||
    (scheduled && scheduled !== 'Rest' ? scheduled : null) ||
    normalizeWorkoutName(state.program?.nextWorkout) ||
    null

  let source = WORKOUT_SOURCE.NONE
  if (name) {
    if (state.selectedWorkout && name === state.selectedWorkout) {
      source = WORKOUT_SOURCE.SELECTED
    } else if (scheduled && scheduled !== 'Rest' && name === scheduled) {
      source = WORKOUT_SOURCE.SCHEDULED
    } else if (
      state.program?.nextWorkout &&
      name === normalizeWorkoutName(state.program.nextWorkout)
    ) {
      source = WORKOUT_SOURCE.PROGRAM
    } else {
      source = WORKOUT_SOURCE.SELECTED
    }
  }

  return {
    workoutId: name,
    id: name,
    name,
    workoutName: name,
    displayName: name,
    source,
    assignmentId: null,
    coachAssigned: false,
    isStartable: Boolean(name && state.program?.workouts?.[name]),
    startable: Boolean(name && state.program?.workouts?.[name]),
    isRestDay: isRestDay && !name,
    scheduledWorkout: scheduled,
    scheduledFor: todayKey(now),
    date: todayKey(now),
    assignment: null,
  }
}

export const resolveTodayWorkoutName = (state = {}, context = {}) =>
  resolveTodayWorkoutContext(state, context).name
