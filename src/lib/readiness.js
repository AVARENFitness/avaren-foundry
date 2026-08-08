const SCORE_MIN = 1
const SCORE_MAX = 5

const clamp = (value, minimum, maximum) =>
  Math.max(minimum, Math.min(maximum, value))

const todayKey = (value = new Date()) =>
  new Date(value).toISOString().slice(0, 10)

const normalizeRating = (value, fallback = 3) =>
  clamp(Number(value || fallback), SCORE_MIN, SCORE_MAX)

export const READINESS_FIELDS = [
  {
    id: 'sleep',
    label: 'Sleep',
    low: 'Poor',
    high: 'Excellent',
    positive: true,
  },
  {
    id: 'energy',
    label: 'Energy',
    low: 'Drained',
    high: 'Energized',
    positive: true,
  },
  {
    id: 'soreness',
    label: 'Soreness',
    low: 'Fresh',
    high: 'Very sore',
    positive: false,
  },
  {
    id: 'stress',
    label: 'Stress',
    low: 'Calm',
    high: 'Very stressed',
    positive: false,
  },
]

export const defaultReadinessCheckIn = () => ({
  sleep: 3,
  energy: 3,
  soreness: 3,
  stress: 3,
})

export const readinessEntryForDate = (
  readinessState = {},
  date = new Date(),
) => {
  const key = todayKey(date)
  return (readinessState.entries ?? []).find(
    (entry) => entry.date === key,
  ) ?? null
}

export const hasTodayReadinessCheckIn = (
  readinessState = {},
) => Boolean(readinessEntryForDate(readinessState))

export const saveReadinessEntry = (
  readinessState = {},
  values,
  date = new Date(),
) => {
  const dateKey = todayKey(date)
  const entry = {
    id:
      readinessEntryForDate(readinessState, date)?.id ??
      crypto.randomUUID(),
    date: dateKey,
    sleep: normalizeRating(values.sleep),
    energy: normalizeRating(values.energy),
    soreness: normalizeRating(values.soreness),
    stress: normalizeRating(values.stress),
    completedAt: new Date().toISOString(),
  }

  const entries = [
    ...(readinessState.entries ?? []).filter(
      (item) => item.date !== dateKey,
    ),
    entry,
  ].sort((first, second) =>
    String(first.date).localeCompare(String(second.date)),
  )

  return {
    ...readinessState,
    entries,
    lastPromptedDate: dateKey,
  }
}

const scoreFromEntry = (entry) => {
  if (!entry) return null

  const sleep = normalizeRating(entry.sleep)
  const energy = normalizeRating(entry.energy)
  const sorenessRecovery = 6 - normalizeRating(entry.soreness)
  const stressRecovery = 6 - normalizeRating(entry.stress)

  return Math.round(
    ((sleep * 0.32 +
      energy * 0.32 +
      sorenessRecovery * 0.2 +
      stressRecovery * 0.16) /
      5) *
      100,
  )
}

const trainingLoadAdjustment = (state = {}) => {
  const now = Date.now()
  const recent = (state.history ?? []).filter((session) => {
    const value =
      session?.finishedAt ??
      (session?.date
        ? `${session.date}T12:00:00`
        : null)
    const time = new Date(value).getTime()
    return (
      Number.isFinite(time) &&
      now - time <= 3 * 86400000
    )
  })

  if (recent.length >= 3) return -10
  if (recent.length === 2) return -5
  return 0
}

const recoveryHabitAdjustment = (state = {}) => {
  const recentMobility = (
    state.mobility?.completed ?? []
  ).filter((entry) => {
    const time = new Date(entry.completedAt).getTime()
    return (
      Number.isFinite(time) &&
      Date.now() - time <= 3 * 86400000
    )
  })

  return Math.min(8, recentMobility.length * 2)
}

export const calculateReadiness = (state = {}, date = new Date()) => {
  const entry = readinessEntryForDate(
    state.readiness ?? {},
    date,
  )
  const subjectiveScore = scoreFromEntry(entry)

  if (!entry) {
    return {
      completed: false,
      score: null,
      subjectiveScore: null,
      tone: 'unknown',
      status: 'Check in to calculate readiness',
      recommendation:
        'Rate sleep, energy, soreness, and stress to personalize today’s guidance.',
      entry: null,
      factors: [],
    }
  }

  const score = clamp(
    subjectiveScore +
      trainingLoadAdjustment(state) +
      recoveryHabitAdjustment(state),
    0,
    100,
  )

  let tone = 'low'
  let status = 'Recovery recommended'
  let recommendation =
    'Reduce intensity, shorten the session, or prioritize recovery today.'

  if (score >= 82) {
    tone = 'high'
    status = 'Ready to push'
    recommendation =
      'Your check-in supports normal training and a stronger effort if technique stays sharp.'
  } else if (score >= 65) {
    tone = 'medium'
    status = 'Ready to train'
    recommendation =
      'Train as planned, but keep effort flexible and adjust if warm-up quality is low.'
  } else if (score >= 48) {
    tone = 'moderate'
    status = 'Use a lighter approach'
    recommendation =
      'Consider reducing load, sets, or intensity while keeping the movement pattern.'
  }

  const factors = [
    {
      id: 'sleep',
      label: 'Sleep',
      value: entry.sleep,
      supportive: entry.sleep >= 4,
      concern: entry.sleep <= 2,
    },
    {
      id: 'energy',
      label: 'Energy',
      value: entry.energy,
      supportive: entry.energy >= 4,
      concern: entry.energy <= 2,
    },
    {
      id: 'soreness',
      label: 'Soreness',
      value: entry.soreness,
      supportive: entry.soreness <= 2,
      concern: entry.soreness >= 4,
    },
    {
      id: 'stress',
      label: 'Stress',
      value: entry.stress,
      supportive: entry.stress <= 2,
      concern: entry.stress >= 4,
    },
  ]

  return {
    completed: true,
    score,
    subjectiveScore,
    tone,
    status,
    recommendation,
    entry,
    factors,
  }
}

export const recentReadinessEntries = (
  readinessState = {},
  limit = 14,
) =>
  [...(readinessState.entries ?? [])]
    .sort((first, second) =>
      String(second.date).localeCompare(
        String(first.date),
      ),
    )
    .slice(0, limit)


const average = (values = []) =>
  values.length
    ? Math.round(
        values.reduce((sum, value) => sum + value, 0) /
          values.length,
      )
    : null

const entryScore = (entry) => {
  if (!entry) return null

  return Math.round(
    ((normalizeRating(entry.sleep) * 0.32 +
      normalizeRating(entry.energy) * 0.32 +
      (6 - normalizeRating(entry.soreness)) * 0.2 +
      (6 - normalizeRating(entry.stress)) * 0.16) /
      5) *
      100,
  )
}

const isWithinDays = (date, days) => {
  const time = new Date(`${date}T12:00:00`).getTime()
  return Number.isFinite(time) &&
    Date.now() - time <= days * 86400000
}

export const readinessTrendSnapshot = (
  state = {},
  days = 30,
) => {
  const entries = recentReadinessEntries(
    state.readiness ?? {},
    365,
  )
    .filter((entry) => isWithinDays(entry.date, days))
    .sort((first, second) =>
      String(first.date).localeCompare(String(second.date)),
    )

  const scored = entries.map((entry) => ({
    ...entry,
    score: entryScore(entry),
  }))

  const workoutDates = new Set(
    (state.history ?? []).map((session) => session.date),
  )

  const workoutDays = scored.filter((entry) =>
    workoutDates.has(entry.date),
  )
  const restDays = scored.filter(
    (entry) => !workoutDates.has(entry.date),
  )

  const factorAverage = (field) =>
    average(scored.map((entry) => Number(entry[field] ?? 0)))

  const best = [...scored].sort(
    (first, second) => second.score - first.score,
  )[0] ?? null

  const lowest = [...scored].sort(
    (first, second) => first.score - second.score,
  )[0] ?? null

  const scores = scored.map((entry) => entry.score)
  const scoreAverage = average(scores)
  const consistency =
    scores.length > 1
      ? Math.max(
          0,
          Math.round(
            100 -
              scores.reduce(
                (sum, score) =>
                  sum + Math.abs(score - scoreAverage),
                0,
              ) /
                scores.length,
          ),
        )
      : scores.length
      ? 100
      : null

  return {
    entries: scored,
    count: scored.length,
    average: scoreAverage,
    sleep: factorAverage('sleep'),
    energy: factorAverage('energy'),
    soreness: factorAverage('soreness'),
    stress: factorAverage('stress'),
    best,
    lowest,
    consistency,
    workoutDayAverage: average(
      workoutDays.map((entry) => entry.score),
    ),
    restDayAverage: average(
      restDays.map((entry) => entry.score),
    ),
    lowReadinessWorkoutCount: workoutDays.filter(
      (entry) => entry.score < 50,
    ).length,
  }
}

export const readinessCorrelationSnapshot = (
  state = {},
) => {
  const entries = recentReadinessEntries(
    state.readiness ?? {},
    365,
  )
  const byDate = new Map(
    entries.map((entry) => [
      entry.date,
      {
        ...entry,
        score: entryScore(entry),
      },
    ]),
  )

  const workoutDays = (state.history ?? [])
    .map((session) => ({
      session,
      readiness: byDate.get(session.date) ?? null,
    }))
    .filter((item) => item.readiness)

  return {
    workoutDays,
    averageWorkoutReadiness: average(
      workoutDays.map((item) => item.readiness.score),
    ),
  }
}
