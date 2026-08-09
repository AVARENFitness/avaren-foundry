import { describe, expect, it, vi } from 'vitest'
import { runAvaMessagePipeline } from './avaMessagePipeline'
import { AVA_PIPELINE_KIND } from './avaPipelineOutcome'
import { createAvaSession } from '../lib/avaConversation'
import { buildBaseCoachAvaContext } from './coach/avaCoachRole'
import { buildClientRosterEntry } from '../lib/clientIntelligence'
import { getCoachWeekRange } from '../lib/weeklyReview'
import { COACH_AVA_FALLBACK } from './avaRuntimeContext'

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

const buildCoachContext = ({ isCoachMode = false } = {}) => {
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
    isCoachMode,
    rosterContext: {
      clients: [jake],
      rosterEntries,
      portfolio: { rosterEntries },
      portfolioStatus: 'ready',
    },
  })
}

describe('avaMessagePipeline coach context guard', () => {
  it('routes give me an update on Jake to coach summary, not athlete fallback', async () => {
    const session = createAvaSession()
    const coachContext = buildCoachContext({ isCoachMode: false })

    const outcome = await runAvaMessagePipeline({
      message: 'give me an update on Jake',
      nutrition: { goals: {}, days: {} },
      session,
      packet: { briefing: { headline: 'Chest + Back' } },
      coachContext,
      role: 'coach',
      actionRuntime: {
        isCoachRuntime: true,
        getCoachContext: () => coachContext,
        getSnapshot: () => ({
          coachHub: false,
          coachScreen: 'clients',
          profileOpen: false,
          weeklyReviewOpen: false,
        }),
      },
      routeMessage: vi.fn().mockResolvedValue({
        summary:
          'I can help with Chest & Back, readiness, recovery, or nutrition. What do you want to figure out?',
      }),
    })

    expect(outcome.kind).toBe(AVA_PIPELINE_KIND.COACH_RESULT)
    expect(outcome.message).not.toMatch(/Chest & Back/i)
    expect(outcome.message).toMatch(/check-in|trained|review|recovery/i)
  })

  it('uses coach fallback instead of athlete conversation when coach access is active', async () => {
    const session = createAvaSession()
    const coachContext = buildCoachContext({ isCoachMode: false })
    const routeMessage = vi.fn()

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
      routeMessage,
    })

    expect(outcome.message).toBe(COACH_AVA_FALLBACK)
    expect(routeMessage).not.toHaveBeenCalled()
  })
})
