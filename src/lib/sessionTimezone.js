export const DEFAULT_COACH_SCHEDULE_TIMEZONE = 'America/New_York'

export const resolveCoachScheduleTimezone = ({
  scheduleTimezone,
  schedule_timezone,
  coachScheduleTimezone,
} = {}) =>
  scheduleTimezone ??
  schedule_timezone ??
  coachScheduleTimezone ??
  DEFAULT_COACH_SCHEDULE_TIMEZONE

const getZonedParts = (date, timeZone) => {
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  })

  const parts = Object.fromEntries(
    formatter.formatToParts(date).map((part) => [part.type, part.value]),
  )

  return {
    year: Number(parts.year),
    month: Number(parts.month),
    day: Number(parts.day),
    hour: Number(parts.hour === '24' ? '0' : parts.hour),
    minute: Number(parts.minute),
  }
}

export const buildStartsAtIso = (
  sessionDate,
  startTime,
  timeZone = DEFAULT_COACH_SCHEDULE_TIMEZONE,
) => {
  if (!sessionDate || !startTime || !timeZone) return null

  const [year, month, day] = sessionDate.split('-').map(Number)
  const [hour, minute] = String(startTime).slice(0, 5).split(':').map(Number)

  if (![year, month, day, hour, minute].every(Number.isFinite)) return null

  let utcMs = Date.UTC(year, month - 1, day, hour, minute)

  for (let attempt = 0; attempt < 5; attempt += 1) {
    const zoned = getZonedParts(new Date(utcMs), timeZone)
    const targetMs = Date.UTC(year, month - 1, day, hour, minute)
    const actualMs = Date.UTC(
      zoned.year,
      zoned.month - 1,
      zoned.day,
      zoned.hour,
      zoned.minute,
    )
    const diff = targetMs - actualMs
    if (diff === 0) break
    utcMs += diff
  }

  const iso = new Date(utcMs).toISOString()
  return Number.isFinite(new Date(iso).getTime()) ? iso : null
}

export const formatSessionInstantTime = (
  startsAt,
  timeZone = DEFAULT_COACH_SCHEDULE_TIMEZONE,
) => {
  if (!startsAt) return ''

  const date = new Date(startsAt)
  if (!Number.isFinite(date.getTime())) return ''

  return date.toLocaleTimeString([], {
    hour: 'numeric',
    minute: '2-digit',
    timeZone,
  })
}

export const formatSessionInstantDate = (
  startsAt,
  timeZone = DEFAULT_COACH_SCHEDULE_TIMEZONE,
) => {
  if (!startsAt) return ''

  const date = new Date(startsAt)
  if (!Number.isFinite(date.getTime())) return ''

  return date.toLocaleDateString([], {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    timeZone,
  })
}

export const formatScheduledSessionTime = (session) => {
  const timeZone = resolveCoachScheduleTimezone(session)

  if (session?.startsAt) {
    return formatSessionInstantTime(session.startsAt, timeZone)
  }

  const [hours, minutes] = String(session?.startTime ?? '')
    .split(':')
    .map(Number)

  if (!Number.isFinite(hours) || !Number.isFinite(minutes)) {
    return session?.startTime ?? ''
  }

  const date = new Date()
  date.setHours(hours, minutes, 0, 0)
  return date.toLocaleTimeString([], {
    hour: 'numeric',
    minute: '2-digit',
  })
}

export const formatScheduledSessionDate = (session) => {
  const timeZone = resolveCoachScheduleTimezone(session)

  if (session?.startsAt) {
    return formatSessionInstantDate(session.startsAt, timeZone)
  }

  const rawDate = session?.sessionDate ?? session?.session_date ?? null
  if (!rawDate) return ''

  const match = String(rawDate).trim().match(/^(\d{4}-\d{2}-\d{2})/)
  if (!match) return ''

  const [year, month, day] = match[1].split('-').map(Number)
  if (![year, month, day].every(Number.isFinite)) return ''

  const date = new Date(year, month - 1, day)
  if (!Number.isFinite(date.getTime())) return ''

  const label = date.toLocaleDateString([], {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  })

  return label.includes('Invalid') ? '' : label
}

export const sessionInstantTimestamp = (session) => {
  if (session?.startsAt) {
    const parsed = new Date(session.startsAt)
    if (Number.isFinite(parsed.getTime())) return parsed.getTime()
  }

  return null
}

export const syncSessionWallClockFromStartsAt = (
  startsAt,
  timeZone = DEFAULT_COACH_SCHEDULE_TIMEZONE,
) => {
  if (!startsAt) return { sessionDate: null, startTime: null }

  const date = new Date(startsAt)
  if (!Number.isFinite(date.getTime())) {
    return { sessionDate: null, startTime: null }
  }

  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  })

  const parts = Object.fromEntries(
    formatter.formatToParts(date).map((part) => [part.type, part.value]),
  )

  return {
    sessionDate: `${parts.year}-${parts.month}-${parts.day}`,
    startTime: `${parts.hour === '24' ? '00' : parts.hour}:${parts.minute}`,
  }
}
