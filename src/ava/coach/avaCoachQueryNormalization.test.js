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
import { invalidateCoachPortfolioCache } from '../../lib/coachPortfolioService'
import { coachBackend } from '../../lib/coachBackend'

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

const buildCoachContext = ({
  clients = [jake, sarah],
  athleteStatesById = {},
  weeklyCheckInsByAthleteId = {
    'sarah-1': submittedWeeklyCheckIn('sarah-1'),
  },
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
      weeklyCheckInsByAthleteId,
      portfolioStatus: 'ready',
      portfolioLoadedAt: Date.now(),
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

const mockPortfolioBackend = () => {
  coachBackend.listClientsWithIdentity.mockResolvedValue([jake, sarah])
  coachBackend.listCoachAssignments.mockResolvedValue([])
  coachBackend.listAthleteFoundryStates.mockResolvedValue({
    'jake-1': jakeStateMissingCheckIn,
    'sarah-1': sarahStateCheckedIn,
  })
  coachBackend.listAthleteNutritionSnapshots.mockResolvedValue({})
  coachBackend.listCoachWeeklyReviews.mockResolvedValue([])
  coachBackend.listCoachClientFollowUps.mockResolvedValue([])
  weeklyCheckInBackend.listCoachWeeklyCheckIns.mockResolvedValue({
    'sarah-1': submittedWeeklyCheckIn('sarah-1'),
  })
}

describe('ava coach query normalization 7.9.10', () => {
  beforeEach(() => {
    resetAvaActionIdempotency()
    invalidateCoachPortfolioCache()
    vi.clearAllMocks()
  })

  it('traces exact live failure inputs to deterministic intents', () => {
    const checkIn = 'who hasnt checked in?'
    const recovery = 'whos having recovery issues'

    expect(normalizeCoachQueryText(checkIn)).toBe('who has not checked in')
    expect(normalizeCoachQueryText(recovery)).toBe('who is having recovery issues')

    const checkInMatch = matchCoachOperationalQuery(checkIn)
    const recoveryMatch = matchCoachOperationalQuery(recovery)

    expect(checkInMatch?.actionId).toBe(AVA_ACTION_IDS.SHOW_CLIENTS_MISSING_CHECKIN)
    expect(recoveryMatch?.actionId).toBe(AVA_ACTION_IDS.SHOW_RECOVERY_CONCERNS)
    expect(isCoachOperationalQuery(checkIn)).toBe(true)
    expect(isCoachOperationalQuery(recovery)).toBe(true)
  })

  it('normalizes punctuation and apostrophe variants equivalently', () => {
    const checkInVariants = [
      "WHO HASN'T CHECKED IN?!",
      'who hasnt checked in',
      'Who hasn\u2019t checked in?',
      ' who   hasnt checked in? ',
    ]
    const recoveryVariants = [
      "who's having recovery issues?",
      'whos having recovery issues',
      'Who is having recovery issues?',
      'whos having recovery issues???',
      "Who's having recovery issues?",
    ]

    const checkInNormalized = checkInVariants.map(normalizeCoachQueryText)
    expect(new Set(checkInNormalized).size).toBe(1)
    expect(checkInNormalized[0]).toBe('who has not checked in')

    const recoveryNormalized = recoveryVariants.map(normalizeCoachQueryText)
    expect(new Set(recoveryNormalized).size).toBe(1)
    expect(recoveryNormalized[0]).toBe('who is having recovery issues')

    checkInVariants.forEach((message) => {
      expect(matchCoachOperationalQuery(message)?.actionId).toBe(
        AVA_ACTION_IDS.SHOW_CLIENTS_MISSING_CHECKIN,
      )
    })
    recoveryVariants.forEach((message) => {
      expect(matchCoachOperationalQuery(message)?.actionId).toBe(
        AVA_ACTION_IDS.SHOW_RECOVERY_CONCERNS,
      )
    })
  })

  it('maps check-in intent family phrases', () => {
    const phrases = [
      "who hasn't checked in?",
      'who hasnt checked in?',
      'who has not checked in?',
      'who still needs to check in?',
      'show missing check ins',
      'show missing check-ins',
      'anyone missing their check in?',
      'who still owes me a checkin?',
    ]

    phrases.forEach((message) => {
      expect(matchCoachOperationalQuery(message)?.actionId).toBe(
        AVA_ACTION_IDS.SHOW_CLIENTS_MISSING_CHECKIN,
      )
    })
  })

  it('maps recovery intent family phrases', () => {
    const phrases = [
      "who's having recovery issues?",
      'whos having recovery issues',
      'who is having recovery issues',
      'who has recovery issues',
      'who has low recovery?',
      'any recovery concerns?',
      'show me recovery concerns',
      'anyone struggling with recovery?',
    ]

    phrases.forEach((message) => {
      expect(matchCoachOperationalQuery(message)?.actionId).toBe(
        AVA_ACTION_IDS.SHOW_RECOVERY_CONCERNS,
      )
    })
  })

  it('maps attention intent family phrases', () => {
    const phrases = [
      'who needs my attention?',
      'who needs attention?',
      'who needs my attention today',
      'anyone i need to check on?',
      'who should i follow up with?',
      'what clients need me today?',
    ]

    phrases.forEach((message) => {
      expect(matchCoachOperationalQuery(message)?.actionId).toBe(
        AVA_ACTION_IDS.SHOW_CLIENTS_NEEDING_ATTENTION,
      )
    })
  })

  it('maps weekly review intent family phrases', () => {
    const phrases = [
      'who do i need to review?',
      'who still needs reviewed?',
      'what reviews are open?',
      'show unfinished reviews',
      'any reviews left?',
    ]

    phrases.forEach((message) => {
      expect(matchCoachOperationalQuery(message)?.actionId).toBe(
        AVA_ACTION_IDS.OPEN_WEEKLY_REVIEWS,
      )
    })
  })

  it('maps training intent family phrases', () => {
    const phrases = [
      'who hasnt trained?',
      "who hasn't trained?",
      'who is behind on training?',
      'any training concerns?',
      'who missed training?',
      'show training concerns',
    ]

    phrases.forEach((message) => {
      expect(matchCoachOperationalQuery(message)?.actionId).toBe(
        AVA_ACTION_IDS.SHOW_TRAINING_CONCERNS,
      )
    })
  })

  it('rejects self-referential athlete phrasing', () => {
    expect(isCoachOperationalQuery("I haven't checked in today")).toBe(false)
    expect(isCoachOperationalQuery('I havent checked in today')).toBe(false)
    expect(isCoachOperationalQuery('My recovery is having issues')).toBe(false)
    expect(matchCoachOperationalQuery("I haven't checked in today")).toBeNull()
  })

  it('routes exact check-in string through pipeline without model fallback', async () => {
    mockPortfolioBackend()
    const coachContext = buildCoachContext({
      athleteStatesById: {
        'jake-1': jakeStateMissingCheckIn,
        'sarah-1': sarahStateCheckedIn,
      },
    })

    const routeMessage = vi.fn()
    const outcome = await runAvaMessagePipeline({
      message: 'who hasnt checked in?',
      nutrition: { goals: {}, days: {} },
      session: createAvaSession(),
      packet: null,
      coachContext,
      role: 'coach',
      actionRuntime: createCoachRuntime(coachContext),
      routeMessage,
    })

    expect(outcome.kind).toBe(AVA_PIPELINE_KIND.COACH_RESULT)
    expect(outcome.message.toLowerCase()).toMatch(/jake/)
    expect(outcome.message.toLowerCase()).not.toMatch(/privacy/)
    expect(routeMessage).not.toHaveBeenCalled()
  })

  it('routes exact recovery string through pipeline without model fallback', async () => {
    mockPortfolioBackend()
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

    const routeMessage = vi.fn()
    const outcome = await runAvaMessagePipeline({
      message: 'whos having recovery issues',
      nutrition: { goals: {}, days: {} },
      session: createAvaSession(),
      packet: null,
      coachContext,
      role: 'coach',
      actionRuntime: createCoachRuntime(coachContext),
      routeMessage,
    })

    expect(outcome.kind).toBe(AVA_PIPELINE_KIND.COACH_RESULT)
    expect(outcome.message).toMatch(/Sarah Jones stands out on recovery/i)
    expect(routeMessage).not.toHaveBeenCalled()
  })

  it('hydrates portfolio for exact check-in when coach hub was not opened', async () => {
    mockPortfolioBackend()
    const coachContext = buildBaseCoachAvaContext({
      session: { user: { email: 'coach@avarenfitness.com' } },
      coachAuthorized: true,
      isCoachMode: false,
      rosterContext: {
        clients: [],
        rosterEntries: [],
        portfolio: null,
      },
    })

    const routeMessage = vi.fn()
    const outcome = await runAvaMessagePipeline({
      message: 'who hasnt checked in?',
      nutrition: { goals: {}, days: {} },
      session: createAvaSession(),
      packet: null,
      coachContext,
      role: 'coach',
      actionRuntime: createCoachRuntime(coachContext),
      routeMessage,
    })

    expect(coachBackend.listClientsWithIdentity).toHaveBeenCalled()
    expect(outcome.kind).toBe(AVA_PIPELINE_KIND.COACH_RESULT)
    expect(outcome.coachResults?.[0]?.clientName).toBe('Jake')
    expect(routeMessage).not.toHaveBeenCalled()
  })

  it('never falls through to model when portfolio load fails', async () => {
    coachBackend.listClientsWithIdentity.mockRejectedValue(new Error('network down'))
    const coachContext = buildBaseCoachAvaContext({
      session: { user: { email: 'coach@avarenfitness.com' } },
      coachAuthorized: true,
      isCoachMode: false,
      rosterContext: {
        clients: [],
        rosterEntries: [],
        portfolio: null,
      },
    })

    const routeMessage = vi.fn()
    const outcome = await runAvaMessagePipeline({
      message: 'whos having recovery issues',
      nutrition: { goals: {}, days: {} },
      session: createAvaSession(),
      packet: null,
      coachContext,
      role: 'coach',
      actionRuntime: createCoachRuntime(coachContext),
      routeMessage,
    })

    expect(outcome.kind).toBe(AVA_PIPELINE_KIND.RESPONSE)
    expect(outcome.message.toLowerCase()).toMatch(/couldn't load/)
    expect(routeMessage).not.toHaveBeenCalled()
  })
})
