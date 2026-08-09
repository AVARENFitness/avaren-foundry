import { snapshotWeeklySchedule } from './avaPlanningContext'
import { PLAN_CHANGE_ACTIONS } from './avaPlanTypes'

export const verifyPlanApplied = ({
  proposal = {},
  weeklySchedule = {},
  session = null,
  sessionExecutionPlan = null,
} = {}) => {
  const moveChanges = (proposal.changes ?? []).filter(
    (change) => change.action === PLAN_CHANGE_ACTIONS.MOVE_SESSION,
  )

  for (const change of moveChanges) {
    const expected = change.targetSessionName
    const actual = weeklySchedule?.[change.toDayIndex]
    if (actual !== expected) {
      return {
        ok: false,
        reason: 'move_not_reflected',
        expected,
        actual,
      }
    }

    const cleared = weeklySchedule?.[change.fromDayIndex]
    if (cleared !== 'Rest') {
      return {
        ok: false,
        reason: 'source_not_cleared',
        expected: 'Rest',
        actual: cleared,
      }
    }
  }

  const recoveryChanges = (proposal.changes ?? []).filter(
    (change) => change.action === PLAN_CHANGE_ACTIONS.MARK_RECOVERY_DAY,
  )

  for (const change of recoveryChanges) {
    if (weeklySchedule?.[change.targetDayIndex] !== 'Rest') {
      return {
        ok: false,
        reason: 'recovery_day_not_set',
      }
    }
  }

  const focusChange = (proposal.changes ?? []).find(
    (change) =>
      change.action === PLAN_CHANGE_ACTIONS.SET_SESSION_EXECUTION_FOCUS ||
      change.action === PLAN_CHANGE_ACTIONS.SHORTEN_SESSION,
  )

  if (focusChange) {
    const expectedMinutes =
      typeof focusChange.value === 'number'
        ? focusChange.value
        : focusChange.value?.maxMinutes
    const actualPlan =
      sessionExecutionPlan ?? session?.sessionExecutionPlan ?? null
    const actualMinutes = actualPlan?.maxMinutes ?? null
    if (expectedMinutes != null && actualMinutes !== expectedMinutes) {
      return {
        ok: false,
        reason: 'execution_focus_not_set',
        expectedMinutes,
        actualMinutes,
      }
    }
  }

  const snapshotMatches =
    proposal.currentPlanSnapshot?.weeklyScheduleHash !==
    snapshotWeeklySchedule(weeklySchedule)

  return {
    ok: true,
    scheduleChanged: snapshotMatches,
  }
}

export const buildApplySuccessMessage = (proposal = {}, verification = {}) => {
  if (!verification.ok) {
    return "I couldn't verify that plan change. Nothing was saved."
  }

  const diff = proposal.diff ?? []
  if (!diff.length) {
    return 'Done — your plan stays as-is, with today focused on the main work.'
  }

  const shorten = diff.find((entry) => entry.kind === 'shorten')
  if (shorten) {
    const coachNote = proposal.coachProgramProtected
      ? ' Your coach\u2019s program stays unchanged.'
      : ''
    return `Done \u2014 today\u2019s session is now set to a ${shorten.to}.${coachNote}`
  }

  const parts = diff.map((entry) => {
    if (entry.kind === 'shorten') {
      return `${entry.workout} is set to ${entry.to}`
    }
    if (entry.kind === 'assign') {
      return `${entry.to} is now on ${entry.dayName}`
    }
    if (entry.kind === 'recovery') {
      return `${entry.dayName} is clear`
    }
    return null
  }).filter(Boolean)

  if (!parts.length) {
    return 'Done — your plan is updated.'
  }

  return `Done — ${parts.join(', ')}.`
}
