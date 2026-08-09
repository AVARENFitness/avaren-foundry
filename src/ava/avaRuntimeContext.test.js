import { describe, expect, it } from 'vitest'
import { createAvaSession } from '../lib/avaConversation'
import {
  AVA_USER_ROLE,
  ATHLETE_AVA_CONTEXT_FALLBACK,
  buildAvaRuntimeContext,
  buildCoachAvaOpeningMessage,
  COACH_AVA_FALLBACK,
  COACH_AVA_PARTIAL_FALLBACK,
  isAthleteAvaFallbackMessage,
} from './avaRuntimeContext'

describe('avaRuntimeContext', () => {
  it('marks coach accounts as coach mode regardless of screen', () => {
    const context = buildAvaRuntimeContext({
      session: { user: { email: 'coach@avarenfitness.com' } },
      coachAuthorized: true,
      coachContext: { clients: [{ athlete_id: '1' }] },
    })

    expect(context.userRole).toBe(AVA_USER_ROLE.COACH)
    expect(context.coachMode).toBe(true)
    expect(context.athleteMode).toBe(false)
    expect(context.authorizedCoachClientCount).toBe(1)
  })

  it('tracks active client referent from session', () => {
    const session = createAvaSession()
    session.activeCoachContext = {
      athleteId: 'jake-1',
      clientName: 'Jake',
    }

    const context = buildAvaRuntimeContext({
      session,
      coachAuthorized: true,
      coachContext: { clients: [] },
    })

    expect(context.activeClientReferent).toEqual({
      athleteId: 'jake-1',
      clientName: 'Jake',
    })
  })

  it('defines coach fallback separate from athlete fallback', () => {
    expect(COACH_AVA_FALLBACK).toMatch(/clients, reviews, assignments/i)
    expect(COACH_AVA_PARTIAL_FALLBACK).toMatch(/performance data isn't available/i)
    expect(isAthleteAvaFallbackMessage(COACH_AVA_FALLBACK)).toBe(false)
    expect(isAthleteAvaFallbackMessage(ATHLETE_AVA_CONTEXT_FALLBACK)).toBe(true)
    expect(
      isAthleteAvaFallbackMessage(
        'I can help with Chest & Back, readiness, recovery, or nutrition. What do you want to figure out?',
      ),
    ).toBe(true)
  })

  it('buildCoachAvaOpeningMessage avoids athlete training fallback', () => {
    const opening = buildCoachAvaOpeningMessage({
      portfolioStatus: 'ready',
      clients: [{ athlete_id: '1' }],
    })

    expect(opening).not.toBe(ATHLETE_AVA_CONTEXT_FALLBACK)
    expect(opening).toMatch(/client/i)
  })
})
