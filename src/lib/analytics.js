const DAY_MS = 86400000

const toDate = (value) => {
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? null : date
}

const startOfDay = (value) => {
  const date = toDate(value)
  if (!date) return null
  date.setHours(0, 0, 0, 0)
  return date
}

const startOfWeek = (value = new Date()) => {
  const date = startOfDay(value)
  if (!date) return null
  const day = date.getDay()
  const offset = day === 0 ? -6 : 1 - day
  date.setDate(date.getDate() + offset)
  return date
}

const startOfMonth = (value = new Date()) => {
  const date = startOfDay(value)
  if (!date) return null
  date.setDate(1)
  return date
}

const setVolume = (set) =>
  Number(set?.weight || 0) * Number(set?.reps || 0)

const setE1RM = (set) => {
  if (Number(set?.estimatedOneRepMax) > 0) {
    return Number(set.estimatedOneRepMax)
  }

  const weight = Number(set?.weight || 0)
  const reps = Number(set?.reps || 0)

  if (weight <= 0 || reps <= 0) return 0
  if (reps === 1) return weight

  return weight * (1 + reps / 30)
}

const sessionDurationMinutes = (session) => {
  const started = toDate(session?.startedAt)
  const finished = toDate(session?.finishedAt)

  if (!started || !finished) return 0

  return Math.max(
    0,
    Math.round((finished.getTime() - started.getTime()) / 60000),
  )
}

const uniqueDates = (history = []) =>
  [
    ...new Set(
      history
        .map((session) => session?.date)
        .filter(Boolean),
    ),
  ].sort()

export const totalWorkoutVolume = (history = []) =>
  history.reduce(
    (total, session) =>
      total +
      (session?.sets ?? []).reduce(
        (sessionTotal, set) => sessionTotal + setVolume(set),
        0,
      ),
    0,
  )

export const totalSetsLogged = (history = []) =>
  history.reduce(
    (total, session) => total + (session?.sets?.length ?? 0),
    0,
  )

export const averageWorkoutDuration = (history = []) => {
  const durations = history
    .map(sessionDurationMinutes)
    .filter((duration) => duration > 0)

  if (!durations.length) return 0

  return Math.round(
    durations.reduce((sum, duration) => sum + duration, 0) /
      durations.length,
  )
}

export const volumeSince = (history = [], boundary) => {
  const start = toDate(boundary)
  if (!start) return 0

  return history
    .filter((session) => {
      const date = toDate(session?.date)
      return date && date >= start
    })
    .reduce(
      (total, session) =>
        total +
        (session?.sets ?? []).reduce(
          (sessionTotal, set) => sessionTotal + setVolume(set),
          0,
        ),
      0,
    )
}

export const weeklyVolume = (history = [], referenceDate = new Date()) =>
  volumeSince(history, startOfWeek(referenceDate))

export const monthlyVolume = (history = [], referenceDate = new Date()) =>
  volumeSince(history, startOfMonth(referenceDate))

export const exerciseFrequency = (history = []) => {
  const counts = {}

  history.forEach((session) => {
    const exercises = new Set(
      (session?.sets ?? [])
        .map((set) => set?.exercise)
        .filter(Boolean),
    )

    exercises.forEach((exercise) => {
      counts[exercise] = (counts[exercise] ?? 0) + 1
    })
  })

  return counts
}

export const muscleFrequency = (history = []) => {
  const counts = {}

  history.forEach((session) => {
    const muscles = new Set(
      (session?.sets ?? [])
        .map((set) => set?.muscle)
        .filter(Boolean),
    )

    muscles.forEach((muscle) => {
      counts[muscle] = (counts[muscle] ?? 0) + 1
    })
  })

  return counts
}

export const muscleVolume = (history = []) => {
  const totals = {}

  history.forEach((session) => {
    ;(session?.sets ?? []).forEach((set) => {
      const muscle = set?.muscle || 'Other'
      totals[muscle] = (totals[muscle] ?? 0) + setVolume(set)
    })
  })

  return totals
}

export const exerciseHistory = (history = [], exerciseName) =>
  history
    .filter((session) =>
      (session?.sets ?? []).some(
        (set) => set?.exercise === exerciseName,
      ),
    )
    .map((session) => {
      const sets = (session?.sets ?? []).filter(
        (set) => set?.exercise === exerciseName,
      )

      return {
        sessionId: session.id,
        date: session.date,
        workout: session.name,
        sets,
        volume: sets.reduce(
          (total, set) => total + setVolume(set),
          0,
        ),
        heaviestWeight: Math.max(
          0,
          ...sets.map((set) => Number(set?.weight || 0)),
        ),
        bestE1RM: Math.max(
          0,
          ...sets.map(setE1RM),
        ),
      }
    })
    .sort((a, b) => String(a.date).localeCompare(String(b.date)))

export const estimatedOneRepMaxHistory = (
  history = [],
  exerciseName,
) =>
  exerciseHistory(history, exerciseName).map((session) => ({
    date: session.date,
    value: session.bestE1RM,
    sessionId: session.sessionId,
  }))

export const currentWorkoutStreak = (history = []) => {
  const dates = uniqueDates(history)
  if (!dates.length) return 0

  const newest = startOfDay(dates.at(-1))
  const today = startOfDay(new Date())
  if (!newest || !today) return 0

  const daysSinceNewest = Math.round(
    (today.getTime() - newest.getTime()) / DAY_MS,
  )

  if (daysSinceNewest > 1) return 0

  let streak = 1

  for (let index = dates.length - 1; index > 0; index -= 1) {
    const current = startOfDay(dates[index])
    const previous = startOfDay(dates[index - 1])

    if (!current || !previous) break

    const difference = Math.round(
      (current.getTime() - previous.getTime()) / DAY_MS,
    )

    if (difference === 1) streak += 1
    else break
  }

  return streak
}

export const longestWorkoutStreak = (history = []) => {
  const dates = uniqueDates(history)
  if (!dates.length) return 0

  let longest = 1
  let current = 1

  for (let index = 1; index < dates.length; index += 1) {
    const previous = startOfDay(dates[index - 1])
    const next = startOfDay(dates[index])

    if (!previous || !next) continue

    const difference = Math.round(
      (next.getTime() - previous.getTime()) / DAY_MS,
    )

    if (difference === 1) {
      current += 1
      longest = Math.max(longest, current)
    } else {
      current = 1
    }
  }

  return longest
}

export const mobilityCompletionStats = (mobility = {}) => {
  const completed = mobility?.completed ?? []

  const dailyReset = completed.filter(
    (entry) => entry?.title === 'Daily Reset',
  ).length

  const recoveryFlow = completed.filter(
    (entry) => entry?.title === 'Recovery Flow',
  ).length

  return {
    total: completed.length,
    dailyReset,
    recoveryFlow,
  }
}

export const analyticsSnapshot = (state = {}) => {
  const history = state?.history ?? []

  return {
    totalWorkouts: history.length,
    totalSets: totalSetsLogged(history),
    lifetimeVolume: totalWorkoutVolume(history),
    weeklyVolume: weeklyVolume(history),
    monthlyVolume: monthlyVolume(history),
    averageDurationMinutes: averageWorkoutDuration(history),
    currentStreak: currentWorkoutStreak(history),
    longestStreak: longestWorkoutStreak(history),
    exerciseFrequency: exerciseFrequency(history),
    muscleFrequency: muscleFrequency(history),
    muscleVolume: muscleVolume(history),
    mobility: mobilityCompletionStats(state?.mobility),
  }
}
