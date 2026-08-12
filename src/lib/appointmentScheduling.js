import { buildScheduleInstant } from './sessionReminders'
import { DEFAULT_COACH_SCHEDULE_TIMEZONE } from './sessionTimezone'

export const DURATION_PRESETS = [30, 45, 60, 90]

export const LOCATION_PRESETS = [
  { value: 'avaren_gym', label: 'AVAREN Gym' },
  { value: 'client_gym', label: 'Client Gym' },
  { value: 'other', label: 'Other' },
]

const pad = (value) => String(value).padStart(2, '0')

/** Calendar YYYY-MM-DD in the coach schedule timezone — never UTC ISO slice. */
export const scheduleDateKey = (
  date = new Date(),
  timeZone = DEFAULT_COACH_SCHEDULE_TIMEZONE,
) =>
  new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date)

export const dateKey = scheduleDateKey

export const parseDateKey = (dateKeyValue = '') => {
  const [year, month, day] = String(dateKeyValue).split('-').map(Number)
  return { year, month, day }
}

/** Pure calendar-day add on YYYY-MM-DD components (no UTC drift). */
export const addDaysKey = (dateKeyValue, days = 0) => {
  const { year, month, day } = parseDateKey(dateKeyValue)
  const anchor = new Date(Date.UTC(year, month - 1, day + days))

  return [
    anchor.getUTCFullYear(),
    pad(anchor.getUTCMonth() + 1),
    pad(anchor.getUTCDate()),
  ].join('-')
}

export const formatScheduleDateLabel = (
  sessionDate,
  now = new Date(),
  timeZone = DEFAULT_COACH_SCHEDULE_TIMEZONE,
) => {
  if (!sessionDate) return 'Select date'

  const today = dateKey(now, timeZone)
  const tomorrow = addDaysKey(today, 1)

  if (sessionDate === today) return 'Today'
  if (sessionDate === tomorrow) return 'Tomorrow'

  const { year, month, day } = parseDateKey(sessionDate)
  const date = new Date(year, month - 1, day)
  return date.toLocaleDateString([], {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  })
}

export const formatScheduleDateLong = (sessionDate) => {
  if (!sessionDate) return ''
  const { year, month, day } = parseDateKey(sessionDate)
  const date = new Date(year, month - 1, day)
  return date.toLocaleDateString([], {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  })
}

export const formatTime12Hour = (time24 = '') => {
  const [hourRaw, minuteRaw = '00'] = String(time24).slice(0, 5).split(':')
  const hour = Number(hourRaw)
  const minute = Number(minuteRaw)
  if (!Number.isFinite(hour) || !Number.isFinite(minute)) return time24

  const period = hour >= 12 ? 'PM' : 'AM'
  const hour12 = hour % 12 || 12
  return `${hour12}:${pad(minute)} ${period}`
}

export const buildQuarterHourTimeOptions = ({
  startHour = 6,
  endHour = 21,
} = {}) => {
  const options = []

  for (let hour = startHour; hour <= endHour; hour += 1) {
    for (const minute of [0, 15, 30, 45]) {
      if (hour === endHour && minute > 0) break
      const value = `${pad(hour)}:${pad(minute)}`
      options.push({ value, label: formatTime12Hour(value) })
    }
  }

  return options
}

export const resolveScheduleInstant = ({
  sessionDate,
  startTime,
  scheduleTimezone = DEFAULT_COACH_SCHEDULE_TIMEZONE,
}) => {
  const instant = buildScheduleInstant({
    sessionDate,
    startTime,
    scheduleTimezone,
  })

  return {
    startsAt: instant.startsAt,
    scheduleTimezone: instant.scheduleTimezone,
    startsMs: instant.startsAt ? new Date(instant.startsAt).getTime() : null,
  }
}

export const isScheduleTimeInPast = ({
  sessionDate,
  startTime,
  scheduleTimezone = DEFAULT_COACH_SCHEDULE_TIMEZONE,
  now = new Date(),
} = {}) => {
  const { startsMs } = resolveScheduleInstant({
    sessionDate,
    startTime,
    scheduleTimezone,
  })

  if (!Number.isFinite(startsMs)) return false
  return startsMs <= now.getTime()
}

export const filterAvailableTimeOptions = (
  options = [],
  {
    sessionDate,
    scheduleTimezone = DEFAULT_COACH_SCHEDULE_TIMEZONE,
    now = new Date(),
  } = {},
) => {
  const today = dateKey(now, scheduleTimezone)
  if (sessionDate !== today) return options

  return options.filter(
    (option) =>
      !isScheduleTimeInPast({
        sessionDate,
        startTime: option.value,
        scheduleTimezone,
        now,
      }),
  )
}

export const formatScheduleTimeRange = ({
  startTime,
  durationMinutes = 60,
} = {}) => {
  const startLabel = formatTime12Hour(startTime)
  if (!startTime || !durationMinutes) return startLabel

  const [hourRaw, minuteRaw = '0'] = String(startTime).slice(0, 5).split(':')
  const startMinutes = Number(hourRaw) * 60 + Number(minuteRaw)
  const endMinutes = startMinutes + Number(durationMinutes)
  const endHour = Math.floor(endMinutes / 60) % 24
  const endMinute = endMinutes % 60
  const endTime = `${pad(endHour)}:${pad(endMinute)}`

  return `${startLabel}–${formatTime12Hour(endTime)}`
}
