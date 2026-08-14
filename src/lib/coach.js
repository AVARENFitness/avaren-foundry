import {
  analyticsSnapshot,
  exerciseHistory,
  muscleFrequency,
  muscleVolume,
} from './analytics'
import { buildMilestones } from './milestones'
import { calculateRecoveryIntelligence } from '../data/mobility'
import { calculateReadiness } from './readiness'
import { buildTrainingRecommendation } from './trainingRecommendations'
import { createRuntimeId } from './createRuntimeId'
import { resolveTodayWorkoutContext } from './todayWorkout'

export const COACH_CATEGORIES = {
  RECOVERY: 'recovery',
  CONSISTENCY: 'consistency',
  STRENGTH: 'strength',
  PROGRAMMING: 'programming',
  MILESTONE: 'milestone',
  MOMENTUM: 'momentum',
}

export const COACH_ACTIONS = {
  START_RESET: 'start-reset',
  START_RECOVERY: 'start-recovery',
  START_WORKOUT: 'start-workout',
  OPEN_PROGRESS: 'open-progress',
  OPEN_JOURNEY: 'open-journey',
  NONE: 'none',
}

const DAY_MS = 86400000

const toTime = (value) => {
  const time = new Date(value).getTime()
  return Number.isFinite(time) ? time : 0
}

const daysBetween = (first, second = new Date()) =>
  Math.max(
    0,
    Math.floor(
      (toTime(second) - toTime(first)) / DAY_MS,
    ),
  )

const sessionDate = (session) =>
  session?.finishedAt ??
  (session?.date ? `${session.date}T12:00:00` : null)

const fingerprint = (...parts) =>
  parts
    .filter((part) => part !== undefined && part !== null)
    .join(':')
    .toLowerCase()
    .replace(/[^a-z0-9:.-]+/g, '-')

const makeInsight = ({
  category,
  priority,
  title,
  description,
  evidence = [],
  action = COACH_ACTIONS.NONE,
  actionLabel = null,
  key,
  expiresInDays = 3,
}) => ({
  id: createRuntimeId(),
  category,
  priority,
  title,
  description,
  evidence,
  action,
  actionLabel,
  fingerprint: fingerprint(category, key ?? title),
  generatedAt: new Date().toISOString(),
  expiresAt: new Date(
    Date.now() + expiresInDays * DAY_MS,
  ).toISOString(),
})

const completedWorkoutsInDays = (history, days) =>
  history.filter((session) => {
    const date = sessionDate(session)
    return date && daysBetween(date) < days
  })

const lastTrainedByMuscle = (history = []) => {
  const result = {}

  history.forEach((session) => {
    const date = sessionDate(session)
    if (!date) return

    const muscles = new Set(
      (session.sets ?? [])
        .map((set) => set?.muscle)
        .filter(Boolean),
    )

    muscles.forEach((muscle) => {
      if (
        !result[muscle] ||
        toTime(date) > toTime(result[muscle])
      ) {
        result[muscle] = date
      }
    })
  })

  return result
}

const sortedExerciseNames = (history = []) => [
  ...new Set(
    history.flatMap((session) =>
      (session.sets ?? [])
        .map((set) => set?.exercise)
        .filter(Boolean),
    ),
  ),
]

const strengthTrend = (history, exercise) => {
  const sessions = exerciseHistory(history, exercise)
    .filter((entry) => entry.bestE1RM > 0)
    .slice(-6)

  if (sessions.length < 3) return null

  const midpoint = Math.floor(sessions.length / 2)
  const earlier = sessions.slice(0, midpoint)
  const recent = sessions.slice(midpoint)

  const average = (entries) =>
    entries.reduce(
      (sum, entry) => sum + entry.bestE1RM,
      0,
    ) / entries.length

  const earlierAverage = average(earlier)
  const recentAverage = average(recent)
  const change = recentAverage - earlierAverage
  const percent =
    earlierAverage > 0
      ? (change / earlierAverage) * 100
      : 0

  return {
    exercise,
    sessions,
    earlierAverage,
    recentAverage,
    change,
    percent,
  }
}


const readinessInsights = (state) => {
  const readiness = calculateReadiness(state)

  if (!readiness.completed) {
    return [
      makeInsight({
        category: COACH_CATEGORIES.RECOVERY,
        priority: 83,
        title: 'Complete today’s readiness check-in',
        description:
          'Sleep, energy, soreness, and stress will help personalize today’s recommendation.',
        evidence: ['4 quick ratings', 'Daily guidance'],
        action: COACH_ACTIONS.NONE,
        key: 'readiness-missing',
        expiresInDays: 1,
      }),
    ]
  }

  if (readiness.score < 48) {
    return [
      makeInsight({
        category: COACH_CATEGORIES.RECOVERY,
        priority: 99,
        title: 'Your readiness is low today',
        description:
          readiness.recommendation,
        evidence: readiness.factors
          .filter((factor) => factor.concern)
          .map(
            (factor) =>
              `${factor.label} ${factor.value}/5`,
          ),
        action: COACH_ACTIONS.START_RESET,
        actionLabel: 'Start Today’s Reset',
        key: `readiness-low-${readiness.score}`,
        expiresInDays: 1,
      }),
    ]
  }

  if (readiness.score >= 82) {
    return [
      makeInsight({
        category: COACH_CATEGORIES.MOMENTUM,
        priority: 79,
        title: 'You are ready to push today',
        description:
          readiness.recommendation,
        evidence: readiness.factors
          .filter((factor) => factor.supportive)
          .map(
            (factor) =>
              `${factor.label} ${factor.value}/5`,
          ),
        action: COACH_ACTIONS.START_WORKOUT,
        actionLabel: 'Start Workout',
        key: `readiness-high-${readiness.score}`,
        expiresInDays: 1,
      }),
    ]
  }

  return [
    makeInsight({
      category: COACH_CATEGORIES.RECOVERY,
      priority: 72,
      title: readiness.status,
      description: readiness.recommendation,
      evidence: [
        `Readiness ${readiness.score}`,
      ],
      action: COACH_ACTIONS.START_WORKOUT,
      actionLabel: 'Start Workout',
      key: `readiness-middle-${readiness.score}`,
      expiresInDays: 1,
    }),
  ]
}


const trainingRecommendationInsights = (state) => {
  const scheduled = resolveTodayWorkoutContext(state).name
  const recommendation =
    buildTrainingRecommendation(state, scheduled)

  if (
    recommendation.id === 'train-normal' ||
    recommendation.id === 'check-in'
  ) {
    return []
  }

  return [
    makeInsight({
      category: COACH_CATEGORIES.PROGRAMMING,
      priority:
        recommendation.id === 'recovery-day'
          ? 98
          : recommendation.id === 'reduce-volume'
          ? 91
          : 84,
      title: recommendation.title,
      description: recommendation.summary,
      evidence: recommendation.evidence.slice(0, 4),
      action:
        recommendation.id === 'recovery-day'
          ? COACH_ACTIONS.START_RESET
          : COACH_ACTIONS.START_WORKOUT,
      actionLabel:
        recommendation.id === 'recovery-day'
          ? 'Start Recovery'
          : recommendation.primaryLabel,
      key: `training-recommendation-${recommendation.id}-${recommendation.confidence}`,
      expiresInDays: 1,
    }),
  ]
}

const recoveryInsights = (state) => {
  const recovery = calculateRecoveryIntelligence(state)
  const insights = []

  if (recovery.workoutsThisWeek === 0) {
    return insights
  }

  if (recovery.recoveryFlowsThisWeek === 0) {
    insights.push(
      makeInsight({
        category: COACH_CATEGORIES.RECOVERY,
        priority: 96,
        title: 'Recovery is falling behind training',
        description: `You completed ${recovery.workoutsThisWeek} workout${
          recovery.workoutsThisWeek === 1 ? '' : 's'
        } this week without a Recovery Flow.`,
        evidence: [
          `${recovery.workoutsThisWeek} workouts this week`,
          '0 Recovery Flows',
          `Recovery Score ${recovery.score}`,
        ],
        action: COACH_ACTIONS.START_RECOVERY,
        actionLabel: 'Start Recovery Flow',
        key: `no-recovery-${recovery.workoutsThisWeek}`,
        expiresInDays: 1,
      }),
    )
  } else if (recovery.score >= 80) {
    insights.push(
      makeInsight({
        category: COACH_CATEGORIES.RECOVERY,
        priority: 55,
        title: 'Recovery is matching your training',
        description:
          'Your recent mobility and Recovery Flow habits are keeping pace with your workouts.',
        evidence: [
          `${recovery.recoveryFlowsThisWeek} Recovery Flows`,
          `${recovery.dailyResetsThisWeek} Daily Resets`,
          `Recovery Score ${recovery.score}`,
        ],
        action: COACH_ACTIONS.OPEN_PROGRESS,
        actionLabel: 'View Progress',
        key: `recovery-balanced-${recovery.score}`,
      }),
    )
  } else {
    insights.push(
      makeInsight({
        category: COACH_CATEGORIES.RECOVERY,
        priority: 76,
        title: 'A short reset would improve today’s balance',
        description:
          'Your recovery activity is present, but it has not fully kept pace with recent training.',
        evidence: [
          `${recovery.workoutsThisWeek} workouts`,
          `${recovery.recoveryFlowsThisWeek} Recovery Flows`,
          `Recovery Score ${recovery.score}`,
        ],
        action: COACH_ACTIONS.START_RESET,
        actionLabel: 'Start Today’s Reset',
        key: `recovery-middle-${recovery.score}`,
        expiresInDays: 1,
      }),
    )
  }

  return insights
}

const consistencyInsights = (state) => {
  const analytics = analyticsSnapshot(state)
  const history = state.history ?? []
  const insights = []

  if (analytics.currentStreak >= 3) {
    insights.push(
      makeInsight({
        category: COACH_CATEGORIES.CONSISTENCY,
        priority:
          analytics.currentStreak >= 14
            ? 88
            : analytics.currentStreak >= 7
            ? 78
            : 62,
        title: `${analytics.currentStreak}-day training streak`,
        description:
          analytics.currentStreak === analytics.longestStreak
            ? 'You are currently matching your longest training streak.'
            : `Your longest streak is ${analytics.longestStreak} days.`,
        evidence: [
          `Current ${analytics.currentStreak} days`,
          `Longest ${analytics.longestStreak} days`,
        ],
        action: COACH_ACTIONS.OPEN_JOURNEY,
        actionLabel: 'View The Journey',
        key: `streak-${analytics.currentStreak}`,
        expiresInDays: 1,
      }),
    )
  }

  const lastSession = [...history]
    .sort((a, b) =>
      String(sessionDate(a)).localeCompare(
        String(sessionDate(b)),
      ),
    )
    .at(-1)

  if (lastSession) {
    const daysSince = daysBetween(sessionDate(lastSession))

    if (daysSince >= 5) {
      insights.push(
        makeInsight({
          category: COACH_CATEGORIES.CONSISTENCY,
          priority: Math.min(92, 68 + daysSince * 3),
          title: `It has been ${daysSince} days since your last workout`,
          description:
            'A short session can rebuild momentum without needing to be perfect.',
          evidence: [
            `Last workout: ${lastSession.name}`,
            `${daysSince} days ago`,
          ],
          action: COACH_ACTIONS.START_WORKOUT,
          actionLabel: 'Start Workout',
          key: `training-gap-${daysSince}`,
          expiresInDays: 1,
        }),
      )
    }
  }

  const thisWeek = completedWorkoutsInDays(history, 7)
  if (thisWeek.length >= 4) {
    insights.push(
      makeInsight({
        category: COACH_CATEGORIES.MOMENTUM,
        priority: 60,
        title: 'Strong training momentum this week',
        description: `You completed ${thisWeek.length} workouts in the last seven days.`,
        evidence: [`${thisWeek.length} recent workouts`],
        action: COACH_ACTIONS.OPEN_JOURNEY,
        actionLabel: 'See This Week',
        key: `weekly-momentum-${thisWeek.length}`,
      }),
    )
  }

  return insights
}

const programmingInsights = (state) => {
  const history = state.history ?? []
  if (!history.length) return []

  const frequencies = muscleFrequency(history)
  const volumes = muscleVolume(history)
  const lastTrained = lastTrainedByMuscle(history)
  const insights = []

  Object.entries(lastTrained).forEach(([muscle, date]) => {
    const daysSince = daysBetween(date)

    if (daysSince >= 10) {
      insights.push(
        makeInsight({
          category: COACH_CATEGORIES.PROGRAMMING,
          priority: Math.min(86, 56 + daysSince * 2),
          title: `${muscle} has not been trained in ${daysSince} days`,
          description:
            'Review your weekly plan if this muscle group is part of your current goals.',
          evidence: [
            `${frequencies[muscle] ?? 0} recorded sessions`,
            `Last trained ${daysSince} days ago`,
          ],
          action: COACH_ACTIONS.START_WORKOUT,
          actionLabel: 'Review Today’s Workout',
          key: `muscle-gap-${muscle}-${daysSince}`,
          expiresInDays: 2,
        }),
      )
    }
  })

  const volumeEntries = Object.entries(volumes)
    .filter(([, value]) => value > 0)
    .sort(([, a], [, b]) => b - a)

  if (volumeEntries.length >= 2) {
    const [highestMuscle, highestVolume] = volumeEntries[0]
    const [lowestMuscle, lowestVolume] =
      volumeEntries.at(-1)

    if (
      lowestVolume > 0 &&
      highestVolume / lowestVolume >= 3
    ) {
      insights.push(
        makeInsight({
          category: COACH_CATEGORIES.PROGRAMMING,
          priority: 64,
          title: 'Your training volume is uneven',
          description: `${highestMuscle} has received substantially more recorded volume than ${lowestMuscle}.`,
          evidence: [
            `${highestMuscle}: ${Math.round(
              highestVolume,
            ).toLocaleString()} lb`,
            `${lowestMuscle}: ${Math.round(
              lowestVolume,
            ).toLocaleString()} lb`,
          ],
          action: COACH_ACTIONS.OPEN_PROGRESS,
          actionLabel: 'Review Muscle Volume',
          key: `volume-balance-${highestMuscle}-${lowestMuscle}`,
          expiresInDays: 7,
        }),
      )
    }
  }

  return insights
}

const strengthInsights = (state) => {
  const history = state.history ?? []
  const insights = []

  sortedExerciseNames(history).forEach((exercise) => {
    const trend = strengthTrend(history, exercise)
    if (!trend) return

    if (trend.percent >= 3) {
      insights.push(
        makeInsight({
          category: COACH_CATEGORIES.STRENGTH,
          priority: Math.min(
            84,
            58 + Math.round(trend.percent),
          ),
          title: `${exercise} is trending upward`,
          description: `Your recent estimated strength is up ${trend.percent.toFixed(
            1,
          )}% across the latest sessions.`,
          evidence: [
            `Recent e1RM ${Math.round(
              trend.recentAverage,
            )} lb`,
            `Change +${Math.round(trend.change)} lb`,
          ],
          action: COACH_ACTIONS.OPEN_PROGRESS,
          actionLabel: 'View Exercise Progress',
          key: `strength-up-${exercise}-${Math.round(
            trend.percent,
          )}`,
          expiresInDays: 5,
        }),
      )
    } else if (Math.abs(trend.percent) < 1) {
      insights.push(
        makeInsight({
          category: COACH_CATEGORIES.STRENGTH,
          priority: 50,
          title: `${exercise} has been steady`,
          description:
            'Your recent estimated strength is stable. Consistent target reps may support the next increase.',
          evidence: [
            `${trend.sessions.length} recent sessions`,
            `Recent e1RM ${Math.round(
              trend.recentAverage,
            )} lb`,
          ],
          action: COACH_ACTIONS.OPEN_PROGRESS,
          actionLabel: 'Review the Trend',
          key: `strength-flat-${exercise}`,
          expiresInDays: 7,
        }),
      )
    }
  })

  return insights
}

const milestoneInsights = (state) => {
  const analytics = analyticsSnapshot(state)
  const earned = new Set(
    buildMilestones(state).map((milestone) => milestone.id),
  )

  const candidates = [
    {
      id: 'milestone-workouts-10',
      current: analytics.totalWorkouts,
      target: 10,
      title: '10 workouts',
      unit: 'workouts',
    },
    {
      id: 'milestone-workouts-25',
      current: analytics.totalWorkouts,
      target: 25,
      title: '25 workouts',
      unit: 'workouts',
    },
    {
      id: 'milestone-workouts-50',
      current: analytics.totalWorkouts,
      target: 50,
      title: '50 workouts',
      unit: 'workouts',
    },
    {
      id: 'milestone-volume-100000',
      current: analytics.lifetimeVolume,
      target: 100000,
      title: '100,000 lb lifted',
      unit: 'lb',
    },
    {
      id: 'milestone-volume-250000',
      current: analytics.lifetimeVolume,
      target: 250000,
      title: '250,000 lb lifted',
      unit: 'lb',
    },
    {
      id: 'milestone-volume-500000',
      current: analytics.lifetimeVolume,
      target: 500000,
      title: '500,000 lb lifted',
      unit: 'lb',
    },
  ]

  const next = candidates
    .filter(
      (candidate) =>
        !earned.has(candidate.id) &&
        candidate.current < candidate.target,
    )
    .map((candidate) => ({
      ...candidate,
      progress:
        candidate.current / candidate.target,
      remaining:
        candidate.target - candidate.current,
    }))
    .filter((candidate) => candidate.progress >= 0.65)
    .sort((a, b) => b.progress - a.progress)[0]

  if (!next) return []

  return [
    makeInsight({
      category: COACH_CATEGORIES.MILESTONE,
      priority: 57 + Math.round(next.progress * 18),
      title: `${next.title} is within reach`,
      description:
        next.unit === 'lb'
          ? `${Math.round(
              next.remaining,
            ).toLocaleString()} lb remain before your next milestone.`
          : `${next.remaining} workout${
              next.remaining === 1 ? '' : 's'
            } remain before your next milestone.`,
      evidence: [
        `${Math.round(next.progress * 100)}% complete`,
      ],
      action: COACH_ACTIONS.OPEN_JOURNEY,
      actionLabel: 'View The Journey',
      key: `near-${next.id}`,
      expiresInDays: 3,
    }),
  ]
}

export const buildCoachInsights = (state = {}) =>
  [
    ...trainingRecommendationInsights(state),
    ...readinessInsights(state),
    ...recoveryInsights(state),
    ...consistencyInsights(state),
    ...programmingInsights(state),
    ...strengthInsights(state),
    ...milestoneInsights(state),
  ].sort((a, b) => b.priority - a.priority)

const isExpired = (insight) =>
  insight?.expiresAt &&
  toTime(insight.expiresAt) < Date.now()

const wasRecentlyShown = (
  insight,
  history = [],
  cooldownDays = 5,
) =>
  history.some(
    (entry) =>
      entry?.fingerprint === insight.fingerprint &&
      daysBetween(entry.shownAt) < cooldownDays,
  )

export const rankCoachInsights = (
  insights = [],
  coachHistory = [],
  options = {},
) => {
  const {
    limit = 3,
    cooldownDays = 5,
  } = options

  const fresh = insights
    .filter(
      (insight) =>
        !isExpired(insight) &&
        !wasRecentlyShown(
          insight,
          coachHistory,
          cooldownDays,
        ),
    )
    .sort((first, second) => second.priority - first.priority)

  if (fresh.length >= limit) {
    return fresh.slice(0, limit)
  }

  const repeated = insights
    .filter((insight) => !isExpired(insight))
    .filter(
      (insight) =>
        !fresh.some(
          (freshInsight) =>
            freshInsight.fingerprint ===
            insight.fingerprint,
        ),
    )
    .sort((first, second) => second.priority - first.priority)

  return [...fresh, ...repeated].slice(0, limit)
}

export const coachSnapshot = (
  state = {},
  options = {},
) => {
  const all = buildCoachInsights(state)
  const ranked = rankCoachInsights(
    all,
    state.coach?.history ?? [],
    options,
  )

  return {
    primary: ranked[0] ?? null,
    insights: ranked,
    all,
    generatedAt: new Date().toISOString(),
  }
}

export const recordCoachInsightShown = (
  coachState = {},
  insight,
) => {
  if (!insight) return coachState

  const history = [
    ...(coachState.history ?? []),
    {
      fingerprint: insight.fingerprint,
      shownAt: new Date().toISOString(),
    },
  ].slice(-100)

  return {
    ...coachState,
    history,
    lastShownInsight: insight.fingerprint,
  }
}
