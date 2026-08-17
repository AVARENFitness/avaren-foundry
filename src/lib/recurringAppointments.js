import { addDaysKey, parseDateKey } from './appointmentScheduling'
import { findOverlappingAppointment } from './coachingAppointment'
import { buildScheduleInstant } from './sessionReminders'
import { DEFAULT_COACH_SCHEDULE_TIMEZONE } from './sessionTimezone'

/** Rolling materialization window — extend as calendar approaches horizon. */
export const RECURRENCE_HORIZON_WEEKS = 12

export const RECURRENCE_SCOPE = {
  THIS_ONLY: 'this_only',
  THIS_AND_FUTURE: 'this_and_future',
}

export const RECURRENCE_MODE = {
  NONE: 'none',
  WEEKLY: 'weekly',
  CUSTOM: 'custom',
}

export const RECURRENCE_END = {
  ON_DATE: 'on_date',
  AFTER_COUNT: 'after_count',
}

/** JavaScript weekday index: 0 = Sunday … 6 = Saturday. */
export const WEEKDAY = {
  SUN: 0,
  MON: 1,
  TUE: 2,
  WED: 3,
  THU: 4,
  FRI: 5,
  SAT: 6,
}

export const WEEKDAY_ORDER = [
  WEEKDAY.MON,
  WEEKDAY.TUE,
  WEEKDAY.WED,
  WEEKDAY.THU,
  WEEKDAY.FRI,
  WEEKDAY.SAT,
  WEEKDAY.SUN,
]

export const WEEKDAY_SHORT_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

export const emptyRecurrenceDraft = () => ({
  enabled: false,
  mode: RECURRENCE_MODE.NONE,
  weekdays: [],
  endType: RECURRENCE_END.ON_DATE,
  endsOn: '',
  occurrenceLimit: '',
})

export const weekdayFromDateKey = (dateKeyValue = '') => {
  const { year, month, day } = parseDateKey(dateKeyValue)
  return new Date(year, month - 1, day).getDay()
}

export const resolveRecurrenceWeekdays = ({
  mode = RECURRENCE_MODE.NONE,
  weekdays = [],
  startsOn = '',
} = {}) => {
  if (mode === RECURRENCE_MODE.WEEKLY) {
    return [weekdayFromDateKey(startsOn)]
  }

  if (mode === RECURRENCE_MODE.CUSTOM) {
    return [...new Set(weekdays)].sort((a, b) => a - b)
  }

  return []
}

export const computeMaterializationEndKey = ({
  startsOn = '',
  endsOn = null,
  occurrenceLimit = null,
  horizonWeeks = RECURRENCE_HORIZON_WEEKS,
} = {}) => {
  const horizonEnd = addDaysKey(startsOn, horizonWeeks * 7)
  if (endsOn && (!horizonEnd || endsOn <= horizonEnd)) return endsOn
  return horizonEnd
}

export const generateRecurrenceOccurrenceDates = ({
  startsOn = '',
  weekdays = [],
  endsOn = null,
  occurrenceLimit = null,
  horizonWeeks = RECURRENCE_HORIZON_WEEKS,
} = {}) => {
  if (!startsOn || !weekdays.length) return []

  const weekdaySet = new Set(weekdays)
  const endKey = computeMaterializationEndKey({
    startsOn,
    endsOn,
    occurrenceLimit,
    horizonWeeks,
  })

  const dates = []
  let cursor = startsOn

  while (cursor <= endKey) {
    if (weekdaySet.has(weekdayFromDateKey(cursor))) {
      dates.push(cursor)
      if (occurrenceLimit && dates.length >= occurrenceLimit) break
    }
    cursor = addDaysKey(cursor, 1)
  }

  return dates
}

export const buildRecurrenceOccurrenceKey = (seriesId = '', occurrenceDate = '') =>
  `${seriesId}:${occurrenceDate}`

export const materializeRecurrenceOccurrences = ({
  seriesId = 'series-1',
  startsOn = '',
  startTime = '16:00',
  durationMinutes = 60,
  weekdays = [],
  endsOn = null,
  occurrenceLimit = null,
  scheduleTimezone = DEFAULT_COACH_SCHEDULE_TIMEZONE,
  existingOccurrences = [],
  exceptionDates = [],
  horizonWeeks = RECURRENCE_HORIZON_WEEKS,
} = {}) => {
  const existingKeys = new Set(
    existingOccurrences.map((row) =>
      buildRecurrenceOccurrenceKey(
        row.recurrenceSeriesId ?? row.recurrence_series_id ?? seriesId,
        row.recurrenceOccurrenceDate ?? row.recurrence_occurrence_date ?? row.sessionDate,
      ),
    ),
  )
  const exceptionSet = new Set(exceptionDates)

  const targetDates = generateRecurrenceOccurrenceDates({
    startsOn,
    weekdays,
    endsOn,
    occurrenceLimit,
    horizonWeeks,
  })

  const created = []

  targetDates.forEach((occurrenceDate) => {
    if (exceptionSet.has(occurrenceDate)) return

    const key = buildRecurrenceOccurrenceKey(seriesId, occurrenceDate)
    if (existingKeys.has(key)) return

    const instant = buildScheduleInstant({
      sessionDate: occurrenceDate,
      startTime,
      scheduleTimezone,
    })

    created.push({
      recurrenceSeriesId: seriesId,
      recurrenceOccurrenceDate: occurrenceDate,
      sessionDate: occurrenceDate,
      startTime,
      durationMinutes,
      startsAt: instant.startsAt,
      scheduleTimezone: instant.scheduleTimezone,
      status: 'scheduled',
      recurrenceException: false,
    })
    existingKeys.add(key)
  })

  return created
}

export const formatRecurrenceWeekdayList = (weekdays = []) => {
  const ordered = WEEKDAY_ORDER.filter((day) => weekdays.includes(day))
  return ordered.map((day) => WEEKDAY_SHORT_LABELS[day]).join(', ')
}

export const formatRecurrenceScheduleLabel = ({
  weekdays = [],
  startTime = '',
  scheduleTimezone = DEFAULT_COACH_SCHEDULE_TIMEZONE,
} = {}) => {
  const dayLabel = formatRecurrenceWeekdayList(weekdays)
  const instant = buildScheduleInstant({
    sessionDate: '2026-08-17',
    startTime,
    scheduleTimezone,
  })
  const sample = new Date(instant.startsAt ?? Date.now())
  const timeLabel = sample.toLocaleTimeString([], {
    hour: 'numeric',
    minute: '2-digit',
    timeZone: scheduleTimezone,
  })

  return `${dayLabel} at ${timeLabel}`
}

export const isRecurringSession = (session = {}) =>
  Boolean(session.recurrenceSeriesId ?? session.recurrence_series_id)

export const partitionEligibleFutureOccurrences = ({
  sessions = [],
  seriesId = '',
  effectiveDate = '',
} = {}) => {
  const eligibleStatuses = new Set(['scheduled'])

  return sessions.filter((session) => {
    const matchesSeries =
      String(session.recurrenceSeriesId ?? session.recurrence_series_id ?? '') ===
      String(seriesId)
    if (!matchesSeries) return false
    if (!eligibleStatuses.has(String(session.status ?? ''))) return false
    return String(session.sessionDate ?? '') >= String(effectiveDate)
  })
}

export const preserveHistoricalOccurrences = ({
  sessions = [],
  seriesId = '',
  effectiveDate = '',
} = {}) =>
  sessions.filter((session) => {
    const matchesSeries =
      String(session.recurrenceSeriesId ?? session.recurrence_series_id ?? '') ===
      String(seriesId)
    if (!matchesSeries) return false
    return String(session.sessionDate ?? '') < String(effectiveDate)
  })

export const validateRecurrenceDraft = (draft = {}, sessionDate = '') => {
  if (!draft.enabled) return null
  if (!sessionDate) return 'Select a start date.'

  const weekdays = resolveRecurrenceWeekdays({
    mode: draft.mode,
    weekdays: draft.weekdays,
    startsOn: sessionDate,
  })

  if (!weekdays.length) return 'Choose at least one weekday.'

  if (draft.endType === RECURRENCE_END.ON_DATE) {
    if (!draft.endsOn) return 'Choose an end date.'
    if (draft.endsOn < sessionDate) return 'End date must be on or after the start date.'
  }

  if (draft.endType === RECURRENCE_END.AFTER_COUNT) {
    const count = Number(draft.occurrenceLimit)
    if (!Number.isFinite(count) || count < 1) {
      return 'Enter how many occurrences to schedule.'
    }
  }

  return null
}

export const HORIZON_EXTENSION_THRESHOLD_DAYS = 14

export const computeHorizonExtensionTargetKey = ({
  todayKey = '',
  horizonWeeks = RECURRENCE_HORIZON_WEEKS,
  thresholdDays = HORIZON_EXTENSION_THRESHOLD_DAYS,
} = {}) => {
  if (!todayKey) return ''
  return addDaysKey(todayKey, horizonWeeks * 7 - thresholdDays)
}

export const countLifetimeOccurrenceSlots = ({
  sessions = [],
  conflictRecords = [],
  seriesId = '',
} = {}) => {
  const dates = new Set()

  for (const session of sessions) {
    if (
      String(session.recurrenceSeriesId ?? session.recurrence_series_id ?? '') !==
      String(seriesId)
    ) {
      continue
    }

    const occurrenceDate =
      session.recurrenceOccurrenceDate ??
      session.recurrence_occurrence_date ??
      session.sessionDate

    if (occurrenceDate) {
      dates.add(occurrenceDate)
    }
  }

  for (const record of conflictRecords) {
    if (String(record.seriesId ?? record.recurrenceSeriesId ?? '') !== String(seriesId)) {
      continue
    }

    if (record.occurrenceDate) {
      dates.add(record.occurrenceDate)
    }
  }

  return dates.size
}

/** @deprecated use countLifetimeOccurrenceSlots */
export const countMaterializedOccurrences = countLifetimeOccurrenceSlots

export const normalizeRecurrenceWeekdays = (weekdays = []) =>
  [...new Set(weekdays.filter((day) => day >= 0 && day <= 6))].sort((a, b) => a - b)

export const validateRecurrenceSeriesInput = ({
  startsOn = '',
  endsOn = null,
  weekdays = [],
  scheduleTimezone = DEFAULT_COACH_SCHEDULE_TIMEZONE,
} = {}) => {
  if (endsOn && startsOn && endsOn < startsOn) {
    return 'recurrence_invalid_end_date'
  }

  const normalized = normalizeRecurrenceWeekdays(weekdays)
  if (!normalized.length) {
    return 'recurrence_invalid_weekdays'
  }

  if (startsOn && !normalized.includes(weekdayFromDateKey(startsOn))) {
    return 'recurrence_starts_on_weekday_mismatch'
  }

  if (!scheduleTimezone?.trim()) {
    return 'recurrence_invalid_timezone'
  }

  return null
}

export const assertRecurrencePreflightCoachAccess = ({
  callerCoachId = '',
  targetCoachId = '',
} = {}) => {
  if (!callerCoachId || !targetCoachId || callerCoachId !== targetCoachId) {
    throw new Error('recurrence_preflight_forbidden')
  }
}

export const canApplyThisAndFutureScheduleChange = ({
  originalSessionDate = '',
  nextSessionDate = '',
} = {}) => String(originalSessionDate) === String(nextSessionDate)

export const buildThisAndFutureSchedulePatch = ({
  originalSessionDate = '',
  startTime = '',
  durationMinutes = 60,
} = {}) => ({
  sessionDate: originalSessionDate,
  startTime,
  durationMinutes,
})

export const seriesNeedsHorizonExtension = ({
  entry = {},
  todayKey = '',
  horizonWeeks = RECURRENCE_HORIZON_WEEKS,
  thresholdDays = HORIZON_EXTENSION_THRESHOLD_DAYS,
} = {}) => {
  if (String(entry.status ?? '') !== 'active') return false
  if (entry.endsOn && entry.endsOn < todayKey) return false

  const targetKey = computeHorizonExtensionTargetKey({
    todayKey,
    horizonWeeks,
    thresholdDays,
  })
  const materializedThrough = entry.materializedThrough ?? entry.materialized_through
  return !materializedThrough || materializedThrough < targetKey
}

export const seriesHasUnresolvedRecurrenceConflicts = ({
  entry = {},
  conflictRecords = [],
} = {}) =>
  (conflictRecords ?? []).some(
    (record) =>
      String(record.seriesId ?? record.recurrenceSeriesId ?? '') === String(entry.id ?? '') &&
      String(record.status ?? 'unresolved') === 'unresolved',
  )

export const identifySeriesForDailyRecurrenceWorker = ({
  series = [],
  sessions = [],
  conflictRecords = [],
  todayKey = '',
  horizonWeeks = RECURRENCE_HORIZON_WEEKS,
  thresholdDays = HORIZON_EXTENSION_THRESHOLD_DAYS,
} = {}) =>
  (series ?? []).filter((entry) => {
    if (String(entry.status ?? '') !== 'active') return false
    if (entry.endsOn && entry.endsOn < todayKey) return false

    const needsHorizon = seriesNeedsHorizonExtension({
      entry,
      todayKey,
      horizonWeeks,
      thresholdDays,
    })
    const needsConflictCheck = seriesHasUnresolvedRecurrenceConflicts({
      entry,
      conflictRecords,
    })

    if (!needsHorizon && !needsConflictCheck) return false

    if (entry.occurrenceLimit != null && needsHorizon) {
      const lifetimeSlots = countLifetimeOccurrenceSlots({
        sessions,
        conflictRecords,
        seriesId: entry.id,
      })
      if (lifetimeSlots >= Number(entry.occurrenceLimit)) return needsConflictCheck
    }

    return true
  })

export const identifySeriesNeedingHorizonExtension = ({
  series = [],
  sessions = [],
  conflictRecords = [],
  todayKey = '',
  horizonWeeks = RECURRENCE_HORIZON_WEEKS,
  thresholdDays = HORIZON_EXTENSION_THRESHOLD_DAYS,
} = {}) =>
  identifySeriesForDailyRecurrenceWorker({
    series,
    sessions,
    conflictRecords,
    todayKey,
    horizonWeeks,
    thresholdDays,
  }).filter((entry) =>
    seriesNeedsHorizonExtension({
      entry,
      todayKey,
      horizonWeeks,
      thresholdDays,
    }),
  )

export const resolveConflictClientName = (session = {}) =>
  session.clientDisplayName ??
  session.clientName ??
  session.preferredName ??
  session.displayName ??
  'Another client'

export const preflightRecurrenceConflicts = ({
  coachId = '',
  callerCoachId = coachId,
  startsOn = '',
  startTime = '16:00',
  durationMinutes = 60,
  weekdays = [],
  scheduleTimezone = DEFAULT_COACH_SCHEDULE_TIMEZONE,
  endsOn = null,
  occurrenceLimit = null,
  horizonWeeks = RECURRENCE_HORIZON_WEEKS,
  effectiveFromDate = null,
  excludeSeriesId = null,
  existingSessions = [],
  existingConflictRecords = [],
} = {}) => {
  assertRecurrencePreflightCoachAccess({ callerCoachId, targetCoachId: coachId })

  const normalizedWeekdays = normalizeRecurrenceWeekdays(weekdays)
  const effectiveFrom = effectiveFromDate ?? startsOn

  let lifetimeSlotsConsumed = 0
  if (excludeSeriesId) {
    const priorDates = new Set()

    existingSessions
      .filter(
        (session) =>
          String(session.recurrenceSeriesId ?? session.recurrence_series_id ?? '') ===
            String(excludeSeriesId) &&
          String(
            session.recurrenceOccurrenceDate ??
              session.recurrence_occurrence_date ??
              session.sessionDate ??
              '',
          ) < String(effectiveFrom),
      )
      .forEach((session) => {
        priorDates.add(
          session.recurrenceOccurrenceDate ??
            session.recurrence_occurrence_date ??
            session.sessionDate,
        )
      })

    existingConflictRecords
      .filter(
        (record) =>
          String(record.seriesId ?? record.recurrenceSeriesId ?? '') ===
            String(excludeSeriesId) &&
          String(record.occurrenceDate ?? '') < String(effectiveFrom),
      )
      .forEach((record) => {
        priorDates.add(record.occurrenceDate)
      })

    lifetimeSlotsConsumed = priorDates.size
  }

  const dates = generateRecurrenceOccurrenceDates({
    startsOn: effectiveFrom,
    weekdays: normalizedWeekdays,
    endsOn,
    occurrenceLimit: null,
    horizonWeeks,
  }).filter((date) => date >= effectiveFrom)

  const conflicts = []
  let slotsSimulated = lifetimeSlotsConsumed
  let simulatedOccurrences = 0

  dates.forEach((occurrenceDate) => {
    slotsSimulated += 1
    if (occurrenceLimit && slotsSimulated > occurrenceLimit) {
      return
    }
    const instant = buildScheduleInstant({
      sessionDate: occurrenceDate,
      startTime,
      scheduleTimezone,
    })

    const candidate = {
      coachId,
      sessionDate: occurrenceDate,
      startTime,
      durationMinutes,
      startsAt: instant.startsAt,
      endsAt: new Date(
        new Date(instant.startsAt).getTime() + durationMinutes * 60 * 1000,
      ).toISOString(),
      status: 'scheduled',
    }

    const overlap = findOverlappingAppointment(
      candidate,
      (existingSessions ?? []).filter((session) => {
        if (String(session.status ?? '') !== 'scheduled') return false
        if (String(session.coachId ?? session.coach_id ?? '') !== String(coachId)) {
          return false
        }
        if (
          excludeSeriesId &&
          String(session.recurrenceSeriesId ?? session.recurrence_series_id ?? '') ===
            String(excludeSeriesId)
        ) {
          return false
        }
        return true
      }),
    )

    if (overlap) {
      conflicts.push({
        occurrenceDate,
        startTime,
        conflictingSessionId: overlap.id,
        conflictingClientName: resolveConflictClientName(overlap),
      })
    }

    simulatedOccurrences += 1
  })

  return {
    hasConflicts: conflicts.length > 0,
    conflicts,
    simulatedOccurrences,
    lifetimeSlotsConsumed,
  }
}
