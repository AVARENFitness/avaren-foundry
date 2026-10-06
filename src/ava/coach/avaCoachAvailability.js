import { coachBackend } from '../../lib/coachBackend'
import {
  addDaysKey,
  dateKey,
  formatScheduleDateLong,
  formatTime12Hour,
} from '../../lib/appointmentScheduling'
import { DEFAULT_COACH_SCHEDULE_TIMEZONE } from '../../lib/sessionTimezone'
import { normalizeScheduledSession } from '../../lib/coachScheduledSessions'
import { normalizeCoachCalendarEvent } from '../../lib/coachCalendarEvents'
import {
  athleteCalendarBackend,
  normalizeAthleteCalendarEvent,
} from '../../lib/athleteCalendarEvents'
import {
  resolveCalendarClient,
  resolveCoachCalendarDate,
} from './avaCoachCalendarActions'
import {
  resolveAthleteDataId,
  resolveRecordBusinessClientId,
} from '../../lib/coachBusinessClient'
import { getClientDisplayName } from '../../lib/clientDisplayName'

export const DEFAULT_COACH_AVAILABILITY = {
  dayStartMinutes: 6 * 60,
  dayEndMinutes: 21 * 60,
  minimumGapMinutes: 30,
  incrementMinutes: 15,
}

const normalizeText = (value = '') =>
  String(value ?? '')
    .trim()
    .replace(/[\u2013\u2014]/g, '-')
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/\s+/g, ' ')

const lower = (value = '') => normalizeText(value).toLowerCase()

const parseClockMinutes = (value = '') => {
  const text = lower(value).replace(/\./g, '')
  const match = text.match(/^(\d{1,2})(?::?(\d{2}))?\s*(am|pm)?$/)
  if (!match) return null

  const rawHour = Number(match[1])
  const minute = Number(match[2] ?? 0)
  const meridiem = match[3] ?? null

  if (
    !Number.isInteger(rawHour) ||
    !Number.isInteger(minute) ||
    minute < 0 ||
    minute > 59 ||
    rawHour < 0 ||
    rawHour > 23
  ) {
    return null
  }

  if (meridiem) {
    if (rawHour < 1 || rawHour > 12) return null
    const hour = (rawHour % 12) + (meridiem === 'pm' ? 12 : 0)
    return hour * 60 + minute
  }

  if (rawHour === 0 || rawHour > 12) return rawHour * 60 + minute

  // Availability questions like "after 3" are normally daytime coaching
  // language; prefer PM for bare hours below 7 and AM for 7-11.
  const hour = rawHour < 7 ? rawHour + 12 : rawHour
  return hour * 60 + minute
}

const minutesToTime = (minutes) => {
  const normalized = Math.max(0, Math.min(23 * 60 + 59, Number(minutes) || 0))
  const hour = Math.floor(normalized / 60)
  const minute = normalized % 60
  return `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`
}

const mondayKeyFor = (now = new Date()) => {
  const date = new Date(now)
  date.setHours(12, 0, 0, 0)
  const day = date.getDay() || 7
  date.setDate(date.getDate() - day + 1)
  return dateKey(date, DEFAULT_COACH_SCHEDULE_TIMEZONE)
}

const dayRange = (startDate, endDate) => {
  const days = []
  let cursor = startDate
  while (cursor <= endDate) {
    days.push(cursor)
    cursor = addDaysKey(cursor, 1)
  }
  return days
}

const parseDuration = (text = '') => {
  const hourMatch = text.match(/\b(\d+(?:\.\d+)?)[-\s]*(?:hour|hr)s?\b/i)
  if (hourMatch) return Math.max(15, Math.round(Number(hourMatch[1]) * 60))

  const minuteMatch = text.match(/\b(\d+)[-\s]*(?:minute|min)s?\b/i)
  if (minuteMatch) return Math.max(15, Number(minuteMatch[1]))

  return null
}

const DATE_PHRASE =
  '(today|tomorrow|sunday|sun|monday|mon|tuesday|tue|tues|wednesday|wed|thursday|thu|thurs|friday|fri|saturday|sat|\\d{1,2}\\/\\d{1,2}(?:\\/\\d{2,4})?)'

export const parseCoachAvailabilityQuery = (
  message = '',
  { now = new Date() } = {},
) => {
  const original = normalizeText(message)
  const text = lower(original)
  if (!text) return null

  const duration = parseDuration(text)
  const bookingRequested =
    /\b(?:and\s+)?(?:book|schedule)(?:\s+it|\s+that|\s+the\s+best\s+(?:slot|time))?\b/i.test(
      text,
    ) ||
    /\b(?:find|choose)\s+the\s+best\b.*\b(?:and\s+)?(?:book|schedule)\b/i.test(
      text,
    )
  const afterMatch = text.match(
    /\bafter\s+(\d{1,2}(?::?\d{2})?\s*(?:a\.?m\.?|p\.?m\.?)?)/i,
  )
  const beforeMatch = text.match(
    /\bbefore\s+(\d{1,2}(?::?\d{2})?\s*(?:a\.?m\.?|p\.?m\.?)?)/i,
  )
  const afterMinutes = afterMatch ? parseClockMinutes(afterMatch[1]) : null
  const beforeMinutes = beforeMatch ? parseClockMinutes(beforeMatch[1]) : null

  const clientSlotMatch = text.match(
    /\b(?:find|show|give)\s+(?:me\s+)?(?:an?\s+)?(?:open|available)?\s*(?:(\d+)[-\s]*(?:minute|min)\s+)?slot\s+for\s+(.+?)\s+(this week|today|tomorrow|sunday|sun|monday|mon|tuesday|tue|tues|wednesday|wed|thursday|thu|thurs|friday|fri|saturday|sat)(?:\b|$)/i,
  )

  if (clientSlotMatch) {
    const explicitMinutes = clientSlotMatch[1]
      ? Number(clientSlotMatch[1])
      : duration
    const clientQuery = normalizeText(clientSlotMatch[2])
    const period = lower(clientSlotMatch[3])

    if (period === 'this week') {
      const startDate = mondayKeyFor(now)
      return {
        kind: 'availability',
        rangeKind: 'week',
        startDate,
        endDate: addDaysKey(startDate, 6),
        durationMinutes: explicitMinutes || 60,
        afterMinutes,
        beforeMinutes,
        clientQuery,
        bookingRequested,
      }
    }

    const date = resolveCoachCalendarDate(period, now)
    return {
      kind: 'availability',
      rangeKind: 'day',
      startDate: date,
      endDate: date,
      durationMinutes: explicitMinutes || 60,
      afterMinutes,
      beforeMinutes,
      clientQuery,
      bookingRequested,
    }
  }

  const thisWeek =
    /\b(?:what|which|show|when|where|do i have|find).*\b(?:openings?|availability|available|free|open slots?)\b.*\bthis week\b/i.test(
      text,
    ) ||
    /\bwhat openings do i have this week\b/i.test(text)

  if (thisWeek) {
    const startDate = mondayKeyFor(now)
    return {
      kind: 'availability',
      rangeKind: 'week',
      startDate,
      endDate: addDaysKey(startDate, 6),
      durationMinutes: duration,
      afterMinutes,
      beforeMinutes,
      clientQuery: null,
      bookingRequested: false,
    }
  }

  const dayMatch = text.match(new RegExp(DATE_PHRASE, 'i'))
  const isAvailabilityLanguage =
    /\b(free|available|availability|opening|openings|open slot|open time)\b/i.test(
      text,
    )

  if (dayMatch && isAvailabilityLanguage) {
    const date = resolveCoachCalendarDate(dayMatch[1], now)
    return {
      kind: 'availability',
      rangeKind: 'day',
      startDate: date,
      endDate: date,
      durationMinutes: duration,
      afterMinutes,
      beforeMinutes,
      clientQuery: null,
      bookingRequested: false,
    }
  }

  return null
}

const itemStartMinutes = (item = {}) => {
  const [hour, minute] = String(item.startTime ?? '')
    .slice(0, 5)
    .split(':')
    .map(Number)
  if (!Number.isFinite(hour) || !Number.isFinite(minute)) return null
  return hour * 60 + minute
}

const busyIntervalsForDay = (items = [], dayKey = '') =>
  (items ?? [])
    .filter(
      (item) =>
        String(item.sessionDate ?? '') === String(dayKey) &&
        String(item.status ?? 'scheduled') === 'scheduled',
    )
    .map((item) => {
      const start = itemStartMinutes(item)
      if (start == null) return null
      const duration = Math.max(1, Number(item.durationMinutes) || 60)
      return {
        start,
        end: start + duration,
      }
    })
    .filter(Boolean)
    .sort((a, b) => a.start - b.start)

const mergeIntervals = (intervals = []) => {
  const merged = []
  intervals.forEach((interval) => {
    const last = merged[merged.length - 1]
    if (!last || interval.start > last.end) {
      merged.push({ ...interval })
      return
    }
    last.end = Math.max(last.end, interval.end)
  })
  return merged
}

const roundUp = (minutes, increment) =>
  Math.ceil(minutes / increment) * increment

export const findAvailabilityForDay = ({
  dayKey,
  items = [],
  durationMinutes = null,
  afterMinutes = null,
  beforeMinutes = null,
  now = new Date(),
  config = DEFAULT_COACH_AVAILABILITY,
} = {}) => {
  const isToday =
    dayKey === dateKey(now, DEFAULT_COACH_SCHEDULE_TIMEZONE)

  let windowStart = config.dayStartMinutes
  let windowEnd = config.dayEndMinutes

  if (Number.isFinite(afterMinutes)) {
    windowStart = Math.max(windowStart, afterMinutes)
  }
  if (Number.isFinite(beforeMinutes)) {
    windowEnd = Math.min(windowEnd, beforeMinutes)
  }
  if (isToday) {
    windowStart = Math.max(
      windowStart,
      roundUp(now.getHours() * 60 + now.getMinutes(), config.incrementMinutes),
    )
  }

  if (windowEnd <= windowStart) return []

  const busy = mergeIntervals(
    busyIntervalsForDay(items, dayKey)
      .map((interval) => ({
        start: Math.max(windowStart, interval.start),
        end: Math.min(windowEnd, interval.end),
      }))
      .filter((interval) => interval.end > interval.start),
  )

  const gaps = []
  let cursor = windowStart

  busy.forEach((interval) => {
    if (interval.start > cursor) {
      gaps.push({ start: cursor, end: interval.start })
    }
    cursor = Math.max(cursor, interval.end)
  })

  if (cursor < windowEnd) {
    gaps.push({ start: cursor, end: windowEnd })
  }

  const minimum = durationMinutes || config.minimumGapMinutes
  const viable = gaps.filter((gap) => gap.end - gap.start >= minimum)

  if (!durationMinutes) {
    return viable.map((gap) => ({
      dayKey,
      startMinutes: gap.start,
      endMinutes: gap.end,
      durationMinutes: gap.end - gap.start,
      startTime: minutesToTime(gap.start),
      endTime: minutesToTime(gap.end),
    }))
  }

  const slots = []
  viable.forEach((gap) => {
    let start = roundUp(gap.start, config.incrementMinutes)
    while (start + durationMinutes <= gap.end) {
      slots.push({
        dayKey,
        startMinutes: start,
        endMinutes: start + durationMinutes,
        durationMinutes,
        startTime: minutesToTime(start),
        endTime: minutesToTime(start + durationMinutes),
      })
      start += config.incrementMinutes
    }
  })

  return slots
}

const listUnifiedBusyItems = async ({ startDate, endDate }) => {
  const [appointments, coachEvents, athleteEvents] = await Promise.all([
    coachBackend.listScheduledSessions({ startDate, endDate }),
    coachBackend.listCoachCalendarEvents({ startDate, endDate }),
    athleteCalendarBackend.list({ startDate, endDate }),
  ])

  return [
    ...(appointments ?? []).map(normalizeScheduledSession).filter(Boolean),
    ...(coachEvents ?? []).map(normalizeCoachCalendarEvent).filter(Boolean),
    ...(athleteEvents ?? [])
      .map(normalizeAthleteCalendarEvent)
      .filter(Boolean),
  ]
}

const rankBookableSlots = (slots = []) =>
  [...slots].sort((a, b) => {
    const dayCompare = String(a.dayKey).localeCompare(String(b.dayKey))
    if (dayCompare !== 0) return dayCompare
    return Number(a.startMinutes || 0) - Number(b.startMinutes || 0)
  })

const hasEquivalentBestSlot = (slots = []) => {
  if (slots.length < 2) return false
  const [first, second] = slots
  return (
    String(first.dayKey) === String(second.dayKey) &&
    Number(first.startMinutes) === Number(second.startMinutes)
  )
}

const formatSlot = (slot) =>
  `${formatTime12Hour(slot.startTime)}–${formatTime12Hour(slot.endTime)}`

const formatDayShort = (dayKey) =>
  new Date(`${dayKey}T12:00:00`).toLocaleDateString([], {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  })

export const executeCoachAvailabilityQuery = async (
  query,
  { clients = [], now = new Date() } = {},
) => {
  if (!query?.startDate || !query?.endDate) {
    return {
      kind: 'clarification',
      message: 'What day or week should I check?',
    }
  }

  let client = null
  if (query.clientQuery) {
    const resolution = resolveCalendarClient(query.clientQuery, clients)
    if (resolution.status === 'none') {
      return {
        kind: 'clarification',
        message: `I couldn't find ${query.clientQuery} in your client roster. Which client did you mean?`,
      }
    }
    if (resolution.status === 'ambiguous') {
      return {
        kind: 'clarification',
        message: `I found more than one match for ${query.clientQuery}. Which client did you mean?`,
      }
    }
    client = resolution.client
  }

  const items = await listUnifiedBusyItems({
    startDate: query.startDate,
    endDate: query.endDate,
  })

  const days = dayRange(query.startDate, query.endDate)
  const todayKey = dateKey(now, DEFAULT_COACH_SCHEDULE_TIMEZONE)
  const relevantDays = days.filter((day) => day >= todayKey)

  const byDay = relevantDays.map((dayKey) => ({
    dayKey,
    slots: findAvailabilityForDay({
      dayKey,
      items,
      durationMinutes: query.durationMinutes,
      afterMinutes: query.afterMinutes,
      beforeMinutes: query.beforeMinutes,
      now,
    }),
  }))

  if (query.durationMinutes) {
    const candidates = byDay.flatMap(({ dayKey, slots }) =>
      slots.map((slot) => ({ ...slot, dayKey })),
    )
    const ranked = rankBookableSlots(candidates)
    const top = ranked.slice(0, 5)

    if (!top.length) {
      return {
        kind: 'availability',
        message: client
          ? `I don't see a ${query.durationMinutes}-minute opening for ${client.coach_label ?? client.display_name ?? query.clientQuery} in that window. I checked your merged AVAREN calendar from 6:00 AM–9:00 PM.`
          : `I don't see a ${query.durationMinutes}-minute opening in that window. I checked your merged AVAREN calendar from 6:00 AM–9:00 PM.`,
        slots: [],
        client,
      }
    }

    const label = client
      ? ` for ${getClientDisplayName(client) || query.clientQuery}`
      : ''
    const list = top
      .map(
        (slot) =>
          `${formatDayShort(slot.dayKey)} ${formatSlot(slot)}`,
      )
      .join(', ')

    if (query.bookingRequested) {
      if (!client) {
        return {
          kind: 'clarification',
          message: 'Which client should I book into that opening?',
          slots: top,
          client: null,
        }
      }

      if (!ranked.length) {
        return {
          kind: 'availability',
          message: `I couldn't find a ${query.durationMinutes}-minute opening${label} in that window.`,
          slots: [],
          client,
        }
      }

      if (hasEquivalentBestSlot(ranked)) {
        return {
          kind: 'clarification',
          message: `I found multiple equally good options${label}: ${list}. Which one should I book?`,
          slots: top,
          client,
        }
      }

      const best = ranked[0]
      const freshItems = await listUnifiedBusyItems({
        startDate: best.dayKey,
        endDate: best.dayKey,
      })
      const stillAvailable = findAvailabilityForDay({
        dayKey: best.dayKey,
        items: freshItems,
        durationMinutes: query.durationMinutes,
        afterMinutes: query.afterMinutes,
        beforeMinutes: query.beforeMinutes,
        now,
      }).some(
        (slot) =>
          String(slot.dayKey) === String(best.dayKey) &&
          String(slot.startTime) === String(best.startTime),
      )

      if (!stillAvailable) {
        return {
          kind: 'conflict',
          message:
            'That opening changed before I could book it. I did not create an appointment. Ask me to check again and I’ll use the latest calendar.',
          slots: [],
          client,
        }
      }

      try {
        await coachBackend.createScheduledSession({
          businessClientId: resolveRecordBusinessClientId(client),
          athleteId: resolveAthleteDataId(client),
          sessionDate: best.dayKey,
          startTime: best.startTime,
          durationMinutes: query.durationMinutes,
          locationType: 'default',
          locationName: '',
          coachNote: 'Booked by AVA from availability search',
          assignmentId: null,
          existingSessions: freshItems,
        })
      } catch (error) {
        if (
          error?.message === 'appointment_overlap' ||
          /overlap/i.test(error?.message ?? '')
        ) {
          return {
            kind: 'conflict',
            message:
              'That opening was no longer available when I tried to book it, so I left your calendar unchanged.',
            slots: [],
            client,
          }
        }
        throw error
      }

      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('avaren:coach-calendar-updated'))
      }

      return {
        kind: 'booked',
        message: `Booked — ${getClientDisplayName(client) || query.clientQuery} is scheduled for ${formatDayShort(best.dayKey)} from ${formatSlot(best)}.`,
        slots: [best],
        client,
        bookedSlot: best,
      }
    }

    return {
      kind: 'availability',
      message: `I found these ${query.durationMinutes}-minute openings${label}: ${list}. I’m checking your merged AVAREN calendar within 6:00 AM–9:00 PM.`,
      slots: top,
      client,
    }
  }

  const daySummaries = byDay
    .filter(({ slots }) => slots.length)
    .map(({ dayKey, slots }) => ({
      dayKey,
      slots: slots.slice(0, 3),
    }))

  if (!daySummaries.length) {
    return {
      kind: 'availability',
      message:
        'I don’t see any open blocks of at least 30 minutes in that window between 6:00 AM and 9:00 PM.',
      slots: [],
      client,
    }
  }

  if (query.rangeKind === 'day') {
    const slots = daySummaries[0].slots
    const summary = slots.map(formatSlot).join(', ')
    return {
      kind: 'availability',
      message: `You’re free ${formatScheduleDateLong(query.startDate)} at ${summary}. I’m treating 6:00 AM–9:00 PM as your coaching day.`,
      slots,
      client,
    }
  }

  const summary = daySummaries
    .slice(0, 7)
    .map(
      ({ dayKey, slots }) =>
        `${formatDayShort(dayKey)}: ${slots.map(formatSlot).join(', ')}`,
    )
    .join(' · ')

  return {
    kind: 'availability',
    message: `Your open blocks this week are: ${summary}. I’m treating 6:00 AM–9:00 PM as your coaching day.`,
    slots: daySummaries.flatMap(({ slots }) => slots),
    client,
  }
}
