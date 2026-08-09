import { forgeSnapshot } from './forge'
import { calculateReadiness } from './readiness'
import { buildTrainingWeek } from './trainingWeek'
import { isWeeklyCheckInDue } from './weeklyCheckIn'

export const NOTIFICATION_TYPES = {
  READINESS: 'readiness',
  WEEKLY_CHECKIN: 'weekly-checkin',
  WORKOUT: 'workout',
  RECOVERY: 'recovery',
  MISSED: 'missed',
  FORGE: 'forge',
  STREAK: 'streak',
}

export const NOTIFICATION_ACTIONS = {
  OPEN_READINESS: 'open-readiness',
  OPEN_WEEKLY_CHECKIN: 'open-weekly-checkin',
  START_WORKOUT: 'start-workout',
  START_RECOVERY: 'start-recovery',
  OPEN_PLANNER: 'open-planner',
  OPEN_FORGE: 'open-forge',
  OPEN_JOURNEY: 'open-journey',
  NONE: 'none',
}

const DAY_MS = 86400000

const isoDate = (value = new Date()) =>
  new Date(value).toISOString().slice(0, 10)

const makeNotification = ({
  id,
  type,
  priority,
  title,
  body,
  action = NOTIFICATION_ACTIONS.NONE,
  actionLabel = null,
  createdAt = new Date().toISOString(),
  expiresAt = null,
  fingerprint,
}) => ({
  id,
  type,
  priority,
  title,
  body,
  action,
  actionLabel,
  createdAt,
  expiresAt,
  fingerprint,
})

const latestWorkout = (history = []) =>
  [...history]
    .sort((first, second) =>
      String(
        first?.finishedAt ??
          first?.date ??
          '',
      ).localeCompare(
        String(
          second?.finishedAt ??
            second?.date ??
            '',
        ),
      ),
    )
    .at(-1) ?? null

const withinHours = (value, hours) => {
  const time = new Date(value).getTime()
  return (
    Number.isFinite(time) &&
    Date.now() - time <= hours * 3600000
  )
}

const weeklyCheckInNotifications = (state) => {
  const capability = state.weeklyCheckInCapability
  if (
    capability &&
    (capability.schemaAvailable === false ||
      capability.status === 'checking' ||
      capability.status === 'unavailable')
  ) {
    return []
  }

  const weeklyState = state.weeklyCheckInState
  if (!weeklyState || weeklyState.loading || weeklyState.status === 'loading') {
    return []
  }

  if (!isWeeklyCheckInDue(weeklyState)) {
    return []
  }

  const weekKey = weeklyState.weekKey ?? weeklyState.weekStart ?? isoDate()
  const overdue = weeklyState.status === 'overdue'

  return [
    makeNotification({
      id: `weekly-checkin-${weekKey}`,
      type: NOTIFICATION_TYPES.WEEKLY_CHECKIN,
      priority: overdue ? 88 : 76,
      title: 'Weekly check-in',
      body: overdue
        ? 'Recap your week for your coach before the week closes.'
        : 'Take a minute to recap your week for your coach.',
      action: NOTIFICATION_ACTIONS.OPEN_WEEKLY_CHECKIN,
      actionLabel: 'Check In',
      fingerprint: `weekly-checkin:${weekKey}`,
      expiresAt: weeklyState.weekEnd
        ? `${weeklyState.weekEnd}T23:59:59`
        : null,
    }),
  ]
}

const readinessNotifications = (state) => {
  const readiness = calculateReadiness(state)

  if (readiness.completed) return []

  const today = isoDate()

  return [
    makeNotification({
      id: `readiness-${today}`,
      type: NOTIFICATION_TYPES.READINESS,
      priority: 92,
      title: 'Daily readiness check-in',
      body:
        'Rate sleep, energy, soreness, and stress to personalize today’s guidance.',
      action: NOTIFICATION_ACTIONS.OPEN_READINESS,
      actionLabel: 'Check In',
      fingerprint: `readiness:${today}`,
      expiresAt: `${today}T23:59:59`,
    }),
  ]
}

const workoutNotifications = (state) => {
  const week = buildTrainingWeek(state)
  const today = week.find((day) => day.isToday)

  if (
    !today ||
    today.isRest ||
    today.completedWorkout ||
    state.activeWorkout
  ) {
    return []
  }

  return [
    makeNotification({
      id: `workout-${today.dateKey}`,
      type: NOTIFICATION_TYPES.WORKOUT,
      priority: 78,
      title: `${today.plannedWorkout} is scheduled today`,
      body:
        'Your planned session is ready whenever you are.',
      action: NOTIFICATION_ACTIONS.START_WORKOUT,
      actionLabel: 'Start Workout',
      fingerprint: `workout:${today.dateKey}:${today.plannedWorkout}`,
      expiresAt: `${today.dateKey}T23:59:59`,
    }),
  ]
}

const recoveryNotifications = (state) => {
  const lastWorkout = latestWorkout(state.history ?? [])
  if (!lastWorkout) return []

  const finishedAt =
    lastWorkout.finishedAt ??
    `${lastWorkout.date}T12:00:00`

  if (!withinHours(finishedAt, 36)) return []

  const hasRecoveryFlow = (
    state.mobility?.completed ?? []
  ).some(
    (entry) =>
      entry?.title === 'Recovery Flow' &&
      new Date(entry.completedAt).getTime() >
        new Date(finishedAt).getTime(),
  )

  if (hasRecoveryFlow) return []

  return [
    makeNotification({
      id: `recovery-${lastWorkout.id}`,
      type: NOTIFICATION_TYPES.RECOVERY,
      priority: 86,
      title: 'Recovery Flow recommended',
      body: `You recently completed ${lastWorkout.name}. A short Recovery Flow would help close the session.`,
      action: NOTIFICATION_ACTIONS.START_RECOVERY,
      actionLabel: 'Start Recovery',
      fingerprint: `recovery:${lastWorkout.id}`,
      expiresAt: new Date(
        new Date(finishedAt).getTime() + 36 * 3600000,
      ).toISOString(),
    }),
  ]
}

const missedNotifications = (state) => {
  const week = buildTrainingWeek(state)
  const missed = [...week]
    .filter((day) => day.status === 'missed')
    .sort((first, second) =>
      second.dateKey.localeCompare(first.dateKey),
    )[0]

  if (!missed) return []

  return [
    makeNotification({
      id: `missed-${missed.dateKey}`,
      type: NOTIFICATION_TYPES.MISSED,
      priority: 68,
      title: `Missed ${missed.plannedWorkout}`,
      body:
        'Review your weekly plan or move the session to a better day.',
      action: NOTIFICATION_ACTIONS.OPEN_PLANNER,
      actionLabel: 'Review Plan',
      fingerprint: `missed:${missed.dateKey}:${missed.plannedWorkout}`,
      expiresAt: new Date(
        new Date(`${missed.dateKey}T12:00:00`).getTime() +
          4 * DAY_MS,
      ).toISOString(),
    }),
  ]
}

const forgeNotifications = (state) => {
  const closest = forgeSnapshot(state).closest[0]

  if (!closest || closest.progress < 0.8) return []

  return [
    makeNotification({
      id: `forge-${closest.id}`,
      type: NOTIFICATION_TYPES.FORGE,
      priority: 64,
      title: `${closest.title} is close`,
      body: `${closest.percent}% forged. ${Math.round(
        closest.remaining,
      ).toLocaleString()} ${closest.unit} remain.`,
      action: NOTIFICATION_ACTIONS.OPEN_FORGE,
      actionLabel: 'Open The Forge',
      fingerprint: `forge:${closest.id}:${closest.percent}`,
      expiresAt: new Date(
        Date.now() + 5 * DAY_MS,
      ).toISOString(),
    }),
  ]
}

const streakNotifications = (state) => {
  const history = [...(state.history ?? [])]
  if (!history.length) return []

  const lastWorkout = latestWorkout(history)
  const lastDate = new Date(
    lastWorkout.finishedAt ??
      `${lastWorkout.date}T12:00:00`,
  )
  const daysSince = Math.floor(
    (Date.now() - lastDate.getTime()) / DAY_MS,
  )

  if (daysSince !== 1) return []

  return [
    makeNotification({
      id: `streak-${isoDate()}`,
      type: NOTIFICATION_TYPES.STREAK,
      priority: 72,
      title: 'Your momentum is waiting',
      body:
        'A workout today keeps your recent training rhythm moving.',
      action: NOTIFICATION_ACTIONS.START_WORKOUT,
      actionLabel: 'Start Workout',
      fingerprint: `streak:${isoDate()}`,
      expiresAt: `${isoDate()}T23:59:59`,
    }),
  ]
}

const isExpired = (notification) =>
  notification.expiresAt &&
  new Date(notification.expiresAt).getTime() <
    Date.now()

const mergeState = (
  generated,
  notificationState = {},
) => {
  const read = new Set(notificationState.read ?? [])
  const dismissed = new Set(
    notificationState.dismissed ?? [],
  )
  const actedOn = new Set(
    notificationState.actedOn ?? [],
  )

  return generated
    .filter(
      (notification) =>
        !dismissed.has(notification.fingerprint) &&
        !isExpired(notification),
    )
    .map((notification) => ({
      ...notification,
      read: read.has(notification.fingerprint),
      dismissed: false,
      actedOn: actedOn.has(notification.fingerprint),
    }))
}

export const buildNotifications = (state = {}) => {
  const generated = [
    ...weeklyCheckInNotifications(state),
    ...readinessNotifications(state),
    ...workoutNotifications(state),
    ...recoveryNotifications(state),
    ...missedNotifications(state),
    ...forgeNotifications(state),
    ...streakNotifications(state),
  ]

  const deduped = [
    ...new Map(
      generated.map((notification) => [
        notification.fingerprint,
        notification,
      ]),
    ).values(),
  ]

  return mergeState(
    deduped.sort(
      (first, second) =>
        second.priority - first.priority,
    ),
    state.notifications ?? {},
  )
}

export const notificationSnapshot = (state = {}) => {
  const notifications = buildNotifications(state)
  const unread = notifications.filter(
    (notification) => !notification.read,
  )

  return {
    notifications,
    unread,
    unreadCount: unread.length,
    primary: unread[0] ?? notifications[0] ?? null,
  }
}

const appendUnique = (items = [], value) =>
  items.includes(value) ? items : [...items, value]

export const markNotificationRead = (
  notificationState = {},
  notification,
) => ({
  ...notificationState,
  read: appendUnique(
    notificationState.read ?? [],
    notification.fingerprint,
  ).slice(-200),
})

export const dismissNotification = (
  notificationState = {},
  notification,
) => ({
  ...notificationState,
  read: appendUnique(
    notificationState.read ?? [],
    notification.fingerprint,
  ).slice(-200),
  dismissed: appendUnique(
    notificationState.dismissed ?? [],
    notification.fingerprint,
  ).slice(-200),
})

export const markNotificationActedOn = (
  notificationState = {},
  notification,
) => ({
  ...notificationState,
  read: appendUnique(
    notificationState.read ?? [],
    notification.fingerprint,
  ).slice(-200),
  actedOn: appendUnique(
    notificationState.actedOn ?? [],
    notification.fingerprint,
  ).slice(-200),
})
