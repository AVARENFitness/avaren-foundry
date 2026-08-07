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
import {
  getCoachWeekRange,
  isDateInWeek,
} from './weeklyReview'

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

export const CLIENT_ROSTER_STATUS = {
  ON_TRACK: 'ON TRACK',
  NEEDS_ATTENTION: 'NEEDS ATTENTION',
  RECOVERY_PRIORITY: 'RECOVERY PRIORITY',
  INACTIVE: 'INACTIVE',
  NEW_CLIENT: 'NEW CLIENT',
}

export const COACH_CLIENT_SORT = {
  NEEDS_ATTENTION: 'needs_attention',
  RECENTLY_ACTIVE: 'recently_active',
  LEAST_ACTIVE: 'least_active',
  ACTIVE_ASSIGNMENT: 'active_assignment',
  READY: 'ready',
  RECOVERY: 'recovery',
  ALL: 'all',
}

const ATTENTION_PRIORITY = {
  inactive: 100,
  'overdue-assignment': 90,
  'readiness-low': 80,
  'open-assignment': 70,
  'frequency-drop': 60,
  'nutrition-light': 50,
}

const STATUS_SORT_SCORE = {
  [CLIENT_ROSTER_STATUS.RECOVERY_PRIORITY]: 100,
  [CLIENT_ROSTER_STATUS.INACTIVE]: 90,
  [CLIENT_ROSTER_STATUS.NEEDS_ATTENTION]: 80,
  [CLIENT_ROSTER_STATUS.NEW_CLIENT]: 40,
  [CLIENT_ROSTER_STATUS.ON_TRACK]: 10,
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

export const displayClientName = (email = '') => {
  const local = email.split('@')[0] ?? email
  return local
    .split(/[._-]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ')
}

export const relativeTimeLabel = (value, now = new Date()) => {
  const time = toTime(value)
  if (time === null) return null

  const diffMs = now.getTime() - time
  const diffMins = Math.floor(diffMs / 60000)

  if (diffMins < 1) return 'Just now'
  if (diffMins < 60) return `${diffMins}m ago`

  const diffHours = Math.floor(diffMs / 3600000)
  if (diffHours < 24) return `${diffHours}h ago`

  return relativeDayLabel(value, now)
}

export const buildClientRosterStatus = ({
  client,
  history = [],
  assignments = [],
  readiness = null,
  attention = [],
  now = new Date(),
} = {}) => {
  const last = latestSession(history)
  const daysSinceLast = last
    ? daysBetween(sessionTimestamp(last), now)
    : null
  const daysSinceConnect = client?.created_at
    ? daysBetween(client.created_at, now)
    : null
  const hasCompletedWork =
    history.length > 0 ||
    assignments.some((item) => item.status === 'completed')

  if (
    !hasCompletedWork &&
    daysSinceConnect !== null &&
    daysSinceConnect <= 14
  ) {
    return CLIENT_ROSTER_STATUS.NEW_CLIENT
  }

  if (readiness?.available && readiness.band === READINESS_BAND.RECOVERY) {
    return CLIENT_ROSTER_STATUS.RECOVERY_PRIORITY
  }

  if (daysSinceLast !== null && daysSinceLast >= 7) {
    return CLIENT_ROSTER_STATUS.INACTIVE
  }

  const actionableAttention = attention.filter((item) => item.id !== 'all-clear')
  if (
    actionableAttention.some(
      (item) => item.severity === ATTENTION_SEVERITY.ALERT,
    ) ||
    (daysSinceLast !== null && daysSinceLast >= 5)
  ) {
    return CLIENT_ROSTER_STATUS.NEEDS_ATTENTION
  }

  if (
    actionableAttention.some(
      (item) => item.severity === ATTENTION_SEVERITY.WATCH,
    ) ||
    (readiness?.available && readiness.band === READINESS_BAND.MANAGE)
  ) {
    return CLIENT_ROSTER_STATUS.NEEDS_ATTENTION
  }

  return CLIENT_ROSTER_STATUS.ON_TRACK
}

export const rankClientAttention = (clientEntries = [], { limit = 5 } = {}) => {
  const ranked = []

  clientEntries.forEach((entry) => {
    entry.intelligence.attention.forEach((item) => {
      if (item.id === 'all-clear' || item.id === 'performance-up') return

      ranked.push({
        client: entry.client,
        clientName: displayClientName(entry.client?.athlete_email),
        item,
        priority: ATTENTION_PRIORITY[item.id] ?? 40,
        actionLabel:
          item.actionLabel ??
          (item.action === 'assignment'
            ? 'Review Assignment'
            : item.action === 'progress'
            ? 'Review Recovery'
            : 'View Client'),
      })
    })
  })

  return ranked
    .sort((first, second) => second.priority - first.priority)
    .slice(0, limit)
}

export const buildClientRosterEntry = ({
  client,
  assignments = [],
  athleteState = null,
  nutritionProfile = null,
  nutritionDays = [],
  now = new Date(),
} = {}) => {
  const clientAssignments = assignments.filter(
    (item) => item.athlete_id === client.athlete_id,
  )
  const intelligence = buildClientIntelligence({
    client,
    assignments: clientAssignments,
    athleteState,
    nutritionProfile,
    nutritionDays,
    now,
  })
  const status = buildClientRosterStatus({
    client,
    history: intelligence.history,
    assignments: clientAssignments,
    readiness: intelligence.readiness,
    attention: intelligence.attention,
    now,
  })
  const actionableAttention = intelligence.attention.filter(
    (item) => item.id !== 'all-clear' && item.id !== 'performance-up',
  )
  const lastSession = intelligence.training.lastSession
  const win = buildClientWin(intelligence, now)

  return {
    client,
    clientName: displayClientName(client.athlete_email),
    status,
    sortScore: STATUS_SORT_SCORE[status] ?? 0,
    intelligence,
    attentionCount: actionableAttention.length,
    hasWin: Boolean(win),
    winLabel: win?.label ?? null,
    card: {
      workoutsThisWeek: intelligence.training.workoutsThisWeek,
      lastWorkoutLabel: lastSession?.relativeLabel ?? null,
      readinessLabel: intelligence.readiness.available
        ? `${intelligence.readiness.score} · ${readinessBandLabel(intelligence.readiness.band)}`
        : null,
      assignmentLabel: intelligence.assignmentStatus.active
        ? intelligence.assignmentStatus.active.overdue
          ? 'Assignment overdue'
          : 'Assignment active'
        : intelligence.assignmentStatus.latestCompleted
        ? 'No active assignment'
        : null,
      activeAssignmentTitle: intelligence.assignmentStatus.active?.title ?? null,
    },
    lastActivityAt:
      lastSession?.date ??
      intelligence.assignmentStatus.latestCompleted?.completedAt ??
      null,
    daysSinceLastActivity: lastSession
      ? daysBetween(sessionTimestamp(lastSession), now)
      : null,
  }
}

const buildClientWin = (intelligence, now = new Date()) => {
  if (intelligence.performance.recentPrs?.length) {
    const pr = intelligence.performance.recentPrs[0]
    return {
      label: `${pr.exercise} PR`,
      detail: `${pr.type} · ${pr.value}`,
    }
  }

  if (intelligence.training.streak >= 3) {
    return {
      label: `${intelligence.training.streak}-day rhythm`,
      detail: 'Consistent training streak',
    }
  }

  if (intelligence.performance.cards?.some((card) => card.id === 'improvement')) {
    const card = intelligence.performance.cards.find(
      (item) => item.id === 'improvement',
    )
    return {
      label: card.title,
      detail: card.value,
    }
  }

  const weekStart = startOfDay(now).getTime() - 6 * DAY_MS
  const completedThisWeek = intelligence.history.filter((session) => {
    const time = toTime(sessionTimestamp(session))
    return time !== null && time >= weekStart
  }).length

  if (completedThisWeek >= 3) {
    return {
      label: 'Strong week',
      detail: `${completedThisWeek} sessions completed`,
    }
  }

  return null
}

export const buildCoachPortfolioSnapshot = ({
  rosterEntries = [],
  assignments = [],
  now = new Date(),
} = {}) => {
  const weekStart = startOfDay(now).getTime() - 6 * DAY_MS
  const activeAssignments = assignments.filter((item) =>
    ['assigned', 'started'].includes(item.status),
  )
  const completedThisWeek = assignments.filter(
    (item) =>
      item.status === 'completed' &&
      toTime(item.completed_at) !== null &&
      toTime(item.completed_at) >= weekStart,
  )
  const trainedThisWeek = rosterEntries.filter(
    (entry) => entry.card.workoutsThisWeek > 0,
  ).length
  const needsAttention = rosterEntries.filter(
    (entry) =>
      entry.status === CLIENT_ROSTER_STATUS.NEEDS_ATTENTION ||
      entry.status === CLIENT_ROSTER_STATUS.INACTIVE ||
      entry.status === CLIENT_ROSTER_STATUS.RECOVERY_PRIORITY,
  ).length

  return {
    activeClients: rosterEntries.length,
    trainedThisWeek,
    needsAttention,
    activeAssignments: activeAssignments.length,
    weekly: {
      totalWorkoutsCompleted: completedThisWeek.length,
      clientsWhoTrained: trainedThisWeek,
      assignmentsCompleted: completedThisWeek.length,
      activeIncomplete: activeAssignments.length,
      overdueAssignments: activeAssignments.filter(
        (item) => item.due_date && item.due_date < todayKey(now),
      ).length,
      followUpCount: needsAttention,
    },
  }
}

export const buildCoachActivityFeed = ({
  rosterEntries = [],
  assignments = [],
  now = new Date(),
} = {}) => {
  const events = []

  assignments
    .filter((item) => item.status === 'completed' && item.completed_at)
    .forEach((item) => {
      const client = rosterEntries.find(
        (entry) => entry.client.athlete_id === item.athlete_id,
      )
      events.push({
        id: `assignment-complete-${item.id}`,
        type: 'assignment_completed',
        athleteId: item.athlete_id,
        clientName:
          client?.clientName ??
          displayClientName(
            rosterEntries.find((entry) => entry.client.athlete_id === item.athlete_id)
              ?.client?.athlete_email,
          ),
        title: `${client?.clientName ?? 'Client'} completed ${item.title}`,
        subtitle: item.title,
        timestamp: item.completed_at,
        relativeLabel: relativeTimeLabel(item.completed_at, now),
        client: client?.client ?? null,
      })
    })

  rosterEntries.forEach((entry) => {
    entry.intelligence.performance.recentPrs?.slice(0, 2).forEach((pr) => {
      events.push({
        id: `pr-${entry.client.athlete_id}-${pr.id}`,
        type: 'pr',
        athleteId: entry.client.athlete_id,
        clientName: entry.clientName,
        title: `${entry.clientName} hit a new ${pr.type.toLowerCase()}`,
        subtitle: `${pr.exercise} · ${pr.value}`,
        timestamp: pr.date ? `${pr.date}T12:00:00` : null,
        relativeLabel: relativeTimeLabel(
          pr.date ? `${pr.date}T12:00:00` : null,
          now,
        ),
        client: entry.client,
      })
    })

    const nutrition = entry.intelligence.nutrition
    if (nutrition.shared && nutrition.daysLoggedThisWeek > 0) {
      events.push({
        id: `nutrition-${entry.client.athlete_id}`,
        type: 'nutrition',
        athleteId: entry.client.athlete_id,
        clientName: entry.clientName,
        title: `${entry.clientName} logged nutrition`,
        subtitle: nutrition.status,
        timestamp: now.toISOString(),
        relativeLabel: 'This week',
        client: entry.client,
      })
    }
  })

  return events
    .filter((event) => event.timestamp && toTime(event.timestamp) !== null)
    .sort(
      (first, second) =>
        toTime(second.timestamp) - toTime(first.timestamp),
    )
    .slice(0, 10)
}

export const buildClientWins = (rosterEntries = [], { limit = 5 } = {}) =>
  rosterEntries
    .map((entry) => {
      const win = buildClientWin(entry.intelligence)
      if (!win) return null
      return {
        id: `win-${entry.client.athlete_id}`,
        client: entry.client,
        clientName: entry.clientName,
        label: win.label,
        detail: win.detail,
        status: entry.status,
      }
    })
    .filter(Boolean)
    .slice(0, limit)

export const buildAssignmentOverview = (assignments = [], now = new Date()) => {
  const active = assignments.filter((item) =>
    ['assigned', 'started'].includes(item.status),
  )
  const weekStart = startOfDay(now).getTime() - 6 * DAY_MS
  const completedRecently = assignments
    .filter(
      (item) =>
        item.status === 'completed' &&
        toTime(item.completed_at) !== null &&
        toTime(item.completed_at) >= weekStart,
    )
    .sort(
      (first, second) =>
        toTime(second.completed_at) - toTime(first.completed_at),
    )
    .slice(0, 5)

  return {
    active: active.length,
    incomplete: active.filter((item) => item.status === 'assigned').length,
    overdue: active.filter(
      (item) => item.due_date && item.due_date < todayKey(now),
    ).length,
    completedRecently,
  }
}

export const sortCoachClients = (
  rosterEntries = [],
  sortKey = COACH_CLIENT_SORT.NEEDS_ATTENTION,
) => {
  const entries = [...rosterEntries]

  switch (sortKey) {
    case COACH_CLIENT_SORT.RECENTLY_ACTIVE:
      return entries.sort(
        (first, second) =>
          toTime(second.lastActivityAt ? `${second.lastActivityAt}T12:00:00` : null) -
          toTime(first.lastActivityAt ? `${first.lastActivityAt}T12:00:00` : null),
      )
    case COACH_CLIENT_SORT.LEAST_ACTIVE:
      return entries.sort(
        (first, second) =>
          (second.daysSinceLastActivity ?? 999) -
          (first.daysSinceLastActivity ?? 999),
      )
    case COACH_CLIENT_SORT.ACTIVE_ASSIGNMENT:
      return entries.sort((first, second) => {
        const firstActive = Boolean(first.intelligence.assignmentStatus.active)
        const secondActive = Boolean(second.intelligence.assignmentStatus.active)
        if (firstActive !== secondActive) return secondActive - firstActive
        return second.sortScore - first.sortScore
      })
    case COACH_CLIENT_SORT.READY:
      return entries.sort((first, second) => {
        const firstReady =
          first.intelligence.readiness.band === READINESS_BAND.READY ? 1 : 0
        const secondReady =
          second.intelligence.readiness.band === READINESS_BAND.READY ? 1 : 0
        return secondReady - firstReady || second.sortScore - first.sortScore
      })
    case COACH_CLIENT_SORT.RECOVERY:
      return entries.sort((first, second) => {
        const firstRecovery =
          first.status === CLIENT_ROSTER_STATUS.RECOVERY_PRIORITY ? 1 : 0
        const secondRecovery =
          second.status === CLIENT_ROSTER_STATUS.RECOVERY_PRIORITY ? 1 : 0
        return secondRecovery - firstRecovery || second.sortScore - first.sortScore
      })
    case COACH_CLIENT_SORT.ALL:
      return entries.sort((first, second) =>
        first.clientName.localeCompare(second.clientName),
      )
    case COACH_CLIENT_SORT.NEEDS_ATTENTION:
    default:
      return entries.sort(
        (first, second) =>
          second.sortScore - first.sortScore ||
          second.attentionCount - first.attentionCount ||
          first.clientName.localeCompare(second.clientName),
      )
  }
}

export const buildCoachPortfolioIntelligence = ({
  clients = [],
  assignments = [],
  athleteStatesById = {},
  nutritionByAthleteId = {},
  weeklyReviewsByAthleteId = {},
  now = new Date(),
} = {}) => {
  const weekRange = getCoachWeekRange(now)

  const rosterEntries = clients.map((client) => {
    const entry = buildClientRosterEntry({
      client,
      assignments,
      athleteState: athleteStatesById[client.athlete_id] ?? null,
      nutritionProfile: nutritionByAthleteId[client.athlete_id]?.profile ?? null,
      nutritionDays: nutritionByAthleteId[client.athlete_id]?.days ?? [],
      now,
    })
    const currentReview = weeklyReviewsByAthleteId[client.athlete_id] ?? null
    const reviewedThisWeek =
      currentReview?.weekStart === weekRange.weekStart

    return {
      ...entry,
      weeklyReviewStatus: reviewedThisWeek ? 'REVIEWED' : 'REVIEW DUE',
      currentWeeklyReview: currentReview,
    }
  })

  const hero = buildCoachPortfolioSnapshot({
    rosterEntries,
    assignments,
    now,
  })
  let attentionQueue = rankClientAttention(
    rosterEntries.map((entry) => ({
      client: entry.client,
      intelligence: entry.intelligence,
    })),
    { limit: 8 },
  )

  const reviewAttention = rosterEntries
    .filter((entry) => entry.weeklyReviewStatus === 'REVIEW DUE')
    .map((entry) => ({
      client: entry.client,
      clientName: entry.clientName,
      item: {
        id: 'weekly-review-due',
        title: 'Weekly review not completed',
        description: `Review ${entry.clientName}'s week while context is still fresh.`,
        severity: ATTENTION_SEVERITY.WATCH,
      },
      priority: 30,
      actionLabel: 'Review Client',
    }))

  attentionQueue = [...attentionQueue, ...reviewAttention]
    .sort((first, second) => second.priority - first.priority)
    .slice(0, 8)

  const activityFeed = buildCoachActivityFeed({
    rosterEntries,
    assignments,
    now,
  })
  const wins = buildClientWins(rosterEntries)
  const assignmentOverview = buildAssignmentOverview(assignments, now)
  const reviewsComplete = rosterEntries.filter(
    (entry) => entry.weeklyReviewStatus === 'REVIEWED',
  ).length
  const reviewQueue = rankClientsForWeeklyReview(
    rosterEntries,
    weeklyReviewsByAthleteId,
    now,
  )

  return {
    rosterEntries,
    hero: {
      ...hero,
      weeklyReviews: {
        complete: reviewsComplete,
        total: clients.length,
        remaining: Math.max(0, clients.length - reviewsComplete),
      },
    },
    attentionQueue,
    activityFeed,
    wins,
    assignmentOverview,
    weekly: hero.weekly,
    reviewQueue,
    weekRange,
  }
}

export const buildWeeklyReviewSnapshot = ({
  intelligence,
  assignments = [],
  weekRange = getCoachWeekRange(),
  now = new Date(),
} = {}) => {
  const history = intelligence?.history ?? []
  const { weekStart, weekEnd } = weekRange

  const priorStart = new Date(`${weekStart}T12:00:00`)
  priorStart.setDate(priorStart.getDate() - 7)
  const priorEnd = new Date(`${weekStart}T12:00:00`)
  priorEnd.setDate(priorEnd.getDate() - 1)
  const priorWeekStart = priorStart.toISOString().slice(0, 10)
  const priorWeekEnd = priorEnd.toISOString().slice(0, 10)

  const sessionsThisWeek = history.filter((session) =>
    isDateInWeek(
      session.date ?? session.finishedAt?.slice(0, 10),
      weekStart,
      weekEnd,
    ),
  )
  const sessionsPriorWeek = history.filter((session) =>
    isDateInWeek(
      session.date ?? session.finishedAt?.slice(0, 10),
      priorWeekStart,
      priorWeekEnd,
    ),
  )

  const completedAssignmentsThisWeek = assignments.filter(
    (item) =>
      item.status === 'completed' &&
      isDateInWeek(item.completed_at, weekStart, weekEnd),
  )
  const activeAssignment = intelligence?.assignmentStatus?.active ?? null

  const weekVolume = sessionsThisWeek.reduce((total, session) => {
    const volume =
      session.summary?.volume ??
      (Array.isArray(session.sets)
        ? session.sets.reduce(
            (sum, set) =>
              sum + Number(set.weight || 0) * Number(set.reps || 0),
            0,
          )
        : 0)
    return total + Number(volume || 0)
  }, 0)

  const priorWeekVolume = sessionsPriorWeek.reduce((total, session) => {
    const volume =
      session.summary?.volume ??
      (Array.isArray(session.sets)
        ? session.sets.reduce(
            (sum, set) =>
              sum + Number(set.weight || 0) * Number(set.reps || 0),
            0,
          )
        : 0)
    return total + Number(volume || 0)
  }, 0)

  let volumeTrend = 'unknown'
  if (weekVolume > 0 || priorWeekVolume > 0) {
    if (weekVolume > priorWeekVolume * 1.08) volumeTrend = 'up'
    else if (weekVolume < priorWeekVolume * 0.92) volumeTrend = 'down'
    else volumeTrend = 'flat'
  }

  const nutrition = intelligence?.nutrition ?? {}
  const nutritionDaysThisWeek = (nutrition.shared
    ? intelligence?.nutrition?.daysLoggedThisWeek
    : null)

  const weekPrs = (intelligence?.performance?.recentPrs ?? []).filter((pr) =>
    isDateInWeek(pr.date, weekStart, weekEnd),
  )

  const wins = []
  if (sessionsThisWeek.length >= 3) {
    wins.push({
      id: 'strong-week',
      label: 'Strong training week',
      detail: `${sessionsThisWeek.length} sessions completed`,
    })
  }
  if (weekPrs.length) {
    wins.push({
      id: 'week-pr',
      label: 'New performance marker',
      detail: `${weekPrs[0].exercise} · ${weekPrs[0].value}`,
    })
  }
  if (
    intelligence?.training?.workoutsThisWeek > 0 &&
    intelligence?.training?.priorWeeklyAverage !== null &&
    intelligence.training.workoutsThisWeek >=
      intelligence.training.priorWeeklyAverage
  ) {
    wins.push({
      id: 'consistency-up',
      label: 'Consistency held or improved',
      detail: intelligence.training.label,
    })
  }
  if (completedAssignmentsThisWeek.length) {
    wins.push({
      id: 'assignment-complete',
      label: 'Assigned work completed',
      detail: `${completedAssignmentsThisWeek.length} assignment${completedAssignmentsThisWeek.length === 1 ? '' : 's'} finished`,
    })
  }
  if (nutrition.shared && nutritionDaysThisWeek >= 5) {
    wins.push({
      id: 'nutrition-logging',
      label: 'Nutrition logging improved',
      detail: `${nutritionDaysThisWeek} days logged this week`,
    })
  }

  const reviewItems = buildClientAttentionItems({
    history,
    assignments,
    readiness: intelligence?.readiness ?? null,
    nutrition: intelligence?.nutrition ?? null,
    now,
  }).filter((item) => item.id !== 'all-clear' && item.id !== 'performance-up')

  return {
    weekRange,
    training: {
      workoutsCompleted: sessionsThisWeek.length,
      priorWeekWorkouts: sessionsPriorWeek.length,
      consistency: intelligence?.training?.label ?? 'No training logged',
      activeAssignment: activeAssignment?.title ?? null,
      activeAssignmentStatus: activeAssignment?.status ?? null,
      volumeTrend,
      weekVolume: weekVolume > 0 ? Math.round(weekVolume) : null,
      priorWeekVolume: priorWeekVolume > 0 ? Math.round(priorWeekVolume) : null,
    },
    recovery: {
      available: Boolean(intelligence?.readiness?.available),
      score: intelligence?.readiness?.score ?? null,
      status: intelligence?.readiness?.status ?? 'No readiness data this week',
      trend: intelligence?.readiness?.trend ?? null,
      mobility: intelligence?.readiness?.mobility?.detail ?? null,
    },
    nutrition: {
      available: Boolean(intelligence?.nutrition?.available),
      shared: Boolean(intelligence?.nutrition?.shared),
      daysLogged: nutritionDaysThisWeek ?? null,
      status: intelligence?.nutrition?.status ?? 'No nutrition data this week',
      calorieAdherence: intelligence?.nutrition?.calorieAdherence ?? null,
      proteinAdherence: intelligence?.nutrition?.proteinAdherence ?? null,
    },
    progress: {
      prs: weekPrs,
      performanceCards: intelligence?.performance?.cards ?? [],
      streak: intelligence?.training?.streak ?? null,
    },
    wins,
    reviewItems,
  }
}

export const rankClientsForWeeklyReview = (
  rosterEntries = [],
  weeklyReviewsByAthleteId = {},
  now = new Date(),
) => {
  const { weekStart } = getCoachWeekRange(now)

  return rosterEntries
    .filter((entry) => {
      const review = weeklyReviewsByAthleteId[entry.client.athlete_id]
      return !review || review.weekStart !== weekStart
    })
    .sort(
      (first, second) =>
        second.sortScore - first.sortScore ||
        second.attentionCount - first.attentionCount ||
        first.clientName.localeCompare(second.clientName),
    )
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
