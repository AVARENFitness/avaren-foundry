import {
  currentWorkoutStreak,
  totalWorkoutVolume,
} from './analytics'

export const MILESTONE_TYPES = {
  FIRST_WORKOUT: 'first-workout',
  WORKOUT_COUNT: 'workout-count',
  STREAK: 'streak',
  LIFETIME_VOLUME: 'lifetime-volume',
  DAILY_RESET_COUNT: 'daily-reset-count',
  RECOVERY_FLOW_COUNT: 'recovery-flow-count',
}

const WORKOUT_TARGETS = [1, 10, 25, 50, 100, 250, 500, 1000]
const STREAK_TARGETS = [3, 7, 14, 21, 30, 60, 90, 180, 365]
const VOLUME_TARGETS = [
  100000,
  250000,
  500000,
  1000000,
  2500000,
  5000000,
  10000000,
]
const MOBILITY_TARGETS = [10, 25, 50, 100, 250]

const achievedTarget = (value, targets) =>
  targets.filter((target) => value >= target)

const eventDate = (value) => {
  const date = new Date(value)
  return Number.isNaN(date.getTime())
    ? new Date().toISOString()
    : date.toISOString()
}

const workoutMilestones = (state = {}) => {
  const history = state.history ?? []
  const count = history.length

  return achievedTarget(count, WORKOUT_TARGETS).map((target) => {
    const session = history[Math.max(0, target - 1)] ?? history.at(-1)

    return {
      id:
        target === 1
          ? 'milestone-first-workout'
          : `milestone-workouts-${target}`,
      type:
        target === 1
          ? MILESTONE_TYPES.FIRST_WORKOUT
          : MILESTONE_TYPES.WORKOUT_COUNT,
      title:
        target === 1
          ? 'First Foundry Workout'
          : `${target} Workouts Completed`,
      subtitle:
        target === 1
          ? 'The journey began'
          : 'Training milestone',
      value: target,
      achievedAt: eventDate(
        session?.finishedAt ??
          `${session?.date ?? new Date().toISOString().slice(0, 10)}T12:00:00`,
      ),
    }
  })
}

const streakMilestones = (state = {}) => {
  const streak = currentWorkoutStreak(state.history ?? [])

  return achievedTarget(streak, STREAK_TARGETS).map((target) => ({
    id: `milestone-streak-${target}`,
    type: MILESTONE_TYPES.STREAK,
    title: `${target}-Day Streak`,
    subtitle: 'Consistency milestone',
    value: target,
    achievedAt: new Date().toISOString(),
  }))
}

const volumeMilestones = (state = {}) => {
  const volume = totalWorkoutVolume(state.history ?? [])

  return achievedTarget(volume, VOLUME_TARGETS).map((target) => ({
    id: `milestone-volume-${target}`,
    type: MILESTONE_TYPES.LIFETIME_VOLUME,
    title: `${target.toLocaleString()} lb Lifted`,
    subtitle: 'Lifetime volume milestone',
    value: target,
    achievedAt: new Date().toISOString(),
  }))
}

const mobilityMilestones = (state = {}) => {
  const completed = state.mobility?.completed ?? []
  const dailyResetCount = completed.filter(
    (entry) => entry?.title === 'Daily Reset',
  ).length
  const recoveryFlowCount = completed.filter(
    (entry) => entry?.title === 'Recovery Flow',
  ).length

  const dailyReset = achievedTarget(
    dailyResetCount,
    MOBILITY_TARGETS,
  ).map((target) => ({
    id: `milestone-daily-reset-${target}`,
    type: MILESTONE_TYPES.DAILY_RESET_COUNT,
    title: `${target} Daily Resets`,
    subtitle: 'Movement consistency milestone',
    value: target,
    achievedAt: new Date().toISOString(),
  }))

  const recovery = achievedTarget(
    recoveryFlowCount,
    MOBILITY_TARGETS,
  ).map((target) => ({
    id: `milestone-recovery-${target}`,
    type: MILESTONE_TYPES.RECOVERY_FLOW_COUNT,
    title: `${target} Recovery Flows`,
    subtitle: 'Recovery consistency milestone',
    value: target,
    achievedAt: new Date().toISOString(),
  }))

  return [...dailyReset, ...recovery]
}

export const buildMilestones = (state = {}) => [
  ...workoutMilestones(state),
  ...streakMilestones(state),
  ...volumeMilestones(state),
  ...mobilityMilestones(state),
]

export const newlyEarnedMilestones = (
  previousState = {},
  nextState = {},
) => {
  const previousIds = new Set(
    buildMilestones(previousState).map((milestone) => milestone.id),
  )

  return buildMilestones(nextState).filter(
    (milestone) => !previousIds.has(milestone.id),
  )
}

export const milestoneById = (state = {}, milestoneId) =>
  buildMilestones(state).find(
    (milestone) => milestone.id === milestoneId,
  ) ?? null
