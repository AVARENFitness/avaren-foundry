import { act, renderHook } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { COACH_ACTIVE_MODE } from '../lib/coachModePersistence'
import { useNavigation } from './useNavigation'

const session = {
  user: { email: 'hello@avarenfitness.com', id: 'owner-id' },
}

const renderNav = (coachAuthorized = false) => {
  const setCoachWorkspace = vi.fn((updater) =>
    updater({ role: 'athlete', modeEnabled: false }),
  )

  return {
    setCoachWorkspace,
    ...renderHook(() =>
      useNavigation({
        session,
        setCoachWorkspace,
        coachAuthorized,
      }),
    ),
  }
}

describe('useNavigation coach hub routing', () => {
  beforeEach(() => {
    window.scrollTo = vi.fn()
    window.localStorage.clear()
  })

  it('routes the primary coach into Coach Hub', () => {
    const { result } = renderNav()

    act(() => {
      result.current.enterCoachMode()
    })

    expect(result.current.screen).toBe('coach-hub')
  })

  it('does not route regular clients into Coach Hub', () => {
    const setCoachWorkspace = vi.fn()
    const athleteSession = {
      user: { email: 'athlete@example.com', id: 'athlete-id' },
    }

    const { result } = renderHook(() =>
      useNavigation({
        session: athleteSession,
        setCoachWorkspace,
        coachAuthorized: false,
      }),
    )

    act(() => {
      result.current.enterCoachMode()
    })

    expect(result.current.screen).toBe('home')
    expect(setCoachWorkspace).not.toHaveBeenCalled()
  })

  it('persists coach mode when entering Coach Hub', () => {
    const { result } = renderNav()

    act(() => {
      result.current.enterCoachMode()
    })

    expect(window.localStorage.getItem('avaren:last-mode:owner-id')).toBe(
      COACH_ACTIVE_MODE.COACH,
    )
  })

  it('returns to the prior athlete screen when exiting coach mode', () => {
    const { result } = renderNav()

    act(() => {
      result.current.setScreen('train')
    })

    act(() => {
      result.current.enterCoachMode()
    })

    act(() => {
      result.current.exitCoachMode()
    })

    expect(result.current.screen).toBe('train')
  })

  it.each([
    ['train', 'train'],
    ['schedule', 'schedule'],
    ['in-person-schedule', 'schedule'],
    ['progress', 'progress'],
  ])('Home → Coach → Athlete returns %s', (startScreen, expected) => {
    const { result } = renderNav()

    act(() => {
      result.current.setScreen(startScreen)
    })

    act(() => {
      result.current.enterCoachMode()
    })

    act(() => {
      result.current.exitCoachMode()
    })

    expect(result.current.screen).toBe(expected)
  })

  it('defaults to home when no prior athlete destination was captured', () => {
    const { result } = renderNav()

    act(() => {
      result.current.exitCoachMode()
    })

    expect(result.current.screen).toBe('home')
  })

  it('returns to home when coach was entered from Account overlay', () => {
    const { result } = renderNav()

    act(() => {
      result.current.setScreen('more')
    })

    act(() => {
      result.current.enterCoachMode()
    })

    act(() => {
      result.current.exitCoachMode()
    })

    expect(result.current.screen).toBe('home')
  })

  it('14. Food → Coach → Athlete returns Food', () => {
    const { result } = renderNav()

    act(() => {
      result.current.setScreen('nutrition')
    })

    act(() => {
      result.current.enterCoachMode()
    })

    act(() => {
      result.current.exitCoachMode()
    })

    expect(result.current.screen).toBe('nutrition')
  })

  it('persists athlete mode when exiting coach mode', () => {
    const { result } = renderNav()

    act(() => {
      result.current.exitCoachMode()
    })

    expect(window.localStorage.getItem('avaren:last-mode:owner-id')).toBe(
      COACH_ACTIVE_MODE.ATHLETE,
    )
  })
})
