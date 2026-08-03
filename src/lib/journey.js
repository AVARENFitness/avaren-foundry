import {
  currentWorkoutStreak,
  longestWorkoutStreak,
} from './analytics'
import { buildMilestones } from './milestones'
import { forgeJourneyEvents } from './forge'

export const JOURNEY_EVENT_TYPES = {
  WORKOUT: 'workout',
  PR: 'pr',
  DAILY_RESET: 'daily-reset',
  RECOVERY_FLOW: 'recovery-flow',
  STREAK: 'streak',
  MILESTONE: 'milestone',
  FORGE: 'forge-achievement',
}

const EVENT_PRIORITY = {
  [JOURNEY_EVENT_TYPES.PR]: 6,
  [JOURNEY_EVENT_TYPES.MILESTONE]: 5,
  [JOURNEY_EVENT_TYPES.FORGE]: 5.5,
  [JOURNEY_EVENT_TYPES.STREAK]: 4,
  [JOURNEY_EVENT_TYPES.WORKOUT]: 3,
  [JOURNEY_EVENT_TYPES.RECOVERY_FLOW]: 2,
  [JOURNEY_EVENT_TYPES.DAILY_RESET]: 1,
}

const toDate = (value) => {
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? null : date
}

const eventTimestamp = (event) => {
  const date = toDate(event?.occurredAt)
  return date ? date.getTime() : 0
}

const sessionVolume = (session) =>
  (session?.sets ?? []).reduce(
    (total, set) =>
      total +
      Number(set?.weight || 0) *
        Number(set?.reps || 0),
    0,
  )

const sessionDuration = (session) => {
  const started = toDate(session?.startedAt)
  const finished = toDate(session?.finishedAt)

  if (!started || !finished) return 0

  return Math.max(
    1,
    Math.round((finished.getTime() - started.getTime()) / 60000),
  )
}

const uniqueMuscles = (session) =>
  [
    ...new Set(
      (session?.sets ?? [])
        .map((set) => set?.muscle)
        .filter(Boolean),
    ),
  ]

const strongestSet = (session) =>
  [...(session?.sets ?? [])].sort((first, second) => {
    const firstE1RM = Number(first?.estimatedOneRepMax || 0)
    const secondE1RM = Number(second?.estimatedOneRepMax || 0)

    if (secondE1RM !== firstE1RM) {
      return secondE1RM - firstE1RM
    }

    const firstWeight = Number(first?.weight || 0)
    const secondWeight = Number(second?.weight || 0)

    if (secondWeight !== firstWeight) {
      return secondWeight - firstWeight
    }

    return Number(second?.reps || 0) - Number(first?.reps || 0)
  })[0] ?? null

const workoutEvents = (history = []) =>
  history.map((session) => ({
    id: `workout-${session.id}`,
    type: JOURNEY_EVENT_TYPES.WORKOUT,
    occurredAt:
      session.finishedAt ??
      `${session.date}T12:00:00`,
    title: session.name,
    subtitle: 'Workout completed',
    summary: {
      workoutId: session.id,
      date: session.date,
      durationMinutes: sessionDuration(session),
      volume: sessionVolume(session),
      setCount: session.sets?.length ?? 0,
      muscles: uniqueMuscles(session),
      strongestSet: strongestSet(session),
      exercises: [
        ...new Set(
          (session.sets ?? [])
            .map((set) => set?.exercise)
            .filter(Boolean),
        ),
      ],
    },
    source: session,
  }))

const prEvents = (history = []) => {
  const bestByExercise = {}
  const events = []

  const chronological = [...history].sort((first, second) =>
    String(first?.date).localeCompare(String(second?.date)),
  )

  chronological.forEach((session) => {
    ;(session?.sets ?? []).forEach((set, setIndex) => {
      const exercise = set?.exercise
      if (!exercise) return

      const estimatedOneRepMax = Number(
        set?.estimatedOneRepMax || 0,
      )
      const weight = Number(set?.weight || 0)
      const reps = Number(set?.reps || 0)

      const score =
        estimatedOneRepMax > 0
          ? estimatedOneRepMax
          : weight * (1 + reps / 30)

      if (score <= 0) return

      const previousBest = bestByExercise[exercise] ?? 0

      if (score > previousBest) {
        events.push({
          id: `pr-${session.id}-${setIndex}`,
          type: JOURNEY_EVENT_TYPES.PR,
          occurredAt:
            session.finishedAt ??
            `${session.date}T12:00:00`,
          title: exercise,
          subtitle: 'New personal record',
          summary: {
            weight,
            reps,
            estimatedOneRepMax: score,
            previousBest,
            improvement: Math.max(0, score - previousBest),
            workoutId: session.id,
          },
          source: set,
        })

        bestByExercise[exercise] = score
      }
    })
  })

  return events
}

const mobilityEvents = (mobility = {}) =>
  (mobility?.completed ?? []).map((entry) => {
    const isReset = entry?.title === 'Daily Reset'

    return {
      id: `mobility-${entry.id}`,
      type: isReset
        ? JOURNEY_EVENT_TYPES.DAILY_RESET
        : JOURNEY_EVENT_TYPES.RECOVERY_FLOW,
      occurredAt: entry.completedAt,
      title: entry.title,
      subtitle: isReset
        ? 'Morning movement completed'
        : 'Recovery completed',
      summary: {
        flowId: entry.flowId,
      },
      source: entry,
    }
  })

const streakEvents = (history = []) => {
  const dates = [
    ...new Set(
      history
        .map((session) => session?.date)
        .filter(Boolean),
    ),
  ].sort()

  const milestones = new Set([3, 7, 14, 21, 30, 60, 90, 180, 365])
  const events = []

  let current = 0
  let previousDate = null

  dates.forEach((dateValue) => {
    const currentDate = toDate(`${dateValue}T12:00:00`)
    if (!currentDate) return

    if (!previousDate) {
      current = 1
    } else {
      const difference = Math.round(
        (currentDate.getTime() - previousDate.getTime()) /
          86400000,
      )

      current = difference === 1 ? current + 1 : 1
    }

    if (milestones.has(current)) {
      events.push({
        id: `streak-${dateValue}-${current}`,
        type: JOURNEY_EVENT_TYPES.STREAK,
        occurredAt: `${dateValue}T20:00:00`,
        title: `${current}-Day Streak`,
        subtitle: 'Consistency milestone',
        summary: {
          days: current,
        },
      })
    }

    previousDate = currentDate
  })

  return events
}

const milestoneEvents = (state = {}) =>
  buildMilestones(state).map((milestone) => ({
    id: milestone.id,
    type: JOURNEY_EVENT_TYPES.MILESTONE,
    occurredAt: milestone.achievedAt,
    title: milestone.title,
    subtitle: milestone.subtitle,
    summary: {
      milestone: milestone.type,
      value: milestone.value,
    },
    source: milestone,
  }))


export const buildJourneyEvents = (state = {}) => {
  const history = state?.history ?? []

  return [
    ...workoutEvents(history),
    ...prEvents(history),
    ...mobilityEvents(state?.mobility),
    ...streakEvents(history),
    ...milestoneEvents(state),
    ...forgeJourneyEvents(state),
  ].sort((first, second) => {
    const timeDifference =
      eventTimestamp(second) - eventTimestamp(first)

    if (timeDifference !== 0) return timeDifference

    return (
      (EVENT_PRIORITY[second.type] ?? 0) -
      (EVENT_PRIORITY[first.type] ?? 0)
    )
  })
}

export const filterJourneyEvents = (
  events = [],
  filters = {},
) => {
  const {
    types = [],
    search = '',
    startDate = null,
    endDate = null,
  } = filters

  const normalizedSearch = search.trim().toLowerCase()
  const start = startDate ? toDate(startDate) : null
  const end = endDate ? toDate(endDate) : null

  return events.filter((event) => {
    if (types.length && !types.includes(event.type)) {
      return false
    }

    if (normalizedSearch) {
      const haystack = [
        event.title,
        event.subtitle,
        event.summary?.muscles?.join(' '),
        event.summary?.exercises?.join(' '),
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase()

      if (!haystack.includes(normalizedSearch)) {
        return false
      }
    }

    const occurredAt = toDate(event.occurredAt)

    if (start && occurredAt && occurredAt < start) {
      return false
    }

    if (end && occurredAt && occurredAt > end) {
      return false
    }

    return true
  })
}

export const groupJourneyByMonth = (events = []) => {
  const groups = new Map()

  events.forEach((event) => {
    const date = toDate(event.occurredAt)
    if (!date) return

    const key = `${date.getFullYear()}-${String(
      date.getMonth() + 1,
    ).padStart(2, '0')}`

    if (!groups.has(key)) {
      groups.set(key, {
        key,
        label: date.toLocaleDateString([], {
          month: 'long',
          year: 'numeric',
        }),
        events: [],
      })
    }

    groups.get(key).events.push(event)
  })

  return [...groups.values()]
}

export const journeyMonthlySummary = (events = []) => {
  const groups = groupJourneyByMonth(events)

  return groups.map((group) => {
    const workouts = group.events.filter(
      (event) => event.type === JOURNEY_EVENT_TYPES.WORKOUT,
    )

    const prs = group.events.filter(
      (event) => event.type === JOURNEY_EVENT_TYPES.PR,
    )

    const resets = group.events.filter(
      (event) =>
        event.type === JOURNEY_EVENT_TYPES.DAILY_RESET,
    )

    const recovery = group.events.filter(
      (event) =>
        event.type === JOURNEY_EVENT_TYPES.RECOVERY_FLOW,
    )

    const volume = workouts.reduce(
      (total, event) =>
        total + Number(event.summary?.volume || 0),
      0,
    )

    return {
      key: group.key,
      label: group.label,
      workoutCount: workouts.length,
      prCount: prs.length,
      dailyResetCount: resets.length,
      recoveryFlowCount: recovery.length,
      volume,
      events: group.events,
    }
  })
}

export const journeySnapshot = (state = {}) => {
  const events = buildJourneyEvents(state)

  return {
    events,
    months: journeyMonthlySummary(events),
    currentStreak: currentWorkoutStreak(state?.history ?? []),
    longestStreak: longestWorkoutStreak(state?.history ?? []),
    totals: {
      workouts: events.filter(
        (event) => event.type === JOURNEY_EVENT_TYPES.WORKOUT,
      ).length,
      prs: events.filter(
        (event) => event.type === JOURNEY_EVENT_TYPES.PR,
      ).length,
      dailyResets: events.filter(
        (event) =>
          event.type === JOURNEY_EVENT_TYPES.DAILY_RESET,
      ).length,
      recoveryFlows: events.filter(
        (event) =>
          event.type === JOURNEY_EVENT_TYPES.RECOVERY_FLOW,
      ).length,
      streaks: events.filter(
        (event) => event.type === JOURNEY_EVENT_TYPES.STREAK,
      ).length,
      milestones: events.filter(
        (event) =>
          event.type === JOURNEY_EVENT_TYPES.MILESTONE,
      ).length,
      forgeAchievements: events.filter(
        (event) =>
          event.type === JOURNEY_EVENT_TYPES.FORGE,
      ).length,
    },
  }
}
