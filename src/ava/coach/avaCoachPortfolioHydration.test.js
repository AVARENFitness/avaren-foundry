import { beforeEach, describe, expect, it, vi } from 'vitest'
import { getCoachWeekRange } from '../../lib/weeklyReview'
import { buildClientRosterEntry } from '../../lib/clientIntelligence'
import { AVA_ACTION_IDS } from '../actions/avaActionTypes'
import { resetAvaActionIdempotency } from '../actions/avaActionExecutor'
import { createAvaSession } from '../../lib/avaConversation'
import { runAvaMessagePipeline } from '../avaMessagePipeline'
import { AVA_PIPELINE_KIND } from '../avaPipelineOutcome'
import { buildBaseCoachAvaContext } from './avaCoachRole'
import {
  buildCoachPortfolioBundle,
  invalidateCoachPortfolioCache,
  publishCoachPortfolioBundle,
} from '../../lib/coachPortfolioService'
import { coachBackend } from '../../lib/coachBackend'
import { isCoachOperationalQuery } from './avaCoachQueryPatterns'
import { runCoachPipelineStep } from './avaCoachPipeline'

vi.mock('../../lib/coachBackend', () => ({
  coachBackend: {
    listClientsWithIdentity: vi.fn(),
    listCoachAssignments: vi.fn(),
    listAthleteFoundryStates: vi.fn(),
    listAthleteNutritionSnapshots: vi.fn(),
    listCoachWeeklyReviews: vi.fn(),
    listCoachClientFollowUps: vi.fn(),
  },
}))

vi.mock('../../lib/weeklyCheckInBackend', () => ({
  weeklyCheckInBackend: {
    listCoachWeeklyCheckIns: vi.fn(),
  },
}))

import { weeklyCheckInBackend } from '../../lib/weeklyCheckInBackend'

const now = new Date('2026-08-07T12:00:00.000Z')
const weekRange = getCoachWeekRange(now)

const submittedWeeklyCheckIn = (athleteId) => ({
  athleteId,
  weekStart: weekRange.weekStart,
  weekEnd: weekRange.weekEnd,
  status: 'submitted',
  trainingRating: 4,
  recoveryRating: 4,
  nutritionRating: 4,
  submittedAt: `${weekRange.weekStart}T12:00:00.000Z`,
})

const jake = {
  athlete_id: 'jake-1',
  athlete_email: 'jacobcorell2218@gmail.com',
  coach_label: 'Jake',
  profile: {
    first_name: 'Jacob',
    last_name: 'Corell',
    preferred_name: 'Jacob',
    display_name: '',
  },
  created_at: '2026-01-01T12:00:00.000Z',
}

const sarah = {
  athlete_id: 'sarah-1',
  athlete_email: 'sarah.jones@example.com',
  created_at: '2026-01-01T12:00:00.000Z',
}

const jakeStateMissingCheckIn = {
  readiness: { entries: [] },
  history: [{ id: 'j1', date: weekRange.weekStart, name: 'Upper', sets: [] }],
}

const sarahStateCheckedIn = {
  readiness: {
    entries: [
      {
        id: 's1',
        date: weekRange.weekStart,
        sleep: 2,
        energy: 2,
        soreness: 4,
        stress: 4,
      },
    ],
  },
  history: [{ id: 's1', date: weekRange.weekStart, name: 'Lower', sets: [] }],
}

const buildFreshCoachContext = () =>
  buildBaseCoachAvaContext({
    session: { user: { email: 'coach@avarenfitness.com' } },
    coachAuthorized: true,
    isCoachMode: false,
    rosterContext: {
      clients: [],
      rosterEntries: [],
      portfolio: null,
    },
  })

const mockPortfolioLoad = () => {
  const clients = [jake, sarah]
  const assignments = []
  const athleteStatesById = {
    'jake-1': jakeStateMissingCheckIn,
    'sarah-1': sarahStateCheckedIn,
  }

  coachBackend.listClientsWithIdentity.mockResolvedValue(clients)
  coachBackend.listCoachAssignments.mockResolvedValue(assignments)
  coachBackend.listAthleteFoundryStates.mockResolvedValue(athleteStatesById)
  coachBackend.listAthleteNutritionSnapshots.mockResolvedValue({})
  coachBackend.listCoachWeeklyReviews.mockResolvedValue([])
  coachBackend.listCoachClientFollowUps.mockResolvedValue([])
  weeklyCheckInBackend.listCoachWeeklyCheckIns.mockResolvedValue({
    'sarah-1': submittedWeeklyCheckIn('sarah-1'),
  })

  return buildCoachPortfolioBundle({
    clients,
    assignments,
    athleteStatesById,
    nutritionByAthleteId: {},
    weeklyReviewsByAthleteId: {},
    weeklyCheckInsByAthleteId: {
      'sarah-1': submittedWeeklyCheckIn('sarah-1'),
    },
  })
}

describe('ava coach portfolio hydration 7.9.9', () => {
  beforeEach(() => {
    resetAvaActionIdempotency()
    invalidateCoachPortfolioCache()
    vi.clearAllMocks()
  })

  it('matches who\'s contraction for recovery queries', () => {
    expect(isCoachOperationalQuery("Who's having recovery issues?")).toBe(true)
  })

  it('hydrates portfolio on fresh load for missing check-in query', async () => {
    mockPortfolioLoad()
    const coachContext = buildFreshCoachContext()

    const outcome = await runCoachPipelineStep({
      message: "Who hasn't checked in?",
      session: createAvaSession(),
      coachContext,
      actionRuntime: {
        getCoachContext: () => coachContext,
        getSnapshot: () => ({}),
      },
    })

    expect(coachBackend.listClientsWithIdentity).toHaveBeenCalled()
    expect(coachBackend.listAthleteFoundryStates).toHaveBeenCalled()
    expect(outcome.kind).toBe(AVA_PIPELINE_KIND.COACH_RESULT)
    expect(outcome.coachResults?.[0]?.clientName).toBe('Jake')
  })

  it('hydrates portfolio for recovery query without coach hub preload', async () => {
    const bundle = mockPortfolioLoad()
    const sarahEntry = bundle.rosterEntries.find(
      (entry) => entry.client.athlete_id === 'sarah-1',
    )
    sarahEntry.intelligence.readiness = {
      available: true,
      trend: 'Below recent baseline',
      detail: 'Recent readiness is lower than the prior two-week average.',
      score: 42,
      status: 'Manage load',
    }
    sarahEntry.intelligence.attention = [
      {
        id: 'readiness-low',
        title: 'Readiness is below baseline',
        description: 'Recent readiness is lower than the prior two-week average.',
        severity: 'watch',
      },
    ]
    publishCoachPortfolioBundle(bundle)

    const coachContext = buildFreshCoachContext()

    const outcome = await runCoachPipelineStep({
      message: "Who's having recovery issues?",
      session: createAvaSession(),
      coachContext,
      actionRuntime: { getCoachContext: () => coachContext, getSnapshot: () => ({}) },
    })

    expect(outcome.kind).toBe(AVA_PIPELINE_KIND.COACH_RESULT)
    expect(outcome.message.toLowerCase()).toMatch(/sarah/)
  })

  it('returns operational failure when portfolio fetch fails', async () => {
    invalidateCoachPortfolioCache()
    coachBackend.listClientsWithIdentity.mockRejectedValue(new Error('network down'))
    const coachContext = buildFreshCoachContext()

    const outcome = await runCoachPipelineStep({
      message: "Who hasn't checked in?",
      session: createAvaSession(),
      coachContext,
    })

    expect(outcome.kind).toBe(AVA_PIPELINE_KIND.RESPONSE)
    expect(outcome.message).toMatch(/couldn't load your client check-ins/i)
  })

  it('returns all-clear after fresh hydration when everyone checked in', async () => {
    coachBackend.listClientsWithIdentity.mockResolvedValue([sarah])
    coachBackend.listCoachAssignments.mockResolvedValue([])
    coachBackend.listAthleteFoundryStates.mockResolvedValue({
      'sarah-1': sarahStateCheckedIn,
    })
    coachBackend.listAthleteNutritionSnapshots.mockResolvedValue({})
    coachBackend.listCoachWeeklyReviews.mockResolvedValue([])
  coachBackend.listCoachClientFollowUps.mockResolvedValue([])
    weeklyCheckInBackend.listCoachWeeklyCheckIns.mockResolvedValue({
      'sarah-1': submittedWeeklyCheckIn('sarah-1'),
    })

    const coachContext = buildFreshCoachContext()
    const outcome = await runCoachPipelineStep({
      message: "Who hasn't checked in?",
      session: createAvaSession(),
      coachContext,
    })

    expect(outcome.kind).toBe(AVA_PIPELINE_KIND.COACH_RESULT)
    expect(outcome.message).toMatch(/everyone is checked in/i)
  })
})
