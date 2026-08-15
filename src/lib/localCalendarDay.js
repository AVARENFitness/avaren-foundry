/** Local calendar-day helpers — never use UTC date slices for athlete daily truth. */

export const localCalendarDateKey = (date = new Date()) => {
  const value = new Date(date)
  if (!Number.isFinite(value.getTime())) return ''

  const year = value.getFullYear()
  const month = String(value.getMonth() + 1).padStart(2, '0')
  const day = String(value.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

export const localStartOfDay = (date = new Date()) => {
  const value = new Date(date)
  value.setHours(0, 0, 0, 0)
  return value
}

export const localTomorrowDateKey = (date = new Date()) => {
  const tomorrow = localStartOfDay(date)
  tomorrow.setDate(tomorrow.getDate() + 1)
  return localCalendarDateKey(tomorrow)
}

export const localTomorrowLabel = (date = new Date()) => {
  const tomorrow = localStartOfDay(date)
  tomorrow.setDate(tomorrow.getDate() + 1)
  return tomorrow.toLocaleDateString([], {
    weekday: 'long',
    month: 'short',
    day: 'numeric',
  })
}

export const sessionLocalCalendarDateKey = (session) => {
  const finished =
    session?.finishedAt ??
    (session?.date ? `${session.date}T12:00:00` : null)

  if (!finished) return null

  return localCalendarDateKey(new Date(finished))
}

export const msUntilNextLocalMidnight = (date = new Date()) => {
  const next = localStartOfDay(date)
  next.setDate(next.getDate() + 1)
  return Math.max(0, next.getTime() - date.getTime())
}
