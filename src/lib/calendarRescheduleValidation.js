import { calendarRepeatWindow } from './calendarRepeatWindow'

export const validateRescheduleInput = (draft = {}) => {
  const sessionDate = String(draft.sessionDate ?? '').trim()
  const startTime = String(draft.startTime ?? '').trim()
  const rawDuration = String(draft.durationMinutes ?? '').trim()
  const durationMinutes = Number(rawDuration)

  if (!rawDuration || !Number.isInteger(durationMinutes) || durationMinutes <= 0) {
    return { ok: false, message: 'Enter a valid appointment duration in whole minutes.' }
  }
  if (!calendarRepeatWindow({ sessionDate, startTime, durationMinutes })) {
    return { ok: false, message: 'Enter a valid appointment date and start time.' }
  }
  return { ok: true, sessionDate, startTime: startTime.slice(0, 5), durationMinutes }
}
