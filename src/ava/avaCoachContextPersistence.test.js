import { describe, expect, it, vi } from 'vitest'
import { createAvaSession } from '../lib/avaConversation'
import {
  ATHLETE_AVA_CONTEXT_FALLBACK,
  buildCoachAvaOpeningMessage,
  buildCoachAvaFallbackMessage,
  COACH_AVA_PARTIAL_FALLBACK,
  preserveCoachSessionContext,
  restoreCoachSessionContext,
  isCoachAvaAccess,
} from './avaRuntimeContext'
import { buildBaseCoachAvaContext } from './coach/avaCoachRole'
import { COACH_PORTFOLIO_STATUS } from '../lib/coachPortfolioService'
import { runAvaMessagePipeline } from './avaMessagePipeline'
import { AVA_PIPELINE_KIND } from './avaPipelineOutcome'
import { buildClientRosterEntry } from '../lib/clientIntelligence'
import { getCoachWeekRange } from '../lib/weeklyReview'

describe('coach AVA context persistence', () => {
  const now = new Date('2026-08-07T12:00:00.000Z')
  const weekRange = getCoachWeekRange(now)

  const jake = {
    athlete_id: 'jake-1',
    athlete_email: 'jacob@example.com',
    coach_label: 'Jake',
    profile: {
      first_name: 'Jacob',
      last_name: 'Corell',
      preferred_name: 'Jacob',
      display_name: '',
    },
    created_at: '2026-01-01T12:00:00.000Z',
  }

  const buildReadyCoachContext = () => {
    const rosterEntries = [jake].map((client) =>
      buildClientRosterEntry({
        client,
        assignments: [],
        athleteState: {
          readiness: { entries: [] },
          history: [{ id: 'j1', date: weekRange.weekStart, name: 'Upper', sets: [] }],
        },
        nutritionProfile: null,
        nutritionDays: [],
        now,
      }),
    )

    return buildBaseCoachAvaContext({
      session: { user: { email: 'coach@avarenfitness.com' } },
      coachAuthorized: true,
      isCoachMode: true,
      rosterContext: {
        clients: [jake],
        rosterEntries,
        portfolio: { rosterEntries },
        portfolioStatus: COACH_PORTFOLIO_STATUS.READY,
      },
    })
  }

  it('preserves activeCoachContext when AVA session is reset on close', () => {
    const session = createAvaSession()
    session.activeCoachContext = {
      athleteId: 'jake-1',
      clientName: 'Jake',
    }

    const preserved = preserveCoachSessionContext(session)
    const nextSession = createAvaSession()

    expect(nextSession.activeCoachContext).toBeUndefined()
    restoreCoachSessionContext(nextSession, preserved)

    expect(nextSession.activeCoachContext).toEqual({
      athleteId: 'jake-1',
      clientName: 'Jake',
    })
  })

  it('buildCoachAvaOpeningMessage never returns athlete training fallback', () => {
    const ready = buildCoachAvaOpeningMessage(buildReadyCoachContext())
    const partial = buildCoachAvaOpeningMessage({
      portfolioStatus: COACH_PORTFOLIO_STATUS.PARTIAL,
      clients: [{ athlete_id: '1' }],
    })
    const error = buildCoachAvaOpeningMessage({
      portfolioStatus: COACH_PORTFOLIO_STATUS.ERROR,
      clients: [{ athlete_id: '1' }],
    })

    for (const message of [ready, partial, error]) {
      expect(message).not.toBe(ATHLETE_AVA_CONTEXT_FALLBACK)
      expect(message).not.toMatch(/full training context/i)
    }

    expect(error).toBe(COACH_AVA_PARTIAL_FALLBACK)
    expect(ready).toMatch(/1 client/i)
  })

  it('partial portfolio uses coach partial fallback, not athlete fallback', async () => {
    const session = createAvaSession()
    const coachContext = buildBaseCoachAvaContext({
      session: { user: { email: 'coach@avarenfitness.com' } },
      coachAuthorized: true,
      isCoachMode: true,
      rosterContext: {
        clients: [jake],
        portfolioStatus: COACH_PORTFOLIO_STATUS.PARTIAL,
      },
    })

    const outcome = await runAvaMessagePipeline({
      message: 'tell me something random about macros',
      nutrition: { goals: {}, days: {} },
      session,
      packet: {},
      coachContext,
      role: 'coach',
      actionRuntime: {
        isCoachRuntime: true,
        getCoachContext: () => coachContext,
        getSnapshot: () => ({ coachHub: false }),
      },
      routeMessage: () => Promise.resolve({ summary: 'athlete fallback' }),
    })

    expect(outcome.message).toBe(COACH_AVA_PARTIAL_FALLBACK)
    expect(outcome.message).not.toBe(ATHLETE_AVA_CONTEXT_FALLBACK)
  })

  it('ten mixed coach messages stay on coach path without athlete fallback', async () => {
    const session = createAvaSession()
    const coachContext = buildReadyCoachContext()
    const routeMessage = vi.fn()

    const messages = [
      'give me an update on Jake',
      'who needs my attention today?',
      "who hasn't checked in?",
      'show me jakes review',
      'show me his review',
      'who has recovery issues?',
      'open Jake',
      'show me my client list',
      'tell me about check-ins',
      'anything else for today?',
    ]

    for (const message of messages) {
      const outcome = await runAvaMessagePipeline({
        message,
        nutrition: { goals: {}, days: {} },
        session,
        packet: { briefing: { headline: 'Chest + Back' } },
        coachContext,
        role: 'coach',
        actionRuntime: {
          isCoachRuntime: true,
          getCoachContext: () => coachContext,
          getSnapshot: () => ({
            coachHub: true,
            coachScreen: 'clients',
            profileOpen: false,
            weeklyReviewOpen: false,
          }),
        },
        routeMessage,
      })

      expect(outcome.message).not.toBe(ATHLETE_AVA_CONTEXT_FALLBACK)
      expect(outcome.message).not.toMatch(/Chest & Back/i)
    }

    expect(routeMessage).not.toHaveBeenCalled()
  })

  it('isCoachAvaAccess detects coach role without athlete packet', () => {
    expect(isCoachAvaAccess({ role: 'coach', coachContext: null })).toBe(true)
    expect(
      isCoachAvaAccess({
        role: 'athlete',
        coachContext: { coachAccess: true, clients: [] },
      }),
    ).toBe(true)
    expect(isCoachAvaAccess({ role: 'athlete', coachContext: null })).toBe(false)
  })

  it('buildCoachAvaFallbackMessage respects portfolio status', () => {
    expect(buildCoachAvaFallbackMessage({ portfolioStatus: 'ready' })).toMatch(
      /clients, reviews, assignments/i,
    )
    expect(buildCoachAvaFallbackMessage({ portfolioStatus: 'partial' })).toBe(
      COACH_AVA_PARTIAL_FALLBACK,
    )
  })
})

describe('AvaSheet coach opening structure', () => {
  it('coach opening copy is distinct from athlete context fallback', () => {
    const coachOpening = buildCoachAvaOpeningMessage({
      portfolioStatus: 'ready',
      clients: [{ athlete_id: '1' }, { athlete_id: '2' }],
    })

    expect(coachOpening).toMatch(/2 clients/i)
    expect(coachOpening).not.toBe(ATHLETE_AVA_CONTEXT_FALLBACK)
  })
})
