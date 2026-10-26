import { findOverlappingAppointment } from './coachingAppointment'

export const hasFutureSeriesScheduleConflict = ({
  sessions = [],
  calendarItems = [],
  seriesId,
  effectiveDate,
  startTime,
  durationMinutes,
} = {}) => {
  if (!seriesId || !effectiveDate) return true

  const eligible = sessions.filter((item) =>
    String(item.recurrenceSeriesId ?? item.recurrence_series_id ?? '') === String(seriesId) &&
    String(item.sessionDate ?? '') >= String(effectiveDate) &&
    item.status === 'scheduled',
  )
  const otherItems = [...sessions, ...calendarItems].filter((item) =>
    String(item.recurrenceSeriesId ?? item.recurrence_series_id ?? '') !== String(seriesId),
  )

  return eligible.some((item) => Boolean(findOverlappingAppointment(
    { ...item, startTime, durationMinutes, status: 'scheduled' },
    otherItems,
  )))
}
