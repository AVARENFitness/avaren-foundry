import { describe, expect, it } from 'vitest'
import {
  COACH_SCREENS,
  buildViewForLegacyScreen,
  isLegacyCoachScreen,
  normalizeCoachScreen,
} from './coachNavigation'

describe('coachNavigation', () => {
  it('normalizes legacy coach screens to the Build and More destinations', () => {
    expect(normalizeCoachScreen('assignments')).toBe(COACH_SCREENS.BUILD)
    expect(normalizeCoachScreen('programs')).toBe(COACH_SCREENS.BUILD)
    expect(normalizeCoachScreen('settings')).toBe(COACH_SCREENS.MORE)
    expect(normalizeCoachScreen('today')).toBe(COACH_SCREENS.TODAY)
  })

  it('maps legacy build screens to build sub-views', () => {
    expect(buildViewForLegacyScreen('assignments')).toBe('workouts')
    expect(buildViewForLegacyScreen('programs')).toBe('programs')
    expect(buildViewForLegacyScreen('build')).toBe('home')
  })

  it('detects legacy coach screen ids', () => {
    expect(isLegacyCoachScreen('assignments')).toBe(true)
    expect(isLegacyCoachScreen('build')).toBe(false)
  })
})
