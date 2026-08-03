const DAY_MS = 86400000

export const WEEKDAY_NAMES = [
  'Sunday',
  'Monday',
  'Tuesday',
  'Wednesday',
  'Thursday',
  'Friday',
  'Saturday',
]

export const WEEKDAY_SHORT = ['S', 'M', 'T', 'W', 'T', 'F', 'S']

const startOfDay = (value = new Date()) => {
  const date = new Date(value)
  date.setHours(0, 0, 0, 0)
  return date
}

const isoDate = (value) =>
  startOfDay(value).toISOString().slice(0, 10)

const addDays = (value, amount) => {
  const date = startOfDay(value)
  date.setDate(date.getDate() + amount)
  return date
}

export const startOfWeekSunday = (value = new Date()) => {
  const date = startOfDay(value)
  date.setDate(date.getDate() - date.getDay())
  return date
}

const sessionDate = (session) =>
  session?.date ??
  session?.finishedAt?.slice(0, 10) ??
  null

const mobilityDate = (entry) =>
  entry?.completedAt?.slice(0, 10) ?? null

export function buildTrainingWeek(state = {}, referenceDate = new Date()) {
  const weekStart = startOfWeekSunday(referenceDate)
  const today = isoDate(referenceDate)
  const history = state.history ?? []
  const mobility = state.mobility?.completed ?? []

  return Array.from({ length: 7 }, (_, dayIndex) => {
    const date = addDays(weekStart, dayIndex)
    const dateKey = isoDate(date)
    const plannedWorkout =
      state.weeklySchedule?.[dayIndex] ?? 'Rest'
    const completedWorkout = history.find(
      (session) => sessionDate(session) === dateKey,
    )
    const dailyReset = mobility.some(
      (entry) =>
        entry?.title === 'Daily Reset' &&
        mobilityDate(entry) === dateKey,
    )
    const recoveryFlow = mobility.some(
      (entry) =>
        entry?.title === 'Recovery Flow' &&
        mobilityDate(entry) === dateKey,
    )

    const isToday = dateKey === today
    const isPast = date.getTime() < startOfDay(referenceDate).getTime()
    const isRest = plannedWorkout === 'Rest'

    let status = 'upcoming'

    if (completedWorkout) {
      status = 'completed'
    } else if (isToday) {
      status = isRest ? 'rest-today' : 'today'
    } else if (isPast && !isRest) {
      status = 'missed'
    } else if (isRest) {
      status = 'rest'
    }

    return {
      dayIndex,
      dayName: WEEKDAY_NAMES[dayIndex],
      dayShort: WEEKDAY_SHORT[dayIndex],
      date,
      dateKey,
      dateNumber: date.getDate(),
      plannedWorkout,
      completedWorkout,
      dailyReset,
      recoveryFlow,
      isToday,
      isPast,
      isRest,
      status,
    }
  })
}

export function weeklyTrainingSummary(state = {}, referenceDate = new Date()) {
  const days = buildTrainingWeek(state, referenceDate)
  const planned = days.filter((day) => !day.isRest).length
  const completed = days.filter((day) => day.completedWorkout).length
  const missed = days.filter((day) => day.status === 'missed').length
  const resets = days.filter((day) => day.dailyReset).length
  const recoveryFlows = days.filter((day) => day.recoveryFlow).length

  return {
    days,
    planned,
    completed,
    missed,
    resets,
    recoveryFlows,
    adherence:
      planned > 0
        ? Math.min(100, Math.round((completed / planned) * 100))
        : 100,
  }
}

export function dateDifferenceInDays(first, second) {
  return Math.round(
    (startOfDay(second).getTime() - startOfDay(first).getTime()) /
      DAY_MS,
  )
}
