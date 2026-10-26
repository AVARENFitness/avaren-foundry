// Normalize a calendar item for repeat-batch overlap checks.
// An invalid or missing window fails closed before any write.
export const calendarRepeatWindow = (item) => {
  const date = String(item?.sessionDate ?? item?.eventDate ?? '')
  const time = String(item?.startTime ?? '').slice(0, 5)
  const duration = Number(item?.durationMinutes)

  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) ||
      !/^([01]\d|2[0-3]):[0-5]\d$/.test(time) ||
      !Number.isFinite(duration) || duration <= 0) return null

  const [year, month, day] = date.split('-').map(Number)
  const check = new Date(Date.UTC(year, month - 1, day))
  if (check.getUTCFullYear() !== year ||
      check.getUTCMonth() !== month - 1 ||
      check.getUTCDate() !== day) return null

  const [hour, minute] = time.split(':').map(Number)
  return { date, start: hour * 60 + minute, end: hour * 60 + minute + duration }
}
