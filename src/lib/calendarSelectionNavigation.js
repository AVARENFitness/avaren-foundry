import { addDaysKey } from './appointmentScheduling'

// Keep the focused day aligned with the visible period on both calendars.
export const shiftCalendarSelectionMonth = (dayKey, delta) => {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(dayKey ?? ''))
  if (!match || !Number.isInteger(delta)) return dayKey
  const [, yearText, monthText, dayText] = match
  const year = Number(yearText)
  const monthIndex = Number(monthText) - 1
  const day = Number(dayText)
  if (monthIndex < 0 || monthIndex > 11 || day < 1 || day > new Date(year, monthIndex + 1, 0).getDate()) return dayKey
  const targetFirst = new Date(year, monthIndex + delta, 1, 12)
  const lastDay = new Date(targetFirst.getFullYear(), targetFirst.getMonth() + 1, 0).getDate()
  const targetDay = Math.min(day, lastDay)
  return [targetFirst.getFullYear(), String(targetFirst.getMonth() + 1).padStart(2, '0'), String(targetDay).padStart(2, '0')].join('-')
}

export const shiftCalendarSelectionWeek = (dayKey, delta) =>
  addDaysKey(dayKey, delta * 7)
