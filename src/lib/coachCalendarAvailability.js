import { formatTime12Hour } from './appointmentScheduling'

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

const isBlockingCalendarItem = (item) =>
  item &&
  String(item.status ?? 'scheduled').toLowerCase() === 'scheduled'

/**
 * Show gaps among events saved in AVAREN. These are not verified working
 * hours or public booking availability: external appointments may exist.
 */
export const buildCoachDayAvailability = (
  items = [],
  { startHour = 6, endHour = 21, minimumGapMinutes = 30 } = {},
) => {
  const rangeStart = startHour * 60
  const rangeEnd = endHour * 60
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
  let cursor = rangeStart
  for (const item of merged) {
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


/**
 * Presentation-only bookable gaps. Hide past days and trim today's earlier
 * minutes; the server remains authoritative for collision validation.
 */
export const bookableCoachDayGaps = (
  gaps = [],
  { selectedDayKey, todayKey, nowTime = '00:00', stepMinutes = 15 } = {},
) => {
  if (!selectedDayKey || !todayKey || selectedDayKey < todayKey) return []
  if (selectedDayKey > todayKey) return gaps
  const nowMinutes = toMinutes(nowTime)
  if (nowMinutes == null) return []
  const threshold = Math.ceil(nowMinutes / stepMinutes) * stepMinutes
  return gaps.flatMap((gap) => {
    const start = toMinutes(gap.startTime)
    const end = toMinutes(gap.endTime)
    if (start == null || end == null || end - Math.max(start, threshold) < 30) {
      return []
    }
    const adjustedStart = Math.max(start, threshold)
    return [{
      ...gap,
      startTime: minutesToTime(adjustedStart),
      durationMinutes: end - adjustedStart,
    }]
  })
}
