import { coachBackend } from '../../lib/coachBackend'
import {
  addDaysKey,
  dateKey,
  formatScheduleDateLong,
  formatTime12Hour,
} from '../../lib/appointmentScheduling'
import { DEFAULT_COACH_SCHEDULE_TIMEZONE } from '../../lib/sessionTimezone'
import {
  resolveAthleteDataId,
  resolveRecordBusinessClientId,
} from '../../lib/coachBusinessClient'
import { getClientDisplayName } from '../../lib/clientDisplayName'
import { normalizeScheduledSession } from '../../lib/coachScheduledSessions'
import { normalizeCoachCalendarEvent } from '../../lib/coachCalendarEvents'
import {
  athleteCalendarBackend,
  normalizeAthleteCalendarEvent,
} from '../../lib/athleteCalendarEvents'

export const AVA_COACH_CALENDAR_COMMAND_KIND = {
  PRIVATE_EVENT: 'private_event',
  PERSONAL_TRAINING: 'personal_training',
  MOVE_PERSONAL_TRAINING: 'move_personal_training',
  MOVE_PRIVATE_EVENT: 'move_private_event',
}

const normalizeText = (value = '') =>
  String(value ?? '')
    .trim()
    .replace(/[\u2013\u2014]/g, '-')
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/\s+/g, ' ')

const lower = (value = '') => normalizeText(value).toLowerCase()

const WEEKDAY_INDEX = {
  sunday: 0,
  sun: 0,
  monday: 1,
  mon: 1,
  tuesday: 2,
  tue: 2,
  tues: 2,
  wednesday: 3,
  wed: 3,
  thursday: 4,
  thu: 4,
  thurs: 4,
  friday: 5,
  fri: 5,
  saturday: 6,
  sat: 6,
}

const normalizeTimeToken = (value = '') => {
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
    rawHour > 23 ||
    (meridiem && (rawHour < 1 || rawHour > 12))
  ) {
    return null
  }

  return { rawHour, minute, meridiem }
}

const toMinutes = ({ rawHour, minute, meridiem }, forcedMeridiem = null) => {
  const marker = meridiem ?? forcedMeridiem
  if (marker) {
    const normalizedHour = rawHour % 12
    return (normalizedHour + (marker === 'pm' ? 12 : 0)) * 60 + minute
  }
  return rawHour * 60 + minute
}

const candidateMinutes = (token) => {
  if (!token) return []
  if (token.meridiem) return [toMinutes(token)]

  if (token.rawHour === 0 || token.rawHour > 12) {
    return [toMinutes(token)]
  }

  const am = token.rawHour % 12 * 60 + token.minute
  const pm = am + 12 * 60
  return [...new Set([am, pm])]
}

const scoreRangeCandidate = ({ start, end, kind }) => {
  const duration = end - start
  if (duration < 15 || duration > 12 * 60) return -Infinity

  let score = 0

  if (start >= 6 * 60 && start <= 20 * 60) score += 5
  if (end >= 7 * 60 && end <= 22 * 60) score += 3
  if (duration <= 4 * 60) score += 2
  if (kind === AVA_COACH_CALENDAR_COMMAND_KIND.PERSONAL_TRAINING) {
    if (start >= 7 * 60 && start <= 20 * 60) score += 4
    if (duration >= 30 && duration <= 120) score += 4
  }
  if (start < 5 * 60) score -= 6
  if (end > 23 * 60) score -= 3

  return score
}

export const inferSingleCoachTime = (
  value,
  { kind = AVA_COACH_CALENDAR_COMMAND_KIND.PRIVATE_EVENT } = {},
) => {
  const token = normalizeTimeToken(value)
  if (!token) return { status: 'invalid', reason: 'time' }

  const candidates = candidateMinutes(token)
    .map((minutes) => {
      let score = 0
      if (minutes >= 6 * 60 && minutes <= 20 * 60) score += 5
      if (minutes >= 7 * 60 && minutes <= 18 * 60) score += 2
      if (
        kind === AVA_COACH_CALENDAR_COMMAND_KIND.MOVE_PERSONAL_TRAINING &&
        minutes >= 7 * 60 &&
        minutes <= 20 * 60
      ) {
        score += 4
      }
      if (minutes < 5 * 60) score -= 8
      if (minutes > 22 * 60) score -= 4
      return { minutes, score }
    })
    .sort((a, b) => b.score - a.score || a.minutes - b.minutes)

  const best = candidates[0]
  if (!best) return { status: 'invalid', reason: 'time' }

  const ties = candidates.filter((item) => item.score === best.score)
  if (
    ties.length > 1 &&
    ties.some((item) => Math.abs(item.minutes - best.minutes) >= 6 * 60)
  ) {
    return { status: 'ambiguous', reason: 'meridiem', candidates: ties }
  }

  const hour = Math.floor(best.minutes / 60)
  const minute = best.minutes % 60
  return {
    status: 'resolved',
    startMinutes: best.minutes,
    startTime: `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`,
  }
}

export const inferCoachTimeRange = (
  startValue,
  endValue,
  { kind = AVA_COACH_CALENDAR_COMMAND_KIND.PRIVATE_EVENT } = {},
) => {
  const startToken = normalizeTimeToken(startValue)
  const endToken = normalizeTimeToken(endValue)
  if (!startToken || !endToken) {
    return { status: 'invalid', reason: 'time' }
  }

  const startCandidates = candidateMinutes(startToken)
  const endCandidates = candidateMinutes(endToken)
  const candidates = []

  startCandidates.forEach((start) => {
    endCandidates.forEach((endBase) => {
      let end = endBase
      while (end <= start) end += 12 * 60
      if (end > 24 * 60) return

      const score = scoreRangeCandidate({ start, end, kind })
      if (Number.isFinite(score)) {
        candidates.push({ start, end, score })
      }
    })
  })

  candidates.sort((a, b) => b.score - a.score || a.start - b.start)
  const best = candidates[0]
  if (!best) return { status: 'invalid', reason: 'time-range' }

  const equallyGood = candidates.filter((item) => item.score === best.score)
  if (equallyGood.length > 1) {
    const materiallyDifferent = equallyGood.some(
      (item) => Math.abs(item.start - best.start) >= 6 * 60,
    )
    if (materiallyDifferent) {
      return {
        status: 'ambiguous',
        reason: 'meridiem',
        candidates: equallyGood.slice(0, 3),
      }
    }
  }

  const startHour = Math.floor(best.start / 60)
  const startMinute = best.start % 60
  const endHour = Math.floor(best.end / 60)
  const endMinute = best.end % 60

  return {
    status: 'resolved',
    startMinutes: best.start,
    endMinutes: best.end,
    durationMinutes: best.end - best.start,
    startTime: `${String(startHour).padStart(2, '0')}:${String(startMinute).padStart(2, '0')}`,
    endTime: `${String(endHour).padStart(2, '0')}:${String(endMinute).padStart(2, '0')}`,
  }
}

const nextWeekdayDate = (weekdayIndex, now = new Date()) => {
  const current = new Date(now)
  current.setHours(12, 0, 0, 0)
  const delta = (weekdayIndex - current.getDay() + 7) % 7
  const result = new Date(current)
  result.setDate(current.getDate() + delta)
  return result
}

export const resolveCoachCalendarDate = (value = '', now = new Date()) => {
  const text = lower(value)
  if (!text) return null

  if (text === 'today') return dateKey(now, DEFAULT_COACH_SCHEDULE_TIMEZONE)
  if (text === 'tomorrow') {
    const tomorrow = new Date(now)
    tomorrow.setDate(tomorrow.getDate() + 1)
    return dateKey(tomorrow, DEFAULT_COACH_SCHEDULE_TIMEZONE)
  }

  const weekday = Object.entries(WEEKDAY_INDEX).find(([name]) =>
    new RegExp(`\\b${name}\\b`).test(text),
  )
  if (weekday) {
    return dateKey(
      nextWeekdayDate(weekday[1], now),
      DEFAULT_COACH_SCHEDULE_TIMEZONE,
    )
  }

  const numeric = text.match(/\b(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?\b/)
  if (numeric) {
    const year = numeric[3]
      ? Number(numeric[3].length === 2 ? `20${numeric[3]}` : numeric[3])
      : now.getFullYear()
    const month = Number(numeric[1])
    const day = Number(numeric[2])
    const resolved = new Date(year, month - 1, day, 12, 0, 0, 0)
    if (!Number.isNaN(resolved.getTime())) {
      return dateKey(resolved, DEFAULT_COACH_SCHEDULE_TIMEZONE)
    }
  }

  return null
}

const TIME_RANGE_PATTERN =
  '(\\d{1,2}(?::?\\d{2})?\\s*(?:a\\.?m\\.?|p\\.?m\\.?)?)\\s*(?:-|to|until|through)\\s*(\\d{1,2}(?::?\\d{2})?\\s*(?:a\\.?m\\.?|p\\.?m\\.?)?)'

const DATE_PATTERN =
  '(today|tomorrow|sunday|sun|monday|mon|tuesday|tue|tues|wednesday|wed|thursday|thu|thurs|friday|fri|saturday|sat|\\d{1,2}\\/\\d{1,2}(?:\\/\\d{2,4})?)'

export const parseCoachCalendarCommand = (message = '', { now = new Date() } = {}) => {
  const original = normalizeText(message)
  const text = lower(original)
  if (!text) return null

  const moveClientPattern = new RegExp(
    `^(?:please\\s+)?(?:move|reschedule)\\s+(.+?)\\s+(?:to|for)\\s+${DATE_PATTERN}\\s+(?:at|from)\\s+(\\d{1,2}(?::?\\d{2})?\\s*(?:a\\.?m\\.?|p\\.?m\\.?)?)(?:\\s+.*)?import { coachBackend } from '../../lib/coachBackend'
import {
  addDaysKey,
  dateKey,
  formatScheduleDateLong,
  formatTime12Hour,
} from '../../lib/appointmentScheduling'
import { DEFAULT_COACH_SCHEDULE_TIMEZONE } from '../../lib/sessionTimezone'
import {
  resolveAthleteDataId,
  resolveRecordBusinessClientId,
} from '../../lib/coachBusinessClient'
import { getClientDisplayName } from '../../lib/clientDisplayName'
import { normalizeScheduledSession } from '../../lib/coachScheduledSessions'
import { normalizeCoachCalendarEvent } from '../../lib/coachCalendarEvents'
import {
  athleteCalendarBackend,
  normalizeAthleteCalendarEvent,
} from '../../lib/athleteCalendarEvents'

export const AVA_COACH_CALENDAR_COMMAND_KIND = {
  PRIVATE_EVENT: 'private_event',
  PERSONAL_TRAINING: 'personal_training',
  MOVE_PERSONAL_TRAINING: 'move_personal_training',
  MOVE_PRIVATE_EVENT: 'move_private_event',
}

const normalizeText = (value = '') =>
  String(value ?? '')
    .trim()
    .replace(/[\u2013\u2014]/g, '-')
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/\s+/g, ' ')

const lower = (value = '') => normalizeText(value).toLowerCase()

const WEEKDAY_INDEX = {
  sunday: 0,
  sun: 0,
  monday: 1,
  mon: 1,
  tuesday: 2,
  tue: 2,
  tues: 2,
  wednesday: 3,
  wed: 3,
  thursday: 4,
  thu: 4,
  thurs: 4,
  friday: 5,
  fri: 5,
  saturday: 6,
  sat: 6,
}

const normalizeTimeToken = (value = '') => {
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
    rawHour > 23 ||
    (meridiem && (rawHour < 1 || rawHour > 12))
  ) {
    return null
  }

  return { rawHour, minute, meridiem }
}

const toMinutes = ({ rawHour, minute, meridiem }, forcedMeridiem = null) => {
  const marker = meridiem ?? forcedMeridiem
  if (marker) {
    const normalizedHour = rawHour % 12
    return (normalizedHour + (marker === 'pm' ? 12 : 0)) * 60 + minute
  }
  return rawHour * 60 + minute
}

const candidateMinutes = (token) => {
  if (!token) return []
  if (token.meridiem) return [toMinutes(token)]

  if (token.rawHour === 0 || token.rawHour > 12) {
    return [toMinutes(token)]
  }

  const am = token.rawHour % 12 * 60 + token.minute
  const pm = am + 12 * 60
  return [...new Set([am, pm])]
}

const scoreRangeCandidate = ({ start, end, kind }) => {
  const duration = end - start
  if (duration < 15 || duration > 12 * 60) return -Infinity

  let score = 0

  if (start >= 6 * 60 && start <= 20 * 60) score += 5
  if (end >= 7 * 60 && end <= 22 * 60) score += 3
  if (duration <= 4 * 60) score += 2
  if (kind === AVA_COACH_CALENDAR_COMMAND_KIND.PERSONAL_TRAINING) {
    if (start >= 7 * 60 && start <= 20 * 60) score += 4
    if (duration >= 30 && duration <= 120) score += 4
  }
  if (start < 5 * 60) score -= 6
  if (end > 23 * 60) score -= 3

  return score
}

export const inferSingleCoachTime = (
  value,
  { kind = AVA_COACH_CALENDAR_COMMAND_KIND.PRIVATE_EVENT } = {},
) => {
  const token = normalizeTimeToken(value)
  if (!token) return { status: 'invalid', reason: 'time' }

  const candidates = candidateMinutes(token)
    .map((minutes) => {
      let score = 0
      if (minutes >= 6 * 60 && minutes <= 20 * 60) score += 5
      if (minutes >= 7 * 60 && minutes <= 18 * 60) score += 2
      if (
        kind === AVA_COACH_CALENDAR_COMMAND_KIND.MOVE_PERSONAL_TRAINING &&
        minutes >= 7 * 60 &&
        minutes <= 20 * 60
      ) {
        score += 4
      }
      if (minutes < 5 * 60) score -= 8
      if (minutes > 22 * 60) score -= 4
      return { minutes, score }
    })
    .sort((a, b) => b.score - a.score || a.minutes - b.minutes)

  const best = candidates[0]
  if (!best) return { status: 'invalid', reason: 'time' }

  const ties = candidates.filter((item) => item.score === best.score)
  if (
    ties.length > 1 &&
    ties.some((item) => Math.abs(item.minutes - best.minutes) >= 6 * 60)
  ) {
    return { status: 'ambiguous', reason: 'meridiem', candidates: ties }
  }

  const hour = Math.floor(best.minutes / 60)
  const minute = best.minutes % 60
  return {
    status: 'resolved',
    startMinutes: best.minutes,
    startTime: `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`,
  }
}

export const inferCoachTimeRange = (
  startValue,
  endValue,
  { kind = AVA_COACH_CALENDAR_COMMAND_KIND.PRIVATE_EVENT } = {},
) => {
  const startToken = normalizeTimeToken(startValue)
  const endToken = normalizeTimeToken(endValue)
  if (!startToken || !endToken) {
    return { status: 'invalid', reason: 'time' }
  }

  const startCandidates = candidateMinutes(startToken)
  const endCandidates = candidateMinutes(endToken)
  const candidates = []

  startCandidates.forEach((start) => {
    endCandidates.forEach((endBase) => {
      let end = endBase
      while (end <= start) end += 12 * 60
      if (end > 24 * 60) return

      const score = scoreRangeCandidate({ start, end, kind })
      if (Number.isFinite(score)) {
        candidates.push({ start, end, score })
      }
    })
  })

  candidates.sort((a, b) => b.score - a.score || a.start - b.start)
  const best = candidates[0]
  if (!best) return { status: 'invalid', reason: 'time-range' }

  const equallyGood = candidates.filter((item) => item.score === best.score)
  if (equallyGood.length > 1) {
    const materiallyDifferent = equallyGood.some(
      (item) => Math.abs(item.start - best.start) >= 6 * 60,
    )
    if (materiallyDifferent) {
      return {
        status: 'ambiguous',
        reason: 'meridiem',
        candidates: equallyGood.slice(0, 3),
      }
    }
  }

  const startHour = Math.floor(best.start / 60)
  const startMinute = best.start % 60
  const endHour = Math.floor(best.end / 60)
  const endMinute = best.end % 60

  return {
    status: 'resolved',
    startMinutes: best.start,
    endMinutes: best.end,
    durationMinutes: best.end - best.start,
    startTime: `${String(startHour).padStart(2, '0')}:${String(startMinute).padStart(2, '0')}`,
    endTime: `${String(endHour).padStart(2, '0')}:${String(endMinute).padStart(2, '0')}`,
  }
}

const nextWeekdayDate = (weekdayIndex, now = new Date()) => {
  const current = new Date(now)
  current.setHours(12, 0, 0, 0)
  const delta = (weekdayIndex - current.getDay() + 7) % 7
  const result = new Date(current)
  result.setDate(current.getDate() + delta)
  return result
}

export const resolveCoachCalendarDate = (value = '', now = new Date()) => {
  const text = lower(value)
  if (!text) return null

  if (text === 'today') return dateKey(now, DEFAULT_COACH_SCHEDULE_TIMEZONE)
  if (text === 'tomorrow') {
    const tomorrow = new Date(now)
    tomorrow.setDate(tomorrow.getDate() + 1)
    return dateKey(tomorrow, DEFAULT_COACH_SCHEDULE_TIMEZONE)
  }

  const weekday = Object.entries(WEEKDAY_INDEX).find(([name]) =>
    new RegExp(`\\b${name}\\b`).test(text),
  )
  if (weekday) {
    return dateKey(
      nextWeekdayDate(weekday[1], now),
      DEFAULT_COACH_SCHEDULE_TIMEZONE,
    )
  }

  const numeric = text.match(/\b(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?\b/)
  if (numeric) {
    const year = numeric[3]
      ? Number(numeric[3].length === 2 ? `20${numeric[3]}` : numeric[3])
      : now.getFullYear()
    const month = Number(numeric[1])
    const day = Number(numeric[2])
    const resolved = new Date(year, month - 1, day, 12, 0, 0, 0)
    if (!Number.isNaN(resolved.getTime())) {
      return dateKey(resolved, DEFAULT_COACH_SCHEDULE_TIMEZONE)
    }
  }

  return null
}

const TIME_RANGE_PATTERN =
  '(\\d{1,2}(?::?\\d{2})?\\s*(?:a\\.?m\\.?|p\\.?m\\.?)?)\\s*(?:-|to|until|through)\\s*(\\d{1,2}(?::?\\d{2})?\\s*(?:a\\.?m\\.?|p\\.?m\\.?)?)'

const DATE_PATTERN =
  '(today|tomorrow|sunday|sun|monday|mon|tuesday|tue|tues|wednesday|wed|thursday|thu|thurs|friday|fri|saturday|sat|\\d{1,2}\\/\\d{1,2}(?:\\/\\d{2,4})?)'

export const parseCoachCalendarCommand = (message = '', { now = new Date() } = {}) => {
  const original = normalizeText(message)
  const text = lower(original)
  if (!text) return null

,
    'i',
  )
  const moveClientMatch = original.match(moveClientPattern)
  if (moveClientMatch) {
    const [, clientQuery, datePhrase, startValue] = moveClientMatch
    return {
      kind: AVA_COACH_CALENDAR_COMMAND_KIND.MOVE_PERSONAL_TRAINING,
      original,
      clientQuery: normalizeText(clientQuery).replace(/['’]s\\s+appointment$/i, ''),
      datePhrase,
      date: resolveCoachCalendarDate(datePhrase, now),
      startValue,
      time: inferSingleCoachTime(startValue, {
        kind: AVA_COACH_CALENDAR_COMMAND_KIND.MOVE_PERSONAL_TRAINING,
      }),
    }
  }

  const movePrivatePattern = new RegExp(
    `^(?:please\\s+)?(?:move|reschedule)\\s+(?:my\\s+)?(.+?)(?:\\s+appointment)?\\s+(?:to|for)\\s+${DATE_PATTERN}\\s+(?:at|from)\\s+(\\d{1,2}(?::?\\d{2})?\\s*(?:a\\.?m\\.?|p\\.?m\\.?)?)(?:\\s+.*)?import { coachBackend } from '../../lib/coachBackend'
import {
  addDaysKey,
  dateKey,
  formatScheduleDateLong,
  formatTime12Hour,
} from '../../lib/appointmentScheduling'
import { DEFAULT_COACH_SCHEDULE_TIMEZONE } from '../../lib/sessionTimezone'
import {
  resolveAthleteDataId,
  resolveRecordBusinessClientId,
} from '../../lib/coachBusinessClient'
import { getClientDisplayName } from '../../lib/clientDisplayName'
import { normalizeScheduledSession } from '../../lib/coachScheduledSessions'
import { normalizeCoachCalendarEvent } from '../../lib/coachCalendarEvents'
import {
  athleteCalendarBackend,
  normalizeAthleteCalendarEvent,
} from '../../lib/athleteCalendarEvents'

export const AVA_COACH_CALENDAR_COMMAND_KIND = {
  PRIVATE_EVENT: 'private_event',
  PERSONAL_TRAINING: 'personal_training',
  MOVE_PERSONAL_TRAINING: 'move_personal_training',
  MOVE_PRIVATE_EVENT: 'move_private_event',
}

const normalizeText = (value = '') =>
  String(value ?? '')
    .trim()
    .replace(/[\u2013\u2014]/g, '-')
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/\s+/g, ' ')

const lower = (value = '') => normalizeText(value).toLowerCase()

const WEEKDAY_INDEX = {
  sunday: 0,
  sun: 0,
  monday: 1,
  mon: 1,
  tuesday: 2,
  tue: 2,
  tues: 2,
  wednesday: 3,
  wed: 3,
  thursday: 4,
  thu: 4,
  thurs: 4,
  friday: 5,
  fri: 5,
  saturday: 6,
  sat: 6,
}

const normalizeTimeToken = (value = '') => {
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
    rawHour > 23 ||
    (meridiem && (rawHour < 1 || rawHour > 12))
  ) {
    return null
  }

  return { rawHour, minute, meridiem }
}

const toMinutes = ({ rawHour, minute, meridiem }, forcedMeridiem = null) => {
  const marker = meridiem ?? forcedMeridiem
  if (marker) {
    const normalizedHour = rawHour % 12
    return (normalizedHour + (marker === 'pm' ? 12 : 0)) * 60 + minute
  }
  return rawHour * 60 + minute
}

const candidateMinutes = (token) => {
  if (!token) return []
  if (token.meridiem) return [toMinutes(token)]

  if (token.rawHour === 0 || token.rawHour > 12) {
    return [toMinutes(token)]
  }

  const am = token.rawHour % 12 * 60 + token.minute
  const pm = am + 12 * 60
  return [...new Set([am, pm])]
}

const scoreRangeCandidate = ({ start, end, kind }) => {
  const duration = end - start
  if (duration < 15 || duration > 12 * 60) return -Infinity

  let score = 0

  if (start >= 6 * 60 && start <= 20 * 60) score += 5
  if (end >= 7 * 60 && end <= 22 * 60) score += 3
  if (duration <= 4 * 60) score += 2
  if (kind === AVA_COACH_CALENDAR_COMMAND_KIND.PERSONAL_TRAINING) {
    if (start >= 7 * 60 && start <= 20 * 60) score += 4
    if (duration >= 30 && duration <= 120) score += 4
  }
  if (start < 5 * 60) score -= 6
  if (end > 23 * 60) score -= 3

  return score
}

export const inferSingleCoachTime = (
  value,
  { kind = AVA_COACH_CALENDAR_COMMAND_KIND.PRIVATE_EVENT } = {},
) => {
  const token = normalizeTimeToken(value)
  if (!token) return { status: 'invalid', reason: 'time' }

  const candidates = candidateMinutes(token)
    .map((minutes) => {
      let score = 0
      if (minutes >= 6 * 60 && minutes <= 20 * 60) score += 5
      if (minutes >= 7 * 60 && minutes <= 18 * 60) score += 2
      if (
        kind === AVA_COACH_CALENDAR_COMMAND_KIND.MOVE_PERSONAL_TRAINING &&
        minutes >= 7 * 60 &&
        minutes <= 20 * 60
      ) {
        score += 4
      }
      if (minutes < 5 * 60) score -= 8
      if (minutes > 22 * 60) score -= 4
      return { minutes, score }
    })
    .sort((a, b) => b.score - a.score || a.minutes - b.minutes)

  const best = candidates[0]
  if (!best) return { status: 'invalid', reason: 'time' }

  const ties = candidates.filter((item) => item.score === best.score)
  if (
    ties.length > 1 &&
    ties.some((item) => Math.abs(item.minutes - best.minutes) >= 6 * 60)
  ) {
    return { status: 'ambiguous', reason: 'meridiem', candidates: ties }
  }

  const hour = Math.floor(best.minutes / 60)
  const minute = best.minutes % 60
  return {
    status: 'resolved',
    startMinutes: best.minutes,
    startTime: `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`,
  }
}

export const inferCoachTimeRange = (
  startValue,
  endValue,
  { kind = AVA_COACH_CALENDAR_COMMAND_KIND.PRIVATE_EVENT } = {},
) => {
  const startToken = normalizeTimeToken(startValue)
  const endToken = normalizeTimeToken(endValue)
  if (!startToken || !endToken) {
    return { status: 'invalid', reason: 'time' }
  }

  const startCandidates = candidateMinutes(startToken)
  const endCandidates = candidateMinutes(endToken)
  const candidates = []

  startCandidates.forEach((start) => {
    endCandidates.forEach((endBase) => {
      let end = endBase
      while (end <= start) end += 12 * 60
      if (end > 24 * 60) return

      const score = scoreRangeCandidate({ start, end, kind })
      if (Number.isFinite(score)) {
        candidates.push({ start, end, score })
      }
    })
  })

  candidates.sort((a, b) => b.score - a.score || a.start - b.start)
  const best = candidates[0]
  if (!best) return { status: 'invalid', reason: 'time-range' }

  const equallyGood = candidates.filter((item) => item.score === best.score)
  if (equallyGood.length > 1) {
    const materiallyDifferent = equallyGood.some(
      (item) => Math.abs(item.start - best.start) >= 6 * 60,
    )
    if (materiallyDifferent) {
      return {
        status: 'ambiguous',
        reason: 'meridiem',
        candidates: equallyGood.slice(0, 3),
      }
    }
  }

  const startHour = Math.floor(best.start / 60)
  const startMinute = best.start % 60
  const endHour = Math.floor(best.end / 60)
  const endMinute = best.end % 60

  return {
    status: 'resolved',
    startMinutes: best.start,
    endMinutes: best.end,
    durationMinutes: best.end - best.start,
    startTime: `${String(startHour).padStart(2, '0')}:${String(startMinute).padStart(2, '0')}`,
    endTime: `${String(endHour).padStart(2, '0')}:${String(endMinute).padStart(2, '0')}`,
  }
}

const nextWeekdayDate = (weekdayIndex, now = new Date()) => {
  const current = new Date(now)
  current.setHours(12, 0, 0, 0)
  const delta = (weekdayIndex - current.getDay() + 7) % 7
  const result = new Date(current)
  result.setDate(current.getDate() + delta)
  return result
}

export const resolveCoachCalendarDate = (value = '', now = new Date()) => {
  const text = lower(value)
  if (!text) return null

  if (text === 'today') return dateKey(now, DEFAULT_COACH_SCHEDULE_TIMEZONE)
  if (text === 'tomorrow') {
    const tomorrow = new Date(now)
    tomorrow.setDate(tomorrow.getDate() + 1)
    return dateKey(tomorrow, DEFAULT_COACH_SCHEDULE_TIMEZONE)
  }

  const weekday = Object.entries(WEEKDAY_INDEX).find(([name]) =>
    new RegExp(`\\b${name}\\b`).test(text),
  )
  if (weekday) {
    return dateKey(
      nextWeekdayDate(weekday[1], now),
      DEFAULT_COACH_SCHEDULE_TIMEZONE,
    )
  }

  const numeric = text.match(/\b(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?\b/)
  if (numeric) {
    const year = numeric[3]
      ? Number(numeric[3].length === 2 ? `20${numeric[3]}` : numeric[3])
      : now.getFullYear()
    const month = Number(numeric[1])
    const day = Number(numeric[2])
    const resolved = new Date(year, month - 1, day, 12, 0, 0, 0)
    if (!Number.isNaN(resolved.getTime())) {
      return dateKey(resolved, DEFAULT_COACH_SCHEDULE_TIMEZONE)
    }
  }

  return null
}

const TIME_RANGE_PATTERN =
  '(\\d{1,2}(?::?\\d{2})?\\s*(?:a\\.?m\\.?|p\\.?m\\.?)?)\\s*(?:-|to|until|through)\\s*(\\d{1,2}(?::?\\d{2})?\\s*(?:a\\.?m\\.?|p\\.?m\\.?)?)'

const DATE_PATTERN =
  '(today|tomorrow|sunday|sun|monday|mon|tuesday|tue|tues|wednesday|wed|thursday|thu|thurs|friday|fri|saturday|sat|\\d{1,2}\\/\\d{1,2}(?:\\/\\d{2,4})?)'

export const parseCoachCalendarCommand = (message = '', { now = new Date() } = {}) => {
  const original = normalizeText(message)
  const text = lower(original)
  if (!text) return null

,
    'i',
  )
  const movePrivateMatch = original.match(movePrivatePattern)
  if (movePrivateMatch) {
    const [, titleQuery, datePhrase, startValue] = movePrivateMatch
    return {
      kind: AVA_COACH_CALENDAR_COMMAND_KIND.MOVE_PRIVATE_EVENT,
      original,
      titleQuery: normalizeText(titleQuery),
      datePhrase,
      date: resolveCoachCalendarDate(datePhrase, now),
      startValue,
      time: inferSingleCoachTime(startValue, {
        kind: AVA_COACH_CALENDAR_COMMAND_KIND.MOVE_PRIVATE_EVENT,
      }),
    }
  }

  const clientPattern = new RegExp(
    `^(?:please\\s+)?(?:schedule|book|put)\\s+(.+?)\\s+(?:for|on)\\s+${DATE_PATTERN}\\s+(?:at|from)\\s+${TIME_RANGE_PATTERN}(?:\\s+.*)?$`,
    'i',
  )
  const clientMatch = original.match(clientPattern)
  if (clientMatch) {
    const [, clientQuery, datePhrase, startValue, endValue] = clientMatch
    const date = resolveCoachCalendarDate(datePhrase, now)
    const time = inferCoachTimeRange(startValue, endValue, {
      kind: AVA_COACH_CALENDAR_COMMAND_KIND.PERSONAL_TRAINING,
    })

    return {
      kind: AVA_COACH_CALENDAR_COMMAND_KIND.PERSONAL_TRAINING,
      original,
      clientQuery: normalizeText(clientQuery),
      datePhrase,
      date,
      startValue,
      endValue,
      time,
    }
  }

  const privatePatterns = [
    new RegExp(
      `^(?:i\\s+(?:have|got)|i'?ve got)\\s+(.+?)\\s+(?:at|from)\\s+${TIME_RANGE_PATTERN}\\s+(?:on\\s+)?${DATE_PATTERN}(?:\\s+.*)?$`,
      'i',
    ),
    new RegExp(
      `^(?:add|put)\\s+(.+?)\\s+(?:on|to)\\s+(?:my\\s+)?calendar\\s+(?:on\\s+)?${DATE_PATTERN}\\s+(?:at|from)\\s+${TIME_RANGE_PATTERN}(?:\\s+.*)?$`,
      'i',
    ),
  ]

  for (const pattern of privatePatterns) {
    const match = original.match(pattern)
    if (!match) continue

    const [, title, startValue, endValue, datePhrase] =
      pattern === privatePatterns[0]
        ? match
        : [match[0], match[1], match[3], match[4], match[2]]

    const date = resolveCoachCalendarDate(datePhrase, now)
    const time = inferCoachTimeRange(startValue, endValue, {
      kind: AVA_COACH_CALENDAR_COMMAND_KIND.PRIVATE_EVENT,
    })

    return {
      kind: AVA_COACH_CALENDAR_COMMAND_KIND.PRIVATE_EVENT,
      original,
      title: normalizeText(title),
      datePhrase,
      date,
      startValue,
      endValue,
      time,
    }
  }

  return null
}

const normalizeName = (value = '') =>
  lower(value)
    .replace(/[^a-z0-9\s'-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()

const clientNameVariants = (client = {}) => {
  const profile = client.profile ?? client.user_profile ?? {}
  return [
    getClientDisplayName(client),
    client.coach_label,
    client.athlete_display_name,
    client.display_name,
    client.preferred_name,
    client.first_name,
    [client.first_name, client.last_name].filter(Boolean).join(' '),
    profile.display_name,
    profile.preferred_name,
    profile.first_name,
    [profile.first_name, profile.last_name].filter(Boolean).join(' '),
  ]
    .map(normalizeName)
    .filter(Boolean)
}

export const resolveCalendarClient = (query = '', clients = []) => {
  const target = normalizeName(query)
  if (!target) return { status: 'none', matches: [] }

  const records = (clients ?? []).map((client) => ({
    client,
    names: [...new Set(clientNameVariants(client))],
  }))

  const exact = records.filter((record) => record.names.includes(target))
  if (exact.length === 1) return { status: 'resolved', client: exact[0].client }
  if (exact.length > 1) return { status: 'ambiguous', matches: exact.map((r) => r.client) }

  const partial = records.filter((record) =>
    record.names.some((name) => name.includes(target) || target.includes(name)),
  )
  if (partial.length === 1) return { status: 'resolved', client: partial[0].client }
  if (partial.length > 1) return { status: 'ambiguous', matches: partial.map((r) => r.client) }

  return { status: 'none', matches: [] }
}

const formatRange = (startTime, endTime) =>
  `${formatTime12Hour(startTime)}–${formatTime12Hour(endTime)}`

const calendarItemsForDate = async (date) => {
  const [appointments, events, athletePrivateEvents] = await Promise.all([
    coachBackend.listScheduledSessions({ startDate: date, endDate: date }),
    coachBackend.listCoachCalendarEvents({ startDate: date, endDate: date }),
    athleteCalendarBackend.list({ startDate: date, endDate: date }),
  ])

  return [
    ...(appointments ?? []).map(normalizeScheduledSession).filter(Boolean),
    ...(events ?? []).map(normalizeCoachCalendarEvent).filter(Boolean),
    ...(athletePrivateEvents ?? [])
      .map(normalizeAthleteCalendarEvent)
      .filter(Boolean),
  ]
}

const normalizeEventTitle = (value = '') =>
  lower(value)
    .replace(/\\bappointment\\b/g, '')
    .replace(/[^a-z0-9\\s'-]/g, ' ')
    .replace(/\\s+/g, ' ')
    .trim()

const findUpcomingClientAppointments = async (client, now = new Date()) => {
  const startDate = dateKey(now, DEFAULT_COACH_SCHEDULE_TIMEZONE)
  const endDate = addDaysKey(startDate, 84)
  const rows = await coachBackend.listScheduledSessions({
    startDate,
    endDate,
    businessClientId: resolveRecordBusinessClientId(client) ?? null,
    athleteId: resolveAthleteDataId(client) ?? null,
  })
  return (rows ?? [])
    .map(normalizeScheduledSession)
    .filter((item) => item?.status === 'scheduled')
}

const findUpcomingPrivateEvents = async (query, now = new Date()) => {
  const startDate = dateKey(now, DEFAULT_COACH_SCHEDULE_TIMEZONE)
  const endDate = addDaysKey(startDate, 120)
  const [coachRows, athleteRows] = await Promise.all([
    coachBackend.listCoachCalendarEvents({ startDate, endDate }),
    athleteCalendarBackend.list({ startDate, endDate }),
  ])
  const target = normalizeEventTitle(query)
  const all = [
    ...(coachRows ?? []).map(normalizeCoachCalendarEvent).filter(Boolean),
    ...(athleteRows ?? []).map(normalizeAthleteCalendarEvent).filter(Boolean),
  ]
  const exact = all.filter((item) => normalizeEventTitle(item.title) === target)
  if (exact.length) return exact
  return all.filter((item) => normalizeEventTitle(item.title).includes(target))
}

const notifyCalendarUpdated = () => {
  if (typeof window === 'undefined') return
  window.dispatchEvent(new CustomEvent('avaren:coach-calendar-updated'))
}

export async function executeCoachCalendarCommand(
  command,
  { clients = [] } = {},
) {
  if (!command?.date) {
    return {
      kind: 'clarification',
      message: 'What day should I put that on your calendar?',
    }
  }

  if (command.time?.status === 'ambiguous') {
    return {
      kind: 'clarification',
      message: 'What AM/PM times did you mean for that?',
    }
  }

  if (command.time?.status !== 'resolved') {
    return {
      kind: 'clarification',
      message: 'What start and end time should I use?',
    }
  }

  if (
    command.kind === AVA_COACH_CALENDAR_COMMAND_KIND.MOVE_PERSONAL_TRAINING ||
    command.kind === AVA_COACH_CALENDAR_COMMAND_KIND.MOVE_PRIVATE_EVENT
  ) {
    if (!command?.date) {
      return {
        kind: 'clarification',
        message: 'What day should I move it to?',
      }
    }
    if (command.time?.status === 'ambiguous') {
      return {
        kind: 'clarification',
        message: 'What AM/PM time did you mean?',
      }
    }
    if (command.time?.status !== 'resolved') {
      return {
        kind: 'clarification',
        message: 'What time should I move it to?',
      }
    }
  }

  if (command.kind === AVA_COACH_CALENDAR_COMMAND_KIND.MOVE_PERSONAL_TRAINING) {
    const resolution = resolveCalendarClient(command.clientQuery, clients)
    if (resolution.status === 'none') {
      return {
        kind: 'clarification',
        message: `I couldn't find ${command.clientQuery} in your client roster. Which client did you mean?`,
      }
    }
    if (resolution.status === 'ambiguous') {
      return {
        kind: 'clarification',
        message: `I found more than one match for ${command.clientQuery}. Which client did you mean?`,
      }
    }

    const matches = await findUpcomingClientAppointments(resolution.client)
    if (!matches.length) {
      return {
        kind: 'clarification',
        message: `I couldn't find an upcoming appointment for ${getClientDisplayName(resolution.client)}.`,
      }
    }
    if (matches.length > 1) {
      return {
        kind: 'clarification',
        message: `I found more than one upcoming appointment for ${getClientDisplayName(resolution.client)}. Tell me which current day you want to move.`,
      }
    }

    const currentAppointment = matches[0]
    const destinationItems = await calendarItemsForDate(command.date)
    try {
      await coachBackend.updateScheduledSession(
        currentAppointment.id,
        {
          sessionDate: command.date,
          startTime: command.time.startTime,
          durationMinutes: currentAppointment.durationMinutes ?? 60,
          scheduleTimezone:
            currentAppointment.scheduleTimezone ??
            DEFAULT_COACH_SCHEDULE_TIMEZONE,
        },
        { existingSessions: destinationItems },
      )
    } catch (error) {
      if (
        error?.message === 'appointment_overlap' ||
        /overlap/i.test(error?.message ?? '')
      ) {
        return {
          kind: 'conflict',
          message: `That time overlaps something already on your calendar, so I didn't move ${getClientDisplayName(resolution.client)}.`,
        }
      }
      throw error
    }

    notifyCalendarUpdated()
    return {
      kind: 'success',
      message: `Done — ${getClientDisplayName(resolution.client)} is moved to ${formatScheduleDateLong(command.date)} at ${formatTime12Hour(command.time.startTime)}.`,
    }
  }

  if (command.kind === AVA_COACH_CALENDAR_COMMAND_KIND.MOVE_PRIVATE_EVENT) {
    const matches = await findUpcomingPrivateEvents(command.titleQuery)
    if (!matches.length) {
      return {
        kind: 'clarification',
        message: `I couldn't find an upcoming “${command.titleQuery}” event on your private calendars.`,
      }
    }
    if (matches.length > 1) {
      return {
        kind: 'clarification',
        message: `I found more than one “${command.titleQuery}” event. Tell me which current day you mean.`,
      }
    }

    const event = matches[0]
    const destinationItems = await calendarItemsForDate(command.date)
    const payload = {
      title: event.title,
      eventDate: command.date,
      startTime: command.time.startTime,
      durationMinutes: event.durationMinutes ?? 60,
      category: event.category,
      notes: event.notes ?? '',
      locationName: event.locationName ?? '',
    }

    try {
      if (event.isAthletePrivateEvent) {
        const conflict = destinationItems.find(
          (item) =>
            item.id !== event.id &&
            item.status === 'scheduled' &&
            item.sessionDate === command.date,
        )
        // Athlete-private events may intentionally overlap; preserve the same
        // permissive behavior as manual athlete calendar editing.
        void conflict
        await athleteCalendarBackend.update(event.id, payload)
      } else {
        await coachBackend.updateCoachCalendarEvent(event.id, {
          ...payload,
          existingItems: destinationItems,
        })
      }
    } catch (error) {
      if (
        error?.message === 'calendar_overlap' ||
        /overlap/i.test(error?.message ?? '')
      ) {
        return {
          kind: 'conflict',
          message: `That time overlaps something already on your calendar, so I didn't move ${event.title}.`,
        }
      }
      throw error
    }

    notifyCalendarUpdated()
    return {
      kind: 'success',
      message: `Done — ${event.title} is moved to ${formatScheduleDateLong(command.date)} at ${formatTime12Hour(command.time.startTime)}.`,
    }
  }

  const existingItems = await calendarItemsForDate(command.date)

  if (command.kind === AVA_COACH_CALENDAR_COMMAND_KIND.PRIVATE_EVENT) {
    try {
      await coachBackend.createCoachCalendarEvent({
        title: command.title,
        eventDate: command.date,
        startTime: command.time.startTime,
        durationMinutes: command.time.durationMinutes,
        category: 'personal',
        existingItems,
      })
    } catch (error) {
      if (error?.message === 'calendar_overlap') {
        return {
          kind: 'conflict',
          message: `That overlaps something already on your calendar. I didn't add ${command.title}.`,
        }
      }
      throw error
    }

    notifyCalendarUpdated()
    return {
      kind: 'success',
      message: `Done — ${command.title} is on your calendar ${formatScheduleDateLong(command.date)} from ${formatRange(command.time.startTime, command.time.endTime)}.`,
    }
  }

  if (command.kind === AVA_COACH_CALENDAR_COMMAND_KIND.PERSONAL_TRAINING) {
    const resolution = resolveCalendarClient(command.clientQuery, clients)

    if (resolution.status === 'none') {
      return {
        kind: 'clarification',
        message: `I couldn't find ${command.clientQuery} in your client roster. Which client did you mean?`,
      }
    }

    if (resolution.status === 'ambiguous') {
      const labels = resolution.matches
        .slice(0, 3)
        .map((client) => getClientDisplayName(client))
        .filter(Boolean)
      return {
        kind: 'clarification',
        message: labels.length
          ? `I found more than one match for ${command.clientQuery}: ${labels.join(', ')}. Which one?`
          : `I found more than one ${command.clientQuery}. Which client did you mean?`,
      }
    }

    const client = resolution.client
    const businessClientId = resolveRecordBusinessClientId(client)
    const athleteId = resolveAthleteDataId(client)

    try {
      await coachBackend.createScheduledSession({
        businessClientId,
        athleteId,
        sessionDate: command.date,
        startTime: command.time.startTime,
        durationMinutes: command.time.durationMinutes,
        locationType: 'default',
        locationName: '',
        coachNote: 'Scheduled by AVA',
        assignmentId: null,
        existingSessions: existingItems,
      })
    } catch (error) {
      if (error?.message === 'appointment_overlap') {
        return {
          kind: 'conflict',
          message: `That time overlaps something already on your calendar, so I didn't schedule ${getClientDisplayName(client)}.`,
        }
      }
      throw error
    }

    notifyCalendarUpdated()
    return {
      kind: 'success',
      message: `Done — ${getClientDisplayName(client)} is scheduled for personal training ${formatScheduleDateLong(command.date)} from ${formatRange(command.time.startTime, command.time.endTime)}.`,
    }
  }

  return null
}
