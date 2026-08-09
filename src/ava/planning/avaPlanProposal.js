import {
  CONSTRAINT_TYPES,
  createEmptyDailyPlan,
  createEmptyWeekPlan,
  DAY_STATUS,
  EXECUTION_FOCUS_PRIORITY,
  PLAN_CHANGE_ACTIONS,
  PLAN_TYPES,
  PROPOSAL_STATUS,
  PROPOSAL_TYPES,
  PRIORITY_MODE,
} from './avaPlanTypes'
import {
  dayNameToIndex,
  mapWeekDayToPlanDay,
} from './avaPlanningContext'
import { coachProgramProtectedCopy } from '../../lib/planOwnership'
import {
  createSessionExecutionPlan,
  deriveExercisePriority,
  resolvePriorityMode,
} from '../../lib/sessionExecutionPlan'

const proposalId = () =>
  `plan-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`

const formatWorkoutLabel = (name) =>
  name ? String(name).replace(/\s*\+\s*/g, ' & ') : null

export const buildDailyPlan = (context = {}) => {
  const workoutName = context.todayWorkout?.name ?? null
  const plan = createEmptyDailyPlan(context.todayKey)

  if (context.todayWorkout?.isRestDay && !workoutName) {
    plan.primaryAction = 'recovery'
    plan.recovery = 'Rest day'
    plan.rationale.push('Today is scheduled as rest in your weekly plan.')
    return plan
  }

  if (workoutName) {
    plan.primaryAction = 'train'
    plan.workout = workoutName
    plan.coachAssignment = context.coachAssignedToday
      ? { id: context.todayWorkout?.assignmentId ?? null, protected: true }
      : null

    if (context.readinessSummary === 'supports_training') {
      plan.readinessContext = 'Readiness supports training.'
      plan.rationale.push('Readiness supports training.')
    } else if (context.readinessSummary === 'caution') {
      plan.readinessContext = 'Readiness is lower — keep the main work focused.'
      plan.rationale.push('Readiness is lower than usual.')
    }

    if (context.coachAssignedToday) {
      plan.rationale.push('Coach-assigned session is on deck today.')
    } else if (context.todayWorkout?.source === 'scheduled') {
      plan.rationale.push('This matches your weekly plan for today.')
    }
  } else {
    plan.primaryAction = 'open'
    plan.rationale.push('No workout is locked in for today yet.')
  }

  return plan
}

export const buildWeekPlan = (context = {}) => {
  const plan = createEmptyWeekPlan(context.weekStart)
  plan.days = (context.trainingWeek ?? []).map((day) => mapWeekDayToPlanDay(day, context))
  return plan
}

const findMoveTargetDay = (trainingWeek = [], unavailableDayIndex = null) => {
  if (unavailableDayIndex == null) return null

  const candidates = trainingWeek.filter(
    (day) =>
      day.dayIndex !== unavailableDayIndex &&
      !day.isPast &&
      (day.plannedWorkout === 'Rest' || !day.plannedWorkout) &&
      day.status !== 'completed',
  )

  const before = candidates.filter((day) => day.dayIndex < unavailableDayIndex)
  const after = candidates.filter((day) => day.dayIndex > unavailableDayIndex)

  return (before.at(-1) ?? after[0] ?? null)?.dayIndex ?? null
}

const resolveUnavailableDayIndex = (context = {}, constraint = null) => {
  if (constraint?.value) {
    const named = dayNameToIndex(constraint.value)
    if (named != null) return named
  }
  return null
}

export const buildPlanDiff = (currentPlan = {}, proposedPlan = {}) => {
  const changes = []
  const currentDays = currentPlan.week?.days ?? []
  const proposedDays = proposedPlan.week?.days ?? []

  for (const proposedDay of proposedDays) {
    const currentDay = currentDays.find((day) => day.date === proposedDay.date)
    if (!currentDay) continue

    if (currentDay.assignedSession !== proposedDay.proposedSession) {
      if (proposedDay.proposedSession && proposedDay.proposedSession !== currentDay.assignedSession) {
        changes.push({
          kind: 'assign',
          date: proposedDay.date,
          dayName: proposedDay.dayName,
          from: currentDay.assignedSession,
          to: proposedDay.proposedSession,
        })
      }
    }

    if (
      currentDay.assignedSession &&
      proposedDay.proposedSession === null &&
      proposedDay.status === DAY_STATUS.RECOVERY
    ) {
      changes.push({
        kind: 'recovery',
        date: proposedDay.date,
        dayName: proposedDay.dayName,
        from: currentDay.assignedSession,
        to: 'Recovery',
      })
    }
  }

  if (
    currentPlan.daily?.workout &&
    proposedPlan.daily?.sessionExecutionPlan?.maxMinutes &&
    !currentPlan.daily?.sessionExecutionPlan
  ) {
    changes.push({
      kind: 'shorten',
      date: currentPlan.daily.date,
      workout: currentPlan.daily.workout,
      from: 'Full session',
      to: `${proposedPlan.daily.sessionExecutionPlan.maxMinutes} min focus`,
    })
  }

  return changes
}

export const buildAdaptiveChanges = (context = {}, proposedWeek = null, proposedDaily = null) => {
  const changes = []
  const constraints = context.constraints ?? []

  for (const constraint of constraints) {
    if (constraint.type === CONSTRAINT_TYPES.TIME_LIMIT && proposedDaily?.workout) {
      changes.push({
        action: PLAN_CHANGE_ACTIONS.SHORTEN_SESSION,
        target: 'today',
        targetDate: context.todayKey,
        sessionName: proposedDaily.workout,
        value: constraint.value,
        meta: {
          executionOnly: context.coachProgramProtected === true,
        },
      })
      changes.push({
        action: PLAN_CHANGE_ACTIONS.SET_SESSION_EXECUTION_FOCUS,
        target: 'today',
        targetDate: context.todayKey,
        sessionName: proposedDaily.workout,
        value: {
          maxMinutes: constraint.value,
          priority: EXECUTION_FOCUS_PRIORITY.MAIN_WORK,
        },
      })
    }

    if (
      constraint.type === CONSTRAINT_TYPES.TRAVEL ||
      constraint.type === CONSTRAINT_TYPES.UNAVAILABLE_DAY
    ) {
      const unavailableDayIndex = resolveUnavailableDayIndex(context, constraint)
      const weekDay =
        proposedWeek?.days?.find((day) => day.dayIndex === unavailableDayIndex) ??
        context.trainingWeek?.find((day) => day.dayIndex === unavailableDayIndex)

      if (weekDay?.assignedSession || weekDay?.plannedWorkout) {
        const sessionName = weekDay.assignedSession ?? weekDay.plannedWorkout
        const targetDayIndex = findMoveTargetDay(context.trainingWeek, unavailableDayIndex)

        if (targetDayIndex != null && sessionName && sessionName !== 'Rest') {
          if (context.scheduleControlledByCoach) {
            changes.push({
              action: PLAN_CHANGE_ACTIONS.KEEP_PLAN_AS_IS,
              meta: {
                coachLockedSchedule: true,
                unavailableDay: weekDay.dayName ?? null,
                sessionName,
              },
            })
          } else {
            changes.push({
              action: PLAN_CHANGE_ACTIONS.MOVE_SESSION,
              targetSessionName: sessionName,
              fromDayIndex: unavailableDayIndex,
              toDayIndex: targetDayIndex,
              fromDate: weekDay.date ?? weekDay.dateKey,
              toDate:
                context.trainingWeek?.find((day) => day.dayIndex === targetDayIndex)?.dateKey ??
                null,
              meta: {
                reason: constraint.type,
                scheduleOnly: true,
              },
            })
          }
        } else if (sessionName && sessionName !== 'Rest') {
          changes.push({
            action: PLAN_CHANGE_ACTIONS.MARK_RECOVERY_DAY,
            targetDayIndex: unavailableDayIndex,
            fromDate: weekDay.date ?? weekDay.dateKey,
            sessionName,
          })
        }
      }
    }

    if (constraint.type === CONSTRAINT_TYPES.MISSED_SESSION) {
      const missed = context.missedDays?.[0] ?? null
      const todayHasSession = Boolean(context.todayDay?.plannedWorkout && context.todayDay.plannedWorkout !== 'Rest')

      if (missed && todayHasSession) {
        changes.push({
          action: PLAN_CHANGE_ACTIONS.KEEP_PLAN_AS_IS,
          target: 'today',
          meta: {
            missedSession: missed.plannedWorkout,
            missedDate: missed.dateKey,
            avoidStacking: true,
          },
        })
      } else if (missed) {
        changes.push({
          action: PLAN_CHANGE_ACTIONS.PRIORITIZE_SESSION,
          targetSessionName: missed.plannedWorkout,
          targetDate: missed.dateKey,
          meta: { missedRecovery: true },
        })
      }
    }

    if (constraint.type === CONSTRAINT_TYPES.LIGHTER_WEEK) {
      changes.push({
        action: PLAN_CHANGE_ACTIONS.SHORTEN_SESSION,
        target: 'today',
        value: 30,
        meta: { lighterWeek: true, executionOnly: true },
      })
    }

    if (
      (constraint.type === CONSTRAINT_TYPES.SUBJECTIVE_RECOVERY ||
        constraint.type === CONSTRAINT_TYPES.PAIN_OR_DISCOMFORT ||
        constraint.type === CONSTRAINT_TYPES.EFFORT_PREFERENCE ||
        constraint.type === CONSTRAINT_TYPES.LIGHTER_WEEK) &&
      proposedDaily?.workout
    ) {
      changes.push({
        action: PLAN_CHANGE_ACTIONS.SHORTEN_SESSION,
        target: 'today',
        sessionName: proposedDaily.workout,
        value: 30,
        meta: { executionOnly: true, subjective: true },
      })
      changes.push({
        action: PLAN_CHANGE_ACTIONS.SET_SESSION_EXECUTION_FOCUS,
        target: 'today',
        sessionName: proposedDaily.workout,
        value: {
          maxMinutes: 30,
          priority: EXECUTION_FOCUS_PRIORITY.PRIORITY_MOVEMENTS,
        },
      })
    }
  }

  return changes
}

export const applyChangesToWeekPlan = (weekPlan = {}, changes = []) => {
  const next = {
    ...weekPlan,
    days: (weekPlan.days ?? []).map((day) => ({ ...day })),
  }

  for (const change of changes) {
    if (change.action === PLAN_CHANGE_ACTIONS.MOVE_SESSION) {
      const fromDay = next.days.find((day) => day.dayIndex === change.fromDayIndex)
      const toDay = next.days.find((day) => day.dayIndex === change.toDayIndex)
      if (!fromDay || !toDay) continue

      toDay.proposedSession = change.targetSessionName
      fromDay.proposedSession = null
      fromDay.status = DAY_STATUS.RECOVERY
      fromDay.rationale.push(`Moved ${change.targetSessionName} to ${toDay.dayName}.`)
      toDay.rationale.push(`Makes room for travel/unavailability on ${fromDay.dayName}.`)
    }

    if (change.action === PLAN_CHANGE_ACTIONS.MARK_RECOVERY_DAY) {
      const day = next.days.find((day) => day.dayIndex === change.targetDayIndex)
      if (!day) continue
      day.proposedSession = null
      day.status = DAY_STATUS.RECOVERY
      day.rationale.push('Marked as recovery because you are unavailable.')
    }
  }

  return next
}

export const applyChangesToDailyPlan = (dailyPlan = {}, changes = [], context = {}) => {
  const next = { ...dailyPlan }
  const shorten = changes.find(
    (change) =>
      change.action === PLAN_CHANGE_ACTIONS.SHORTEN_SESSION ||
      change.action === PLAN_CHANGE_ACTIONS.SET_SESSION_EXECUTION_FOCUS,
  )

  if (shorten?.value?.maxMinutes || typeof shorten?.value === 'number') {
    const maxMinutes =
      typeof shorten.value === 'number' ? shorten.value : shorten.value.maxMinutes
    const priority = deriveExercisePriority({
      exercises: context.workoutExercises ?? [],
      maxMinutes,
    })

    next.timeConstraint = maxMinutes
    next.sessionExecutionPlan = createSessionExecutionPlan({
      workoutId: context.todayWorkout?.id ?? next.workout,
      workoutName: next.workout,
      date: context.todayKey,
      maxMinutes,
      priorityMode: priority.priorityMode,
      exercises: context.workoutExercises ?? [],
      programmingOwner: context.ownership?.programmingOwner,
      coachAssigned: context.ownership?.coachAssigned,
      now: context.now,
    })
    next.priorityExercises = priority.priorityExerciseNames
    next.accessoryExercises = priority.accessoryExerciseNames

    if (priority.priorityMode === PRIORITY_MODE.MINIMUM_EFFECTIVE) {
      next.rationale.push(
        `Minimum-effective mode: keep ${priority.priorityExerciseNames.slice(0, 2).join(' and ') || 'the first priority movements'}.`,
      )
    } else {
      next.rationale.push(`User only has ${maxMinutes} minutes.`)
    }
    next.rationale.push('Keep the main work and trim extras.')
    if (context.ownership?.coachAssigned) {
      next.rationale.push(coachProgramProtectedCopy)
    }
  }

  return next
}

export const buildPlanEvidence = (context = {}, changes = []) => {
  const evidence = []

  for (const constraint of context.constraints ?? []) {
    if (constraint.type === CONSTRAINT_TYPES.TIME_LIMIT) {
      evidence.push(`You only have ${constraint.value} minutes.`)
    }
    if (constraint.type === CONSTRAINT_TYPES.TRAVEL) {
      evidence.push(
        constraint.value
          ? `You are traveling ${constraint.value}.`
          : 'You mentioned travel this week.',
      )
    }
    if (constraint.type === CONSTRAINT_TYPES.MISSED_SESSION) {
      const missed = context.missedDays?.[0]
      if (missed?.plannedWorkout) {
        evidence.push(`You missed ${missed.plannedWorkout} on ${missed.dayName}.`)
      }
    }
    if (constraint.type === CONSTRAINT_TYPES.UNAVAILABLE_DAY && constraint.value) {
      evidence.push(`You are unavailable ${constraint.value}.`)
    }
  }

  if (context.readinessSummary === 'supports_training') {
    evidence.push('Readiness supports training.')
  }

  if (context.coachAssignedToday) {
    evidence.push('Coach-assigned session stays intact — this adjusts execution only.')
  }

  if (changes.some((change) => change.meta?.avoidStacking)) {
    evidence.push('Today already has a session — avoid stacking two full workouts.')
  }

  return evidence
}

export const buildDailyPlanMessage = (dailyPlan = {}, context = {}) => {
  const workout = formatWorkoutLabel(dailyPlan.workout)

  if (!workout) {
    return dailyPlan.primaryAction === 'recovery'
      ? 'Today is a rest day in your plan. Recovery or light movement fits best.'
      : 'Nothing is locked in for today yet. Open your plan or pick a session when you are ready.'
  }

  if (dailyPlan.sessionExecutionPlan?.maxMinutes) {
    const priority = dailyPlan.priorityExercises?.length
      ? dailyPlan.priorityExercises.join(' and ')
      : 'the main work'
    const coachNote = context.ownership?.coachAssigned
      ? ` ${coachProgramProtectedCopy}`
      : ''
    return `You've only got ${dailyPlan.sessionExecutionPlan.maxMinutes} minutes. Keep ${priority} as the priority and trim accessories if time runs out.${coachNote}`
  }

  if (context.readinessSummary === 'caution') {
    return `I'd still train ${workout}, but keep it focused on the main work.`
  }

  if (context.ownership?.coachAssigned) {
    return `You've got ${workout} from your coach today. Start there and keep the session intentional.`
  }

  return `You've got ${workout} today. Start there and keep the session intentional.`
}

export const buildWeekPlanMessage = (proposedWeek = {}, diff = []) => {
  if (!diff.length) {
    const sessions = (proposedWeek.days ?? [])
      .filter((day) => day.assignedSession || day.proposedSession)
      .map((day) => `${day.dayName}: ${day.proposedSession ?? day.assignedSession}`)
    if (!sessions.length) {
      return 'This week is mostly open right now. Your plan can stay flexible until sessions are set.'
    }
    return `This week: ${sessions.slice(0, 3).join(' · ')}${sessions.length > 3 ? ' · …' : ''}.`
  }

  const firstMove = diff.find((entry) => entry.kind === 'assign' || entry.kind === 'recovery')
  if (firstMove) {
    return `I'd move ${firstMove.from} from ${firstMove.dayName} and keep the rest steady.`
  }

  const shorten = diff.find((entry) => entry.kind === 'shorten')
  if (shorten) {
    return `I'd keep ${shorten.workout} today, but trim it to ${shorten.to}.`
  }

  return 'Here is a tighter plan for the rest of this week.'
}

export const buildPlanProposal = ({
  context = {},
  intent = 'adaptive_plan',
} = {}) => {
  const currentDaily = buildDailyPlan(context)
  const currentWeek = buildWeekPlan(context)
  const changes = buildAdaptiveChanges(context, currentWeek, currentDaily)

  const proposedDaily = applyChangesToDailyPlan(currentDaily, changes, context)
  const proposedWeek = applyChangesToWeekPlan(currentWeek, changes)
  const diff = buildPlanDiff(
    { daily: currentDaily, week: currentWeek },
    { daily: proposedDaily, week: proposedWeek },
  )
  const evidence = buildPlanEvidence(context, changes)
  const rationale = [...new Set([...proposedDaily.rationale, ...evidence])]

  const hasMutation = changes.some(
    (change) => change.action !== PLAN_CHANGE_ACTIONS.KEEP_PLAN_AS_IS,
  )

  const type =
    intent === 'week_plan' || changes.some((change) => change.action === PLAN_CHANGE_ACTIONS.MOVE_SESSION)
      ? PROPOSAL_TYPES.WEEK
      : PROPOSAL_TYPES.DAILY

  const message =
    type === PROPOSAL_TYPES.WEEK
      ? buildWeekPlanMessage(proposedWeek, diff)
      : buildDailyPlanMessage(proposedDaily, context)

  const coachLockedChange = changes.find((change) => change.meta?.coachLockedSchedule)
  const resolvedMessage = coachLockedChange
    ? `That session is coach-scheduled for ${coachLockedChange.meta.unavailableDay ?? 'that day'}. I can suggest another day, but your coach would need to confirm the move.`
    : message

  const summary =
    diff.length > 0
      ? diff
          .slice(0, 2)
          .map((entry) =>
            entry.kind === 'shorten'
              ? `Shorten ${entry.workout}`
              : `${entry.kind === 'recovery' ? 'Clear' : 'Move'} ${entry.from ?? entry.workout}`,
          )
          .join(' · ')
      : message

  return {
    id: proposalId(),
    type,
    planType: type === PROPOSAL_TYPES.WEEK ? PLAN_TYPES.WEEK : PLAN_TYPES.DAILY,
    status: hasMutation ? PROPOSAL_STATUS.AWAITING_CONFIRMATION : PROPOSAL_STATUS.DRAFT,
    summary,
    message: resolvedMessage,
    currentPlan: {
      daily: currentDaily,
      week: currentWeek,
    },
    proposedPlan: {
      daily: proposedDaily,
      week: proposedWeek,
    },
    changes,
    diff,
    rationale,
    evidence,
    currentPlanSnapshot: context.planSnapshot,
    createdAt: new Date(context.now ?? Date.now()).toISOString(),
    allowedRoles: ['athlete'],
    coachProgramProtected: context.coachProgramProtected === true,
    coachProgramProtectedCopy: context.ownership?.coachAssigned
      ? coachProgramProtectedCopy
      : null,
    priorityExercises: proposedDaily.priorityExercises ?? [],
    accessoryExercises: proposedDaily.accessoryExercises ?? [],
    ownership: context.ownership ?? null,
    requiresConfirmation: hasMutation,
  }
}

export const buildDailyPlanResponse = (context = {}) => {
  const daily = buildDailyPlan(context)
  const message = buildDailyPlanMessage(daily, context)

  return {
    kind: 'daily_response',
    message,
    dailyPlan: daily,
    actions: daily.workout
      ? [
          { id: 'START_TODAYS_WORKOUT', label: 'Start workout' },
          { id: 'OPEN_PLANNER', label: 'View plan' },
        ]
      : [{ id: 'OPEN_PLANNER', label: 'View plan' }],
  }
}

export const explainProposal = (proposal = {}) => {
  const lines = proposal.evidence?.length
    ? proposal.evidence
    : proposal.rationale?.length
      ? proposal.rationale
      : ['This keeps your current plan steady.']

  return lines.slice(0, 4).join(' ')
}
