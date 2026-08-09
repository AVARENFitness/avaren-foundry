import {
  ALLOWED_PLAN_CHANGE_ACTIONS,
  PLAN_CHANGE_ACTIONS,
  PROPOSAL_STATUS,
} from './avaPlanTypes'
import { snapshotWeeklySchedule } from './avaPlanningContext'

export const validatePlanChange = (change = {}, context = {}) => {
  const action = String(change?.action ?? '').trim()

  if (!action) {
    return { ok: false, reason: 'missing_action' }
  }

  if (!ALLOWED_PLAN_CHANGE_ACTIONS.has(action)) {
    return { ok: false, reason: 'unknown_action', action }
  }

  if (action === PLAN_CHANGE_ACTIONS.MOVE_SESSION) {
    if (change.fromDayIndex == null || change.toDayIndex == null) {
      return { ok: false, reason: 'missing_move_target' }
    }

    if (change.fromDayIndex === change.toDayIndex) {
      return { ok: false, reason: 'same_day_move' }
    }

    const fromDay = context.trainingWeek?.find((day) => day.dayIndex === change.fromDayIndex)
    const toDay = context.trainingWeek?.find((day) => day.dayIndex === change.toDayIndex)

    if (!fromDay || !toDay) {
      return { ok: false, reason: 'invalid_day' }
    }

    if (fromDay.status === 'completed') {
      return { ok: false, reason: 'completed_session' }
    }

    const destinationWorkout = context.weeklySchedule?.[change.toDayIndex]
    if (destinationWorkout && destinationWorkout !== 'Rest') {
      return { ok: false, reason: 'destination_collision' }
    }

    if (context.coachAssignedToday && change.fromDayIndex === context.todayDay?.dayIndex) {
      return {
        ok: false,
        reason: 'coach_assignment_move_blocked',
        message:
          'Coach-assigned sessions can be shortened, but moving them needs coach coordination in this sprint.',
      }
    }
  }

  if (action === PLAN_CHANGE_ACTIONS.SHORTEN_SESSION) {
    const minutes = typeof change.value === 'number' ? change.value : change.value?.maxMinutes
    if (minutes != null && (minutes < 10 || minutes > 180)) {
      return { ok: false, reason: 'invalid_time_limit' }
    }
  }

  if (action === PLAN_CHANGE_ACTIONS.MARK_RECOVERY_DAY) {
    if (change.targetDayIndex == null) {
      return { ok: false, reason: 'missing_recovery_day' }
    }
  }

  return { ok: true }
}

export const validateProposal = (proposal = {}, context = {}) => {
  if (!proposal?.changes?.length) {
    return { ok: true, changes: [] }
  }

  const results = []
  for (const change of proposal.changes) {
    const result = validatePlanChange(change, context)
    results.push({ change, ...result })
    if (!result.ok) {
      return {
        ok: false,
        reason: result.reason,
        action: result.action ?? change.action,
        message: result.message ?? null,
        results,
      }
    }
  }

  return { ok: true, results }
}

export const isStaleProposal = (proposal = {}, context = {}) => {
  if (!proposal?.currentPlanSnapshot) return false

  const currentHash = snapshotWeeklySchedule(context.weeklySchedule)
  return proposal.currentPlanSnapshot.weeklyScheduleHash !== currentHash
}

export const rejectUnknownProposalActions = (changes = []) => {
  const rejected = []
  const accepted = []

  for (const change of changes) {
    if (!ALLOWED_PLAN_CHANGE_ACTIONS.has(change.action)) {
      rejected.push(change)
    } else {
      accepted.push(change)
    }
  }

  return { accepted, rejected }
}

export const markProposalStale = (proposal = {}) => ({
  ...proposal,
  status: PROPOSAL_STATUS.STALE,
})

export const canApplyProposal = (proposal = {}, context = {}) => {
  if (!proposal) {
    return { ok: false, reason: 'missing_proposal' }
  }

  if (proposal.status === PROPOSAL_STATUS.APPLIED) {
    return { ok: false, reason: 'already_applied' }
  }

  if (proposal.status === PROPOSAL_STATUS.CANCELLED) {
    return { ok: false, reason: 'cancelled' }
  }

  if (isStaleProposal(proposal, context)) {
    return { ok: false, reason: 'stale', stale: true }
  }

  const validation = validateProposal(proposal, context)
  if (!validation.ok) {
    return { ok: false, reason: validation.reason, validation }
  }

  return { ok: true }
}
