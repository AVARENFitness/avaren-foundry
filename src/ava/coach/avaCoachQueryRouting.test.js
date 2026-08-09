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
  isCoachOperationalQuery,
  matchCoachOperationalQuery,
  normalizeCoachQueryText,
} from './avaCoachQueryPatterns'
import { resolveCoachExplicitCommand } from './avaCoachResolver'
import { runCoachPipelineStep } from './avaCoachPipeline'
import { invalidateCoachPortfolioCache } from '../../lib/coachPortfolioService'
import { coachBackend } from '../../lib/coachBackend'

vi.mock('../../lib/coachBackend', () => ({
  coachBackend: {
    listClientsWithIdentity: vi.fn(),
    listCoachAssignments: vi.fn(),
    listAthleteFoundryStates: vi.fn(),
    listAthleteNutritionSnapshots: vi.fn(),
    listCoachWeeklyReviews: vi.fn(),
  },
}))

const now = new Date('2026-08-07T12:00:00.000Z')
const weekRange = getCoachWeekRange(now)

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

const buildCoachContext = ({
  clients = [jake, sarah],
  athleteStatesById = {},
} = {}) => {
  const rosterEntries = clients.map((client) => ({
    ...buildClientRosterEntry({
      client,
      assignments: [],
      athleteState: athleteStatesById[client.athlete_id] ?? null,
      nutritionProfile: null,
      nutritionDays: [],
      now,
    }),
    weeklyReviewStatus: 'REVIEWED',
  }))

  return buildBaseCoachAvaContext({
    session: { user: { email: 'coach@avarenfitness.com' } },
    coachAuthorized: true,
    isCoachMode: false,
    rosterContext: {
      clients,
      rosterEntries,
      portfolio: { rosterEntries },
      athleteStatesById,
    },
  })
}

const createCoachRuntime = (coachContext) => ({
  isCoachRuntime: true,
  enterCoachHub: vi.fn(),
  openClientProfile: vi.fn(),
  getSnapshot: () => ({
    coachHub: false,
    coachScreen: 'clients',
    selectedClientId: null,
    profileOpen: false,
    weeklyReviewOpen: false,
  }),
  getCoachContext: () => coachContext,
})

describe('ava coach query routing 7.9.8', () => {
  beforeEach(() => {
    resetAvaActionIdempotency()
    invalidateCoachPortfolioCache()
    vi.clearAllMocks()
  })

  it('matches recovery and check-in phrases with normalized intent', () => {
    expect(isCoachOperationalQuery("Who hasn't checked in?")).toBe(true)
    expect(isCoachOperationalQuery('Who has not checked in?')).toBe(true)
    expect(isCoachOperationalQuery("Who hasn't checked in this week?")).toBe(true)
    expect(isCoachOperationalQuery('Who is having recovery issues?')).toBe(true)
    expect(isCoachOperationalQuery('Who has recovery issues?')).toBe(true)

    expect(matchCoachOperationalQuery('Who is having recovery issues?')?.actionId).toBe(
      AVA_ACTION_IDS.SHOW_RECOVERY_CONCERNS,
    )
    expect(matchCoachOperationalQuery("Who hasn't checked in?")?.actionId).toBe(
      AVA_ACTION_IDS.SHOW_CLIENTS_MISSING_CHECKIN,
    )
  })

  it('normalizes curly apostrophes for check-in matching', () => {
    const curly = 'Who hasn\u2019t checked in?'
    expect(normalizeCoachQueryText(curly)).toBe('who has not checked in')
    expect(isCoachOperationalQuery(curly)).toBe(true)
  })

  it('routes missing check-in through pipeline without model fallback', async () => {
    const coachContext = buildCoachContext({
      athleteStatesById: {
        'jake-1': jakeStateMissingCheckIn,
        'sarah-1': sarahStateCheckedIn,
      },
    })

    const outcome = await runAvaMessagePipeline({
      message: "Who hasn't checked in?",
      nutrition: { goals: {}, days: {} },
      session: createAvaSession(),
      packet: null,
      coachContext,
      role: 'coach',
      actionRuntime: createCoachRuntime(coachContext),
      routeMessage: vi.fn(),
    })

    expect(outcome.kind).toBe(AVA_PIPELINE_KIND.COACH_RESULT)
    expect(outcome.message.toLowerCase()).toMatch(/jake/)
    expect(outcome.message.toLowerCase()).not.toMatch(/privacy/)
    expect(outcome.coachResults).toHaveLength(1)
    expect(outcome.coachResults[0].clientName).toBe('Jake')
  })

  it('routes recovery issues through pipeline for Sarah only', async () => {
    const coachContext = buildCoachContext({
      athleteStatesById: {
        'jake-1': jakeStateMissingCheckIn,
        'sarah-1': sarahStateCheckedIn,
      },
    })

    const sarahEntry = coachContext.rosterEntries.find(
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

    const outcome = await runAvaMessagePipeline({
      message: 'Who is having recovery issues?',
      nutrition: { goals: {}, days: {} },
      session: createAvaSession(),
      packet: null,
      coachContext,
      role: 'coach',
      actionRuntime: createCoachRuntime(coachContext),
      routeMessage: vi.fn(),
    })

    expect(outcome.kind).toBe(AVA_PIPELINE_KIND.COACH_RESULT)
    expect(outcome.message).toMatch(/Sarah Jones stands out on recovery/i)
    expect(outcome.coachResults).toHaveLength(1)
    expect(outcome.coachResults[0].clientName).toMatch(/Sarah/)
  })

  it('preserves attention query routing outside coach hub', async () => {
    const coachContext = buildCoachContext({
      clients: [jake],
      athleteStatesById: { 'jake-1': jakeStateMissingCheckIn },
    })

    const outcome = await runCoachPipelineStep({
      message: 'Who needs my attention today?',
      session: createAvaSession(),
      coachContext,
      actionRuntime: createCoachRuntime(coachContext),
    })

    expect(outcome.kind).toBe(AVA_PIPELINE_KIND.COACH_RESULT)
    expect(resolveCoachExplicitCommand('Who needs my attention today?', {
      coachContext,
    }).actionId).toBe(AVA_ACTION_IDS.SHOW_CLIENTS_NEEDING_ATTENTION)
  })

  it('denies coach portfolio queries for athletes before model conversation', async () => {
    const routeMessage = vi.fn()
    const outcome = await runAvaMessagePipeline({
      message: "Who hasn't checked in?",
      nutrition: { goals: {}, days: {} },
      session: createAvaSession(),
      packet: null,
      coachContext: buildBaseCoachAvaContext({
        session: { user: { email: 'athlete@example.com' } },
        coachAuthorized: false,
        isCoachMode: false,
      }),
      role: 'athlete',
      actionRuntime: {},
      routeMessage,
    })

    expect(outcome.kind).toBe(AVA_PIPELINE_KIND.RESPONSE)
    expect(outcome.message).toMatch(/isn't available on this account/i)
    expect(routeMessage).not.toHaveBeenCalled()
  })

  it('returns truthful load failure when portfolio fetch fails without coach hub', async () => {
    invalidateCoachPortfolioCache()
    coachBackend.listClientsWithIdentity.mockRejectedValue(new Error('network down'))
    const coachContext = buildBaseCoachAvaContext({
      session: { user: { email: 'coach@avarenfitness.com' } },
      coachAuthorized: true,
      isCoachMode: false,
      rosterContext: {
        clients: [jake],
        rosterEntries: [],
        portfolio: null,
      },
    })

    const outcome = await runCoachPipelineStep({
      message: "Who hasn't checked in?",
      session: createAvaSession(),
      coachContext,
      actionRuntime: createCoachRuntime(coachContext),
    })

    expect(outcome.kind).toBe(AVA_PIPELINE_KIND.RESPONSE)
    expect(outcome.message.toLowerCase()).toMatch(/couldn't load/)
  })
})
