import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useLocalCalendarDay } from './useLocalCalendarDay'
import { localCalendarDateKey } from '../lib/localCalendarDay'

describe('useLocalCalendarDay', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('recomputes when the app stays open across local midnight', () => {
    const beforeMidnight = new Date('2026-08-14T23:59:30')
    vi.setSystemTime(beforeMidnight)

    const { result } = renderHook(() => useLocalCalendarDay(beforeMidnight))
    expect(result.current).toBe(localCalendarDateKey(beforeMidnight))

    act(() => {
      vi.advanceTimersByTime(60_000)
    })

    expect(result.current).toBe(localCalendarDateKey(new Date('2026-08-15T00:00:30')))
  })
})
