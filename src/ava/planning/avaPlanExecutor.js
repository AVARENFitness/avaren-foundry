import { PLAN_CHANGE_ACTIONS, PROPOSAL_STATUS } from './avaPlanTypes'
import { createSessionExecutionPlan } from '../../lib/sessionExecutionPlan'

export const applyWeeklyScheduleMove = ({
  weeklySchedule = {},
  fromDayIndex,
  toDayIndex,
}) => {
  const next = { ...weeklySchedule }
  const sessionName = next[fromDayIndex]
  if (!sessionName || sessionName === 'Rest') {
    return { ok: false, reason: 'empty_source_day' }
  }

  if (next[toDayIndex] && next[toDayIndex] !== 'Rest') {
    return { ok: false, reason: 'destination_collision' }
  }

  next[toDayIndex] = sessionName
  next[fromDayIndex] = 'Rest'

  return {
    ok: true,
    weeklySchedule: next,
    rollback: {
      action: PLAN_CHANGE_ACTIONS.MOVE_SESSION,
      fromDayIndex,
      toDayIndex,
      previousWeeklySchedule: { ...weeklySchedule },
    },
  }
}

export const applyRecoveryDay = ({ weeklySchedule = {}, targetDayIndex }) => {
  const next = { ...weeklySchedule }
  const previous = next[targetDayIndex]
  next[targetDayIndex] = 'Rest'

  return {
    ok: true,
    weeklySchedule: next,
    rollback: {
      action: PLAN_CHANGE_ACTIONS.MARK_RECOVERY_DAY,
      targetDayIndex,
      previousValue: previous,
      previousWeeklySchedule: { ...weeklySchedule },
    },
  }
}

export const applyExecutionFocus = ({
  session,
  change = {},
  workoutName = null,
  context = {},
  proposalPlan = null,
} = {}) => {
  if (proposalPlan) {
    if (session) {
      session.sessionExecutionPlan = proposalPlan
    }
    return {
      ok: true,
      sessionExecutionPlan: proposalPlan,
      rollback: {
        action: PLAN_CHANGE_ACTIONS.SET_SESSION_EXECUTION_FOCUS,
        previousExecutionPlan: null,
      },
    }
  }

  const value = change.value ?? {}
  const maxMinutes =
    typeof change.value === 'number' ? change.value : value.maxMinutes ?? null

  const plan = createSessionExecutionPlan({
    workoutId: context.todayWorkout?.id ?? workoutName,
    workoutName: workoutName ?? change.sessionName ?? null,
    date: context.todayKey,
    maxMinutes,
    exercises: context.workoutExercises ?? [],
    programmingOwner: context.ownership?.programmingOwner,
    coachAssigned: context.ownership?.coachAssigned,
    now: context.now,
  })

  if (session) {
    session.sessionExecutionPlan = plan
  }

  return {
    ok: true,
    sessionExecutionPlan: plan,
    rollback: {
      action: PLAN_CHANGE_ACTIONS.SET_SESSION_EXECUTION_FOCUS,
      previousExecutionPlan: null,
    },
  }
}

export const applyPlanProposal = ({
  proposal = {},
  session = null,
  weeklySchedule = {},
  context = {},
} = {}) => {
  if (!proposal?.changes?.length) {
    return {
      ok: true,
      weeklySchedule,
      sessionExecutionPlan: session?.sessionExecutionPlan ?? null,
      rollbacks: [],
      appliedChanges: [],
    }
  }

  let nextSchedule = { ...weeklySchedule }
  const rollbacks = []
  const appliedChanges = []
  let sessionExecutionPlan = session?.sessionExecutionPlan ?? null

  for (const change of proposal.changes) {
    if (change.action === PLAN_CHANGE_ACTIONS.KEEP_PLAN_AS_IS) {
      appliedChanges.push(change)
      continue
    }

    if (change.action === PLAN_CHANGE_ACTIONS.MOVE_SESSION) {
      const result = applyWeeklyScheduleMove({
        weeklySchedule: nextSchedule,
        fromDayIndex: change.fromDayIndex,
        toDayIndex: change.toDayIndex,
      })
      if (!result.ok) return result
      nextSchedule = result.weeklySchedule
      rollbacks.push(result.rollback)
      appliedChanges.push(change)
    }

    if (change.action === PLAN_CHANGE_ACTIONS.MARK_RECOVERY_DAY) {
      const result = applyRecoveryDay({
        weeklySchedule: nextSchedule,
        targetDayIndex: change.targetDayIndex,
      })
      if (!result.ok) return result
      nextSchedule = result.weeklySchedule
      rollbacks.push(result.rollback)
      appliedChanges.push(change)
    }

    if (
      change.action === PLAN_CHANGE_ACTIONS.SET_SESSION_EXECUTION_FOCUS ||
      (change.action === PLAN_CHANGE_ACTIONS.SHORTEN_SESSION && change.meta?.executionOnly !== false)
    ) {
      const previousExecutionPlan =
        sessionExecutionPlan ?? context.sessionExecutionPlan ?? null
      const result = applyExecutionFocus({
        session,
        change,
        workoutName: proposal.proposedPlan?.daily?.workout,
        context,
        proposalPlan: proposal.proposedPlan?.daily?.sessionExecutionPlan ?? null,
      })
      if (!result.ok) return result
      sessionExecutionPlan = result.sessionExecutionPlan
      rollbacks.push({
        ...result.rollback,
        previousExecutionPlan,
      })
      appliedChanges.push(change)
    }
  }

  if (session && sessionExecutionPlan) {
    session.sessionExecutionPlan = sessionExecutionPlan
  }

  return {
    ok: true,
    weeklySchedule: nextSchedule,
    sessionExecutionPlan,
    rollbacks,
    appliedChanges,
    proposalStatus: PROPOSAL_STATUS.APPLIED,
  }
}

export const undoLastPlanChange = ({ session = null, weeklySchedule = {} } = {}) => {
  const rollback = session?.lastPlanRollback
  if (!rollback) {
    return { ok: false, reason: 'nothing_to_undo' }
  }

  if (rollback.previousWeeklySchedule) {
    return {
      ok: true,
      weeklySchedule: { ...rollback.previousWeeklySchedule },
      message: 'Reverted the last plan change.',
    }
  }

  if (rollback.action === PLAN_CHANGE_ACTIONS.SET_SESSION_EXECUTION_FOCUS && session) {
    session.sessionExecutionPlan = rollback.previousExecutionPlan ?? null
    session.lastPlanRollback = null
    return {
      ok: true,
      weeklySchedule,
      sessionExecutionPlan: session.sessionExecutionPlan,
      message: 'Cleared the session focus override.',
    }
  }

  return { ok: false, reason: 'unsupported_undo' }
}

export const recordPlanRollback = (session = null, rollback = null) => {
  if (!session || !rollback) return
  session.lastPlanRollback = rollback
}
