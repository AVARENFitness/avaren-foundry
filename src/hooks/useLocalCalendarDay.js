import { useEffect, useState } from 'react'
import {
  localCalendarDateKey,
  msUntilNextLocalMidnight,
} from '../lib/localCalendarDay'

/**
 * Tracks the athlete's local calendar day and refreshes at local midnight
 * so open-app daily state recomputes without a reload.
 */
export function useLocalCalendarDay(now = new Date()) {
  const [dayKey, setDayKey] = useState(() => localCalendarDateKey(now))

  useEffect(() => {
    const sync = () => {
      setDayKey(localCalendarDateKey())
    }

    sync()
    const timer = window.setTimeout(sync, msUntilNextLocalMidnight() + 50)
    return () => window.clearTimeout(timer)
  }, [dayKey])

  return dayKey
}
