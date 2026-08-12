import { act, renderHook } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { COACH_ACTIVE_MODE } from '../lib/coachModePersistence'
import { useNavigation } from './useNavigation'

describe('useNavigation coach hub routing', () => {
  beforeEach(() => {
    window.scrollTo = vi.fn()
    window.localStorage.clear()
  })

  it('routes the primary coach into Coach Hub', () => {
    const setCoachWorkspace = vi.fn((updater) =>
      updater({ role: 'athlete', modeEnabled: false }),
    )
    const session = {
      user: { email: 'hello@avarenfitness.com', id: 'owner-id' },
    }

    const { result } = renderHook(() =>
      useNavigation({
        session,
        setCoachWorkspace,
        coachAuthorized: false,
      }),
    )

    act(() => {
      result.current.enterCoachMode()
    })

    expect(result.current.screen).toBe('coach-hub')
    expect(setCoachWorkspace).toHaveBeenCalled()
  })

  it('does not route regular clients into Coach Hub', () => {
    const setCoachWorkspace = vi.fn()
    const session = {
      user: { email: 'athlete@example.com', id: 'athlete-id' },
    }

    const { result } = renderHook(() =>
      useNavigation({
        session,
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

  it('routes RPC-authorized coaches through enterCoachMode', () => {
    const setCoachWorkspace = vi.fn((updater) =>
      updater({ role: 'athlete', modeEnabled: false }),
    )
    const session = {
      user: { email: 'trainer@studio.com', id: 'coach-id' },
    }

    const { result } = renderHook(() =>
      useNavigation({
        session,
        setCoachWorkspace,
        coachAuthorized: true,
      }),
    )

    act(() => {
      result.current.enterCoachMode()
    })

    expect(result.current.screen).toBe('coach-hub')
  })

  it('persists coach mode when entering Coach Hub', () => {
    const setCoachWorkspace = vi.fn((updater) =>
      updater({ role: 'athlete', modeEnabled: false }),
    )
    const session = {
      user: { email: 'hello@avarenfitness.com', id: 'owner-id' },
    }

    const { result } = renderHook(() =>
      useNavigation({
        session,
        setCoachWorkspace,
        coachAuthorized: false,
      }),
    )

    act(() => {
      result.current.enterCoachMode()
    })

    expect(window.localStorage.getItem('avaren:last-mode:owner-id')).toBe(
      COACH_ACTIVE_MODE.COACH,
    )
  })

  it('persists athlete mode when exiting coach mode', () => {
    const setCoachWorkspace = vi.fn((updater) =>
      updater({ role: 'coach', modeEnabled: true }),
    )
    const session = {
      user: { email: 'hello@avarenfitness.com', id: 'owner-id' },
    }

    const { result } = renderHook(() =>
      useNavigation({
        session,
        setCoachWorkspace,
        coachAuthorized: false,
      }),
    )

    act(() => {
      result.current.exitCoachMode()
    })

    expect(window.localStorage.getItem('avaren:last-mode:owner-id')).toBe(
      COACH_ACTIVE_MODE.ATHLETE,
    )
    expect(result.current.screen).toBe('more')
  })
})
