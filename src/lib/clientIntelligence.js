import {
  analyticsSnapshot,
  currentWorkoutStreak,
  weeklyVolume,
} from './analytics'
import { calculateReadiness, readinessTrendSnapshot } from './readiness'
import {
  consistencyStreak,
  recentPRs,
  sessionVolume,
  estimatedOneRepMax,
} from './metrics'
import { nutritionTotals } from './nutrition'

const DAY_MS = 86400000

export const ATTENTION_SEVERITY = {
  INFO: 'info',
  WATCH: 'watch',
  ALERT: 'alert',
}

export const READINESS_BAND = {
  READY: 'ready',
  MANAGE: 'manage',
  RECOVERY: 'recovery',
}

const toTime = (value) => {
  if (!value) return null
  const time = new Date(value).getTime()
  return Number.isFinite(time) ? time : null
}

const todayKey = (value = new Date()) =>
  new Date(value).toISOString().slice(0, 10)

const startOfDay = (value = new Date()) => {
  const date = new Date(value)
  date.setHours(0, 0, 0, 0)
  return date
}

const daysBetween = (from, to = new Date()) => {
  const start = toTime(from)
  const end = toTime(to)
  if (start === null || end === null) return null
  return Math.max(0, Math.floor((end - start) / DAY_MS))
}

export const relativeDayLabel = (value, now = new Date()) => {
  const time = toTime(value)
  if (time === null) return null

  const dayDiff = Math.round(
    (startOfDay(now).getTime() - startOfDay(new Date(time)).getTime()) /
      DAY_MS,
  )

  if (dayDiff === 0) return 'Today'
  if (dayDiff === 1) return 'Yesterday'
  if (dayDiff > 1 && dayDiff < 7) return `${dayDiff} days ago`

  return new Date(time).toLocaleDateString([], {
    month: 'short',
    day: 'numeric',
  })
}

const sessionTimestamp = (session) =>
  session?.finishedAt ??
  (session?.date ? `${session.date}T12:00:00` : null)

const assignmentCompletionSummary = (assignment) =>
  assignment?.completion_summary &&
  typeof assignment.completion_summary === 'object'
    ? assignment.completion_summary
    : {}

export const assignmentToTrainingSession = (assignment) => {
  const summary = assignmentCompletionSummary(assignment)
  const finishedAt = assignment?.completed_at ?? null
  const date =
    finishedAt?.slice(0, 10) ??
    assignment?.due_date ??
    null

  return {
    id: assignment?.completed_session_id ?? assignment?.id,
    name: assignment?.title ?? 'Assigned workout',
    date,
    finishedAt,
    startedAt: assignment?.started_at ?? null,
    sets: [],
    source: 'assignment',
    summary: {
      durationMinutes: Number(summary.durationMinutes || 0),
      volume: Number(summary.volume || 0),
      sets: Number(summary.sets || 0),
      exercises: Number(summary.exercises || 0),
      reflection: summary.reflection ?? '',
      notes: summary.notes ?? '',
    },
  }
}

export const normalizeClientTrainingHistory = ({
  athleteState = null,
  assignments = [],
} = {}) => {
  const cloudHistory = Array.isArray(athleteState?.history)
    ? athleteState.history.filter((session) => session?.date || session?.finishedAt)
    : []

  if (cloudHistory.length) {
    return [...cloudHistory].sort(
      (a, b) =>
        String(sessionTimestamp(a) ?? '').localeCompare(
          String(sessionTimestamp(b) ?? ''),
        ),
    )
  }

  return assignments
    .filter((assignment) => assignment?.status === 'completed')
    .map(assignmentToTrainingSession)
    .filter((session) => session.date || session.finishedAt)
    .sort(
      (a, b) =>
        String(sessionTimestamp(a) ?? '').localeCompare(
          String(sessionTimestamp(b) ?? ''),
        ),
    )
}

const sessionsSince = (history, days, now = new Date()) => {
  const boundary = startOfDay(now).getTime() - (days - 1) * DAY_MS

  return history.filter((session) => {
    const time = toTime(sessionTimestamp(session))
    return time !== null && time >= boundary
  })
}

const countUniqueWorkoutDays = (sessions) =>
  new Set(
    sessions
      .map((session) => session?.date ?? sessionTimestamp(session)?.slice(0, 10))
      .filter(Boolean),
  ).size

const sessionSetsCount = (session) => {
  if (Array.isArray(session?.sets) && session.sets.length) {
    return session.sets.length
  }
  return Number(session?.summary?.sets || 0)
}

const sessionDurationMinutes = (session) => {
  const started = toTime(session?.startedAt)
  const finished = toTime(session?.finishedAt)
  if (started !== null && finished !== null) {
    return Math.max(1, Math.round((finished - started) / 60000))
  }
  const summaryMinutes = Number(session?.summary?.durationMinutes || 0)
  return summaryMinutes > 0 ? summaryMinutes : null
}

const sessionVolumeValue = (session) => {
  if (Array.isArray(session?.sets) && session.sets.length) {
    return sessionVolume(session)
  }
  const summaryVolume = Number(session?.summary?.volume || 0)
  return summaryVolume > 0 ? summaryVolume : null
}

const latestSession = (history) =>
  history.length ? history[history.length - 1] : null

const activeAssignment = (assignments = []) =>
  [...assignments]
    .filter((item) => ['assigned', 'started'].includes(item?.status))
    .sort((a, b) =>
      String(a?.due_date ?? '9999').localeCompare(String(b?.due_date ?? '9999')),
    )[0] ?? null

const latestCompletedAssignment = (assignments = []) =>
  [...assignments]
    .filter((item) => item?.status === 'completed' && item?.completed_at)
    .sort(
      (a, b) =>
        new Date(b.completed_at).getTime() -
        new Date(a.completed_at).getTime(),
    )[0] ?? null

const previousCompletedAssignment = (assignments = [], excludeId = null) =>
  [...assignments]
    .filter(
      (item) =>
        item?.status === 'completed' &&
        item?.completed_at &&
        item.id !== excludeId,
    )
    .sort(
      (a, b) =>
        new Date(b.completed_at).getTime() -
        new Date(a.completed_at).getTime(),
    )[0] ?? null

export const calculateClientConsistency = (history = [], now = new Date()) => {
  const thisWeek = sessionsSince(history, 7, now)
  const priorTwoWeeks = history.filter((session) => {
    const time = toTime(sessionTimestamp(session))
    if (time === null) return false
    const start = startOfDay(now).getTime() - 21 * DAY_MS
    const end = startOfDay(now).getTime() - 7 * DAY_MS
    return time >= start && time < end
  })

  const workoutsThisWeek = countUniqueWorkoutDays(thisWeek)
  const priorWeeklyAverage =
    priorTwoWeeks.length > 0
      ? Math.round((countUniqueWorkoutDays(priorTwoWeeks) / 2) * 10) / 10
      : null

  const streak = currentWorkoutStreak(history)
  const fallbackStreak = consistencyStreak(history)

  let label = 'Building rhythm'
  if (workoutsThisWeek >= 3) label = 'Strong consistency'
  else if (workoutsThisWeek === 2) label = 'Steady consistency'
  else if (workoutsThisWeek === 1) label = 'Light week so far'
  else if (history.length) label = 'No sessions yet this week'
  else label = 'No training logged'

  return {
    workoutsThisWeek,
    workoutsLast30Days: countUniqueWorkoutDays(sessionsSince(history, 30, now)),
    priorWeeklyAverage,
    streak: streak || fallbackStreak,
    label,
  }
}

export const buildTrainingSnapshot = (history = [], now = new Date()) => {
  const consistency = calculateClientConsistency(history, now)
  const last = latestSession(history)
  const recent = [...history].reverse().slice(0, 5)

  const currentWeekVolume = weeklyVolume(history, now)
  const priorWeekStart = new Date(startOfDay(now).getTime() - 7 * DAY_MS)
  const priorWeekVolume = weeklyVolume(history, priorWeekStart)

  let volumeTrend = 'unknown'
  if (currentWeekVolume > 0 || priorWeekVolume > 0) {
    if (currentWeekVolume > priorWeekVolume * 1.08) volumeTrend = 'up'
    else if (currentWeekVolume < priorWeekVolume * 0.92) volumeTrend = 'down'
    else volumeTrend = 'flat'
  }

  const prs = recentPRs(history, 20)
  const prDates = new Set(prs.map((pr) => pr.date))

  return {
    ...consistency,
    volumeTrend,
    currentWeekVolume,
    priorWeekVolume,
    lastSession: last
      ? {
          id: last.id,
          name: last.name ?? 'Workout',
          date: last.date ?? last.finishedAt?.slice(0, 10) ?? null,
          relativeLabel: relativeDayLabel(sessionTimestamp(last), now),
          durationMinutes: sessionDurationMinutes(last),
          sets: sessionSetsCount(last),
          volume: sessionVolumeValue(last),
        }
      : null,
    recentSessions: recent.map((session) => {
      const sessionDate =
        session.date ?? session.finishedAt?.slice(0, 10) ?? null

      return {
        id: session.id,
        name: session.name ?? 'Workout',
        date: sessionDate,
        relativeLabel: relativeDayLabel(sessionTimestamp(session), now),
        durationMinutes: sessionDurationMinutes(session),
        sets: sessionSetsCount(session),
        volume: sessionVolumeValue(session),
        prIndicator: sessionDate && prDates.has(sessionDate)
          ? 'Recent PR'
          : null,
      }
    }),
  }
}

const bestRecentImprovement = (history = []) => {
  const exerciseMap = new Map()

  history.forEach((session) => {
    ;(session?.sets ?? []).forEach((set) => {
      const exercise = set?.exercise
      if (!exercise) return

      const e1rm = Number(
        set.estimatedOneRepMax ??
          estimatedOneRepMax(
            Number(set.weight || 0),
            Number(set.reps || 0),
          ),
      )

      if (e1rm <= 0) return

      const bucket = exerciseMap.get(exercise) ?? []
      bucket.push({
        date: session.date,
        e1rm,
      })
      exerciseMap.set(exercise, bucket)
    })
  })

  let best = null

  exerciseMap.forEach((points, exercise) => {
    const sorted = [...points].sort((a, b) =>
      String(a.date).localeCompare(String(b.date)),
    )
    if (sorted.length < 3) return

    const recent = sorted.slice(-3)
    const delta = recent[2].e1rm - recent[0].e1rm
    if (delta <= 0) return

    if (!best || delta > best.delta) {
      best = {
        exercise,
        delta: Math.round(delta),
        recentE1RM: Math.round(recent[2].e1rm),
      }
    }
  })

  return best
}

const stagnantExercise = (history = []) => {
  const exerciseMap = new Map()

  history.forEach((session) => {
    ;(session?.sets ?? []).forEach((set) => {
      const exercise = set?.exercise
      if (!exercise) return
      const e1rm = Number(
        set.estimatedOneRepMax ??
          estimatedOneRepMax(
            Number(set.weight || 0),
            Number(set.reps || 0),
          ),
      )
      if (e1rm <= 0) return
      const bucket = exerciseMap.get(exercise) ?? []
      bucket.push(e1rm)
      exerciseMap.set(exercise, bucket)
    })
  })

  for (const [exercise, values] of exerciseMap.entries()) {
    if (values.length < 4) continue
    const recent = values.slice(-4)
    const min = Math.min(...recent)
    const max = Math.max(...recent)
    if (max - min <= 2) {
      return exercise
    }
  }

  return null
}

export const buildPerformanceInsights = (history = []) => {
  const hasSetData = history.some(
    (session) => Array.isArray(session?.sets) && session.sets.length,
  )

  if (!hasSetData) {
    const completedCount = history.length
    const recentVolume = history
      .slice(-3)
      .map(sessionVolumeValue)
      .filter((value) => value !== null)

    const cards = []

    if (completedCount > 0) {
      cards.push({
        id: 'completed-load',
        title: 'Completed training load',
        value: `${completedCount} logged session${completedCount === 1 ? '' : 's'}`,
        detail:
          recentVolume.length > 0
            ? `Recent volume averages ${Math.round(
                recentVolume.reduce((sum, value) => sum + value, 0) /
                  recentVolume.length,
              ).toLocaleString()} lb when recorded.`
            : 'Detailed set metrics appear when full workout history is synced.',
      })
    }

    return {
      hasSetData: false,
      cards,
      recentPrs: [],
    }
  }

  const prs = recentPRs(history, 6)
  const improvement = bestRecentImprovement(history)
  const stagnation = stagnantExercise(history)

  const e1rmLeaders = [...new Set(history.flatMap((session) =>
    (session?.sets ?? []).map((set) => set.exercise).filter(Boolean),
  ))]
    .map((exercise) => {
      let best = 0
      history.forEach((session) => {
        ;(session?.sets ?? [])
          .filter((set) => set.exercise === exercise)
          .forEach((set) => {
            const e1rm = Number(
              set.estimatedOneRepMax ??
                estimatedOneRepMax(
                  Number(set.weight || 0),
                  Number(set.reps || 0),
                ),
            )
            best = Math.max(best, e1rm)
          })
      })
      return { exercise, bestE1RM: Math.round(best) }
    })
    .filter((item) => item.bestE1RM > 0)
    .sort((a, b) => b.bestE1RM - a.bestE1RM)
    .slice(0, 2)

  const cards = []

  if (improvement) {
    cards.push({
      id: 'improvement',
      title: `${improvement.exercise} trending up`,
      value: `+${improvement.delta} lb e1RM`,
      detail: `Best recent estimated max is ${improvement.recentE1RM} lb across the last three exposures.`,
    })
  }

  if (e1rmLeaders[0]) {
    cards.push({
      id: 'best-e1rm',
      title: 'Strongest e1RM',
      value: `${e1rmLeaders[0].exercise} · ${e1rmLeaders[0].bestE1RM} lb`,
      detail: e1rmLeaders[1]
        ? `Next: ${e1rmLeaders[1].exercise} at ${e1rmLeaders[1].bestE1RM} lb.`
        : 'Top estimated max from logged working sets.',
    })
  }

  const analytics = analyticsSnapshot({ history })
  if (analytics.weeklyVolume > 0) {
    cards.push({
      id: 'weekly-volume',
      title: 'Weekly volume',
      value: `${Math.round(analytics.weeklyVolume).toLocaleString()} lb`,
      detail:
        analytics.monthlyVolume > 0
          ? `${Math.round(analytics.monthlyVolume).toLocaleString()} lb logged this month.`
          : 'Current week training load from logged sessions.',
    })
  }

  if (stagnation) {
    cards.push({
      id: 'stagnation',
      title: `${stagnation} plateau`,
      value: 'Load may need review',
      detail:
        'Recent exposures show little movement in estimated max — consider progression or recovery adjustments.',
    })
  }

  return {
    hasSetData: true,
    cards: cards.slice(0, 4),
    recentPrs: prs.slice(0, 3),
  }
}

export const buildReadinessSnapshot = (athleteState = null) => {
  if (!athleteState?.readiness?.entries?.length) {
    return {
      available: false,
      band: null,
      score: null,
      status: 'No readiness check-ins yet',
      detail: 'Readiness appears when the athlete completes daily check-ins.',
      trend: null,
      factors: [],
      mobility: null,
    }
  }

  const readiness = calculateReadiness(athleteState)
  const trend = readinessTrendSnapshot(athleteState, 14)

  let band = READINESS_BAND.MANAGE
  if (readiness.score >= 82) band = READINESS_BAND.READY
  else if (readiness.score < 48) band = READINESS_BAND.RECOVERY

  const baseline = trend.average
  let trendLabel = null
  if (baseline !== null && readiness.score !== null) {
    if (readiness.score >= baseline + 5) trendLabel = 'Above recent baseline'
    else if (readiness.score <= baseline - 8) trendLabel = 'Below recent baseline'
    else trendLabel = 'Near recent baseline'
  }

  const mobilityCompleted = (athleteState?.mobility?.completed ?? []).filter(
    (entry) => {
      const time = toTime(entry?.completedAt)
      return time !== null && Date.now() - time <= 7 * DAY_MS
    },
  )

  return {
    available: readiness.completed,
    band,
    score: readiness.score,
    status: readiness.status,
    detail: readiness.recommendation,
    trend: trendLabel,
    factors: readiness.factors ?? [],
    mobility: {
      recentCount: mobilityCompleted.length,
      detail:
        mobilityCompleted.length > 0
          ? `${mobilityCompleted.length} recovery flow${mobilityCompleted.length === 1 ? '' : 's'} in the last 7 days.`
          : 'No mobility or reset completions logged this week.',
    },
  }
}

export const buildNutritionSnapshot = ({
  nutritionProfile = null,
  nutritionDays = [],
  now = new Date(),
} = {}) => {
  const coachAccess = Boolean(nutritionProfile?.coach_access)
  const goals = nutritionProfile?.goals ?? {}

  if (!coachAccess) {
    return {
      available: false,
      shared: false,
      status: 'Nutrition not shared',
      detail: 'The athlete has not enabled coach nutrition access.',
    }
  }

  const weekStart = startOfDay(now).getTime() - 6 * DAY_MS
  const weekDays = nutritionDays.filter((row) => {
    const time = toTime(`${row.log_date}T12:00:00`)
    return time !== null && time >= weekStart
  })

  const loggedDays = weekDays.filter((row) => {
    const snapshot = row.snapshot ?? {}
    return (snapshot.foods ?? []).length > 0
  })

  if (!loggedDays.length && !nutritionDays.length) {
    return {
      available: true,
      shared: true,
      status: 'No recent nutrition logs',
      detail: 'Nutrition sharing is enabled, but nothing has been logged recently.',
      daysLoggedThisWeek: 0,
    }
  }

  const totals = loggedDays.map((row) =>
    nutritionTotals(row.snapshot ?? {}),
  )

  const avgCalories =
    totals.length > 0
      ? Math.round(
          totals.reduce((sum, item) => sum + item.calories, 0) / totals.length,
        )
      : null

  const avgProtein =
    totals.length > 0
      ? Math.round(
          totals.reduce((sum, item) => sum + item.protein, 0) / totals.length,
        )
      : null

  const calorieTarget = Number(goals.calories || 0)
  const proteinTarget = Number(goals.protein || 0)

  const calorieAdherence =
    avgCalories !== null && calorieTarget > 0
      ? Math.round((avgCalories / calorieTarget) * 100)
      : null

  const proteinAdherence =
    avgProtein !== null && proteinTarget > 0
      ? Math.round((avgProtein / proteinTarget) * 100)
      : null

  let consistency = 'Logging is light this week'
  if (loggedDays.length >= 5) consistency = 'Consistent logging this week'
  else if (loggedDays.length >= 3) consistency = 'Moderate logging this week'

  return {
    available: true,
    shared: true,
    status: consistency,
    detail:
      avgCalories !== null
        ? `Recent average: ${avgCalories} kcal · ${avgProtein ?? '—'} g protein.`
        : 'Nutrition sharing is active with limited recent entries.',
    daysLoggedThisWeek: loggedDays.length,
    calorieAdherence,
    proteinAdherence,
    avgCalories,
    avgProtein,
  }
}

export const buildAssignmentStatus = (assignments = [], now = new Date()) => {
  const active = activeAssignment(assignments)
  const latestCompleted = latestCompletedAssignment(assignments)
  const previousCompleted = previousCompletedAssignment(
    assignments,
    latestCompleted?.id,
  )

  return {
    active: active
      ? {
          id: active.id,
          title: active.title,
          status: active.status,
          dueDate: active.due_date ?? null,
          assignedAt: active.assigned_at ?? null,
          overdue:
            active.due_date &&
            active.due_date < todayKey(now) &&
            ['assigned', 'started'].includes(active.status),
        }
      : null,
    latestCompleted: latestCompleted
      ? {
          id: latestCompleted.id,
          title: latestCompleted.title,
          completedAt: latestCompleted.completed_at,
          relativeLabel: relativeDayLabel(latestCompleted.completed_at, now),
          summary: assignmentCompletionSummary(latestCompleted),
        }
      : null,
    previousCompleted: previousCompleted
      ? {
          id: previousCompleted.id,
          title: previousCompleted.title,
          completedAt: previousCompleted.completed_at,
          relativeLabel: relativeDayLabel(previousCompleted.completed_at, now),
        }
      : null,
  }
}

export const buildClientAttentionItems = ({
  history = [],
  assignments = [],
  readiness = null,
  nutrition = null,
  now = new Date(),
} = {}) => {
  const items = []
  const last = latestSession(history)
  const daysSinceLast = last
    ? daysBetween(sessionTimestamp(last), now)
    : null
  const consistency = calculateClientConsistency(history, now)
  const assignment = buildAssignmentStatus(assignments, now)

  if (daysSinceLast !== null && daysSinceLast >= 5) {
    items.push({
      id: 'inactive',
      title: 'Training gap detected',
      description: `No workout has been completed in ${daysSinceLast} days.`,
      severity: ATTENTION_SEVERITY.ALERT,
      action: 'training',
      actionLabel: 'View training',
    })
  } else if (
    consistency.priorWeeklyAverage !== null &&
    consistency.workoutsThisWeek <
      Math.max(1, Math.floor(consistency.priorWeeklyAverage * 0.6))
  ) {
    items.push({
      id: 'frequency-drop',
      title: 'Consistency has softened',
      description:
        'Training frequency is lower than the previous two weeks.',
      severity: ATTENTION_SEVERITY.WATCH,
      action: 'training',
      actionLabel: 'View training',
    })
  }

  if (assignment.active?.overdue) {
    items.push({
      id: 'overdue-assignment',
      title: 'Assigned workout is overdue',
      description: `${assignment.active.title} was due ${formatShortDate(assignment.active.dueDate)} and remains incomplete.`,
      severity: ATTENTION_SEVERITY.ALERT,
      action: 'assignment',
      actionLabel: 'Review assignment',
    })
  } else if (assignment.active?.status === 'assigned') {
    items.push({
      id: 'open-assignment',
      title: 'Assigned workout still open',
      description: `${assignment.active.title} has not been started yet.`,
      severity: ATTENTION_SEVERITY.WATCH,
      action: 'assignment',
      actionLabel: 'Review assignment',
    })
  }

  if (
    readiness?.available &&
    readiness.trend === 'Below recent baseline'
  ) {
    items.push({
      id: 'readiness-low',
      title: 'Readiness is below baseline',
      description: readiness.detail,
      severity: ATTENTION_SEVERITY.WATCH,
      action: 'progress',
      actionLabel: 'View recovery',
    })
  }

  if (
    nutrition?.shared &&
    nutrition.daysLoggedThisWeek !== undefined &&
    nutrition.daysLoggedThisWeek < 3
  ) {
    items.push({
      id: 'nutrition-light',
      title: 'Nutrition logging is inconsistent',
      description:
        nutrition.detail || 'Fewer than three days were logged this week.',
      severity: ATTENTION_SEVERITY.WATCH,
      action: null,
      actionLabel: null,
    })
  }

  const improvement = bestRecentImprovement(history)
  if (improvement && items.length < 3) {
    items.push({
      id: 'performance-up',
      title: `${improvement.exercise} is improving`,
      description: `Estimated max has climbed across the last three exposures (+${improvement.delta} lb e1RM).`,
      severity: ATTENTION_SEVERITY.INFO,
      action: 'progress',
      actionLabel: 'View progress',
    })
  }

  if (!items.length) {
    items.push({
      id: 'all-clear',
      title: 'Training looks steady',
      description: history.length
        ? 'No immediate issues flagged from recent training, assignments, or recovery signals.'
        : 'Connect training history and assignments to unlock richer coaching insights.',
      severity: ATTENTION_SEVERITY.INFO,
      action: history.length ? 'training' : null,
      actionLabel: history.length ? 'View training' : null,
    })
  }

  return items.slice(0, 3)
}

const formatShortDate = (value) => {
  if (!value) return 'recently'
  return new Date(`${value}T12:00:00`).toLocaleDateString([], {
    month: 'short',
    day: 'numeric',
  })
}

export const buildClientSnapshot = ({
  client,
  history = [],
  assignments = [],
  readiness = null,
  assignmentStatus = null,
  consistency = null,
  now = new Date(),
} = {}) => {
  const resolvedConsistency =
    consistency ?? calculateClientConsistency(history, now)
  const resolvedAssignment =
    assignmentStatus ?? buildAssignmentStatus(assignments, now)
  const last = latestSession(history)
  const daysSinceConnect = client?.created_at
    ? daysBetween(client.created_at, now)
    : null

  let clientStatus = 'Active Client'
  if (!history.length && !assignments.some((item) => item.status === 'completed')) {
    clientStatus = daysSinceConnect !== null && daysSinceConnect <= 14
      ? 'New Client'
      : 'Awaiting first workout'
  } else if (
    last &&
    daysBetween(sessionTimestamp(last), now) !== null &&
    daysBetween(sessionTimestamp(last), now) >= 7
  ) {
    clientStatus = 'Needs Attention'
  }

  return {
    clientStatus,
    training: {
      label: 'Training',
      value: resolvedConsistency.workoutsThisWeek
        ? `${resolvedConsistency.workoutsThisWeek} session${resolvedConsistency.workoutsThisWeek === 1 ? '' : 's'} this week`
        : 'No sessions this week',
      detail: resolvedConsistency.label,
    },
    consistency: {
      label: 'Consistency',
      value: resolvedConsistency.streak
        ? `${resolvedConsistency.streak}-day rhythm`
        : resolvedConsistency.label,
      detail:
        resolvedConsistency.priorWeeklyAverage !== null
          ? `Prior two-week average: ${resolvedConsistency.priorWeeklyAverage} sessions/week`
          : null,
    },
    latest: last
      ? {
          label: 'Latest',
          value: `${last.name ?? 'Workout'} · ${relativeDayLabel(sessionTimestamp(last), now) ?? 'Recently'}`,
          detail: null,
        }
      : {
          label: 'Latest',
          value: 'No completed workouts yet',
          detail: null,
        },
    readiness: readiness?.available
      ? {
          label: 'Readiness',
          value: `${readiness.score} · ${readinessBandLabel(readiness.band)}`,
          detail: readiness.status,
        }
      : {
          label: 'Readiness',
          value: 'Not shared yet',
          detail: readiness?.detail ?? 'Check-ins will appear when logged.',
        },
    program: resolvedAssignment.active
      ? {
          label: 'Program',
          value: resolvedAssignment.active.title,
          detail: resolvedAssignment.active.dueDate
            ? `Due ${formatShortDate(resolvedAssignment.active.dueDate)}`
            : resolvedAssignment.active.status,
        }
      : resolvedAssignment.latestCompleted
      ? {
          label: 'Program',
          value: resolvedAssignment.latestCompleted.title,
          detail: `Last completed ${resolvedAssignment.latestCompleted.relativeLabel ?? 'recently'}`,
        }
      : {
          label: 'Program',
          value: 'No active assignment',
          detail: 'Assign the next session when ready.',
        },
  }
}

const readinessBandLabel = (band) => {
  if (band === READINESS_BAND.READY) return 'Ready'
  if (band === READINESS_BAND.RECOVERY) return 'Recovery Priority'
  return 'Manage Load'
}

export const buildClientIntelligence = ({
  client,
  assignments = [],
  athleteState = null,
  nutritionProfile = null,
  nutritionDays = [],
  clientNotes = '',
  notesUpdatedAt = null,
  now = new Date(),
} = {}) => {
  const history = normalizeClientTrainingHistory({
    athleteState,
    assignments,
  })
  const readiness = buildReadinessSnapshot(athleteState)
  const nutrition = buildNutritionSnapshot({
    nutritionProfile,
    nutritionDays,
    now,
  })
  const assignmentStatus = buildAssignmentStatus(assignments, now)
  const consistency = calculateClientConsistency(history, now)
  const training = buildTrainingSnapshot(history, now)
  const performance = buildPerformanceInsights(history)
  const attention = buildClientAttentionItems({
    history,
    assignments,
    readiness,
    nutrition,
    now,
  })
  const snapshot = buildClientSnapshot({
    client,
    history,
    assignments,
    readiness,
    assignmentStatus,
    consistency,
    now,
  })

  return {
    history,
    snapshot,
    attention,
    training,
    performance,
    readiness,
    nutrition,
    assignmentStatus,
    notes: {
      preview: clientNotes.trim()
        ? clientNotes.trim().split('\n').find(Boolean) ?? clientNotes.trim()
        : '',
      updatedAt: notesUpdatedAt,
      hasNotes: Boolean(clientNotes.trim()),
    },
  }
}
