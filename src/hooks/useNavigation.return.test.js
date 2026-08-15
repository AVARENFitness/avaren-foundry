import { describe, expect, it } from 'vitest'
import { normalizeAthleteReturnScreen } from './useNavigation'

describe('normalizeAthleteReturnScreen', () => {
  it('maps legacy schedule route to schedule tab', () => {
    expect(normalizeAthleteReturnScreen('in-person-schedule')).toBe('schedule')
  })

  it('falls back to home for coach hub', () => {
    expect(normalizeAthleteReturnScreen('coach-hub')).toBe('home')
  })

  it('preserves nutrition as the Food tab return destination', () => {
    expect(normalizeAthleteReturnScreen('nutrition')).toBe('nutrition')
  })

  it('maps Account overlay to home for coach return capture', () => {
    expect(normalizeAthleteReturnScreen('more')).toBe('home')
  })

  it('15. preserves schedule for coach return capture', () => {
    expect(normalizeAthleteReturnScreen('schedule')).toBe('schedule')
  })
})
