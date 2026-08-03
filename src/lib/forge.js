import { analyticsSnapshot } from './analytics'
import {
  FORGE_ACHIEVEMENTS,
  FORGE_CATEGORIES,
} from '../data/forgeAchievements'

const clamp = (value, minimum = 0, maximum = 1) =>
  Math.max(minimum, Math.min(maximum, value))

const metricSnapshot = (state = {}) => {
  const analytics = analyticsSnapshot(state)
  const bestByExercise = {}
  let prCount = 0

  ;[...(state.history ?? [])]
    .sort((first, second) =>
      String(first?.date).localeCompare(
        String(second?.date),
      ),
    )
    .forEach((session) => {
      ;(session?.sets ?? []).forEach((set) => {
        const exercise = set?.exercise
        if (!exercise) return

        const weight = Number(set?.weight || 0)
        const reps = Number(set?.reps || 0)
        const estimatedOneRepMax = Number(
          set?.estimatedOneRepMax || 0,
        )

        const score =
          estimatedOneRepMax > 0
            ? estimatedOneRepMax
            : weight > 0 && reps > 0
            ? weight * (1 + reps / 30)
            : 0

        if (score <= 0) return

        const previousBest =
          bestByExercise[exercise] ?? 0

        if (score > previousBest) {
          prCount += 1
          bestByExercise[exercise] = score
        }
      })
    })

  const legendRequirements = [
    analytics.totalWorkouts >= 250,
    analytics.lifetimeVolume >= 5000000,
    analytics.mobility.total >= 100,
  ].filter(Boolean).length

  return {
    'workout-count': analytics.totalWorkouts,
    'longest-streak': analytics.longestStreak,
    'lifetime-volume': analytics.lifetimeVolume,
    'daily-reset-count': analytics.mobility.dailyReset,
    'recovery-flow-count': analytics.mobility.recoveryFlow,
    'mobility-count': analytics.mobility.total,
    'set-count': analytics.totalSets,
    'pr-count': prCount,
    'composite-legend': legendRequirements,
  }
}

const findUnlockDate = (state, achievement, current) => {
  const history = state.history ?? []
  const mobility = state.mobility?.completed ?? []

  if (current < achievement.target) return null

  if (achievement.metric === 'workout-count') {
    const session = history[achievement.target - 1]
    return (
      session?.finishedAt ??
      (session?.date ? `${session.date}T12:00:00` : null)
    )
  }

  if (
    achievement.metric === 'daily-reset-count' ||
    achievement.metric === 'recovery-flow-count'
  ) {
    const title =
      achievement.metric === 'daily-reset-count'
        ? 'Daily Reset'
        : 'Recovery Flow'
    const completion = mobility
      .filter((entry) => entry?.title === title)
      [achievement.target - 1]
    return completion?.completedAt ?? null
  }

  return (
    history.at(-1)?.finishedAt ??
    mobility.at(-1)?.completedAt ??
    new Date().toISOString()
  )
}

export const forgeProgress = (state = {}) => {
  const metrics = metricSnapshot(state)

  return FORGE_ACHIEVEMENTS.map((achievement) => {
    const current = Number(metrics[achievement.metric] ?? 0)
    const progress = clamp(current / achievement.target)
    const unlocked = current >= achievement.target

    return {
      ...achievement,
      current,
      progress,
      percent: Math.round(progress * 100),
      remaining: Math.max(0, achievement.target - current),
      unlocked,
      unlockedAt: unlocked
        ? findUnlockDate(state, achievement, current)
        : null,
    }
  })
}

export const forgeSnapshot = (state = {}) => {
  const achievements = forgeProgress(state)
  const unlocked = achievements.filter(
    (achievement) => achievement.unlocked,
  )
  const locked = achievements.filter(
    (achievement) => !achievement.unlocked,
  )

  const byCategory = Object.values(FORGE_CATEGORIES).reduce(
    (result, category) => {
      result[category] = achievements.filter(
        (achievement) => achievement.category === category,
      )
      return result
    },
    {},
  )

  const closest = [...locked]
    .sort((first, second) => {
      if (second.progress !== first.progress) {
        return second.progress - first.progress
      }
      return first.target - second.target
    })
    .slice(0, 3)

  return {
    achievements,
    unlocked,
    locked,
    byCategory,
    closest,
    totals: {
      available: achievements.length,
      unlocked: unlocked.length,
      locked: locked.length,
      completion:
        achievements.length > 0
          ? Math.round(
              (unlocked.length / achievements.length) * 100,
            )
          : 0,
    },
  }
}

export const newlyUnlockedForgeAchievements = (
  previousState = {},
  nextState = {},
) => {
  const previousIds = new Set(
    forgeProgress(previousState)
      .filter((achievement) => achievement.unlocked)
      .map((achievement) => achievement.id),
  )

  return forgeProgress(nextState).filter(
    (achievement) =>
      achievement.unlocked &&
      !previousIds.has(achievement.id),
  )
}

export const forgeAchievementById = (
  state = {},
  achievementId,
) =>
  forgeProgress(state).find(
    (achievement) => achievement.id === achievementId,
  ) ?? null

export const forgeJourneyEvents = (state = {}) =>
  forgeProgress(state)
    .filter((achievement) => achievement.unlocked)
    .map((achievement) => ({
      id: `forge-${achievement.id}`,
      type: 'forge-achievement',
      occurredAt:
        achievement.unlockedAt ?? new Date().toISOString(),
      title: achievement.title,
      subtitle: 'Forged achievement',
      summary: {
        category: achievement.category,
        rarity: achievement.rarity,
        description: achievement.description,
        target: achievement.target,
      },
      source: achievement,
    }))
