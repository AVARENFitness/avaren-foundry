import { describe, expect, it } from 'vitest'
import { normalizeAthleteReturnScreen } from './useNavigation'

describe('normalizeAthleteReturnScreen', () => {
  it('maps legacy schedule route to schedule tab', () => {
    expect(normalizeAthleteReturnScreen('in-person-schedule')).toBe('schedule')
  })

  it('falls back to home for coach hub', () => {
    expect(normalizeAthleteReturnScreen('coach-hub')).toBe('home')
  })
})
