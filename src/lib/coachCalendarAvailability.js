import { formatTime12Hour } from './appointmentScheduling'
import { DEFAULT_COACH_SCHEDULE_TIMEZONE } from './sessionTimezone'

const toMinutes = (value) => {
  const match = /^(\d{1,2}):(\d{2})/.exec(String(value ?? ''))
  if (!match) return null
  const h = Number(match[1])
  const m = Number(match[2])
  if (h > 23 || m > 59) return null
  return h * 60 + m
}

export const minutesToTime = (minutes) => {
  const hour = Math.floor(minutes / 60)
  const minute = minutes % 60
  return `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`
}

export const coachLocalClockTime = (
  now = new Date(),
  timeZone = DEFAULT_COACH_SCHEDULE_TIMEZONE,
) => {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone,
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(now)
  const hour = Number(parts.find((part) => part.type === 'hour')?.value ?? 0)
  const minute = Number(parts.find((part) => part.type === 'minute')?.value ?? 0)
  return minutesToTime(hour * 60 + minute)
}

const isBlockingCalendarItem = (item) =>
  item &&
  String(item.status ?? 'scheduled').toLowerCase() === 'scheduled'

/**
 * Show gaps among events saved in AVAREN. These are not verified working
 * hours or public booking availability: external appointments may exist.
 */
export const buildCoachDayAvailability = (
  items = [],
  { startHour = 6, endHour = 21, minimumGapMinutes = 30, notBeforeTime = null } = {},
) => {
  const rangeStart = startHour * 60
  const rangeEnd = endHour * 60
  const notBeforeMinutes = toMinutes(notBeforeTime)
  const gapStart = notBeforeMinutes == null
    ? rangeStart
    : Math.min(rangeEnd, Math.max(rangeStart, Math.ceil(notBeforeMinutes / 5) * 5))
  const periods = (items ?? [])
    .filter(isBlockingCalendarItem)
    .map((item) => {
      const start = toMinutes(item.startTime ?? item.start_time)
      const duration = Number(item.durationMinutes ?? item.duration_minutes ?? 60)
      if (start == null || !Number.isFinite(duration) || duration <= 0) return null
      return {
        start: Math.max(rangeStart, start),
        end: Math.min(rangeEnd, start + duration),
      }
    })
    .filter((item) => item && item.end > item.start)
    .sort((a, b) => a.start - b.start || a.end - b.end)

  const merged = []
  for (const item of periods) {
    const previous = merged[merged.length - 1]
    if (previous && item.start <= previous.end) {
      previous.end = Math.max(previous.end, item.end)
    } else {
      merged.push({ ...item })
    }
  }

  const gaps = []
  let cursor = gapStart
  for (const item of merged) {
    if (item.end <= cursor) continue
    if (item.start - cursor >= minimumGapMinutes) {
      gaps.push({
        startTime: minutesToTime(cursor),
        endTime: minutesToTime(item.start),
        durationMinutes: item.start - cursor,
      })
    }
    cursor = Math.max(cursor, item.end)
  }
  if (rangeEnd - cursor >= minimumGapMinutes) {
    gaps.push({
      startTime: minutesToTime(cursor),
      endTime: minutesToTime(rangeEnd),
      durationMinutes: rangeEnd - cursor,
    })
  }
  const occupiedMinutes = merged.reduce((sum, item) => sum + item.end - item.start, 0)
  return {
    gaps,
    occupiedMinutes,
    windowLabel: `${formatTime12Hour(minutesToTime(rangeStart))} – ${formatTime12Hour(minutesToTime(rangeEnd))}`,
  }
}
