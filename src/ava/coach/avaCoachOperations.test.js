import { beforeEach, describe, expect, it, vi } from 'vitest'
import { getCoachWeekRange } from '../../lib/weeklyReview'
import { buildClientRosterEntry } from '../../lib/clientIntelligence'
import { createAvaSession } from '../../lib/avaConversation'
import { AVA_ACTION_IDS } from '../actions/avaActionTypes'
import { executeAvaAction, resetAvaActionIdempotency } from '../actions/avaActionExecutor'
import { resolveModelProposedAction } from '../actions/avaActionResolver'
import { runAvaMessagePipeline } from '../avaMessagePipeline'
import { AVA_PIPELINE_KIND } from '../avaPipelineOutcome'
import {
  matchCoachClientsByName,
  resolveCoachClientByName,
} from './avaCoachClientResolver'
import {
  resolveCoachExplicitCommand,
  resolveCoachReferentCommand,
} from './avaCoachResolver'
import {
  buildClientSummaryFacts,
  explainClientAttention,
  formatClientSummaryMessage,
  hasWeeklyAthleteCheckIn,
  queryClientsMissingCheckIn,
  queryClientsNeedingAttention,
  queryRecoveryConcerns,
  queryWeeklyReviews,
} from './avaCoachQueries'
import { setSessionActiveCoachContext } from './avaCoachContext'
import { runCoachPipelineStep } from './avaCoachPipeline'

const now = new Date('2026-08-07T12:00:00.000Z')
const weekRange = getCoachWeekRange(now)

const sarah = {
  athlete_id: 'sarah-1',
  athlete_email: 'sarah.jones@example.com',
  created_at: '2026-01-01T12:00:00.000Z',
}

const sarahTwo = {
  athlete_id: 'sarah-2',
  athlete_email: 'sarah.smith@example.com',
  created_at: '2026-01-01T12:00:00.000Z',
}

const john = {
  athlete_id: 'john-1',
  athlete_email: 'john.doe@example.com',
  created_at: '2026-01-01T12:00:00.000Z',
}

const mike = {
  athlete_id: 'mike-1',
  athlete_email: 'mike.brown@example.com',
  created_at: '2026-01-01T12:00:00.000Z',
}

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

const mia = {
  athlete_id: 'mia-1',
  athlete_email: 'mia.chen@example.com',
  created_at: '2026-01-01T12:00:00.000Z',
}

const unauthorized = {
  athlete_id: 'other-coach-client',
  athlete_email: 'other@example.com',
  created_at: '2026-01-01T12:00:00.000Z',
}

const sarahStateMissingCheckIn = {
  readiness: { entries: [] },
  history: [{ id: 's1', date: weekRange.weekStart, name: 'Upper', sets: [] }],
}

const mikeStateCheckedIn = {
  readiness: {
    entries: [
      {
        id: 'm1',
        date: weekRange.weekStart,
        sleep: 4,
        energy: 4,
        soreness: 2,
        stress: 2,
      },
    ],
  },
  history: [{ id: 'm1', date: weekRange.weekStart, name: 'Lower', sets: [] }],
}

const johnRecoveryState = {
  readiness: {
    entries: [
      { id: 'j-old-1', date: '2026-07-28', sleep: 4, energy: 4, soreness: 2, stress: 2 },
      { id: 'j-old-2', date: '2026-07-30', sleep: 4, energy: 4, soreness: 2, stress: 2 },
      { id: 'j-old-3', date: '2026-08-01', sleep: 4, energy: 4, soreness: 2, stress: 2 },
      { id: 'j-now', date: weekRange.weekStart, sleep: 2, energy: 2, soreness: 4, stress: 4 },
    ],
  },
  history: [{ id: 'j1', date: weekRange.weekStart, name: 'Push', sets: [] }],
}

const buildEntry = (client, athleteState, extra = {}) =>
  buildClientRosterEntry({
    client,
    assignments: [],
    athleteState,
    nutritionProfile: null,
    nutritionDays: [],
    now,
    ...extra,
  })

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
  clients = [sarah, john, mike],
  athleteStatesById = {},
  weeklyCheckInsByAthleteId = {},
  weeklyReviewsByAthleteId = {},
  weeklyReviewStatusById = {},
} = {}) => {
  const rosterEntries = clients.map((client) => {
    const entry = buildEntry(client, athleteStatesById[client.athlete_id] ?? null)
    return {
      ...entry,
      weeklyReviewStatus:
        weeklyReviewStatusById[client.athlete_id] ??
        (weeklyReviewsByAthleteId[client.athlete_id]
          ? 'REVIEWED'
          : entry.weeklyReviewStatus),
    }
  })

  return {
    isCoachMode: true,
    authorized: true,
    clients,
    rosterEntries,
    portfolio: {
      rosterEntries,
      reviewQueue: rosterEntries.filter((entry) => entry.weeklyReviewStatus === 'REVIEW DUE'),
    },
    athleteStatesById,
    weeklyCheckInsByAthleteId,
    weeklyReviewsByAthleteId,
    portfolioStatus: 'ready',
    portfolioLoadedAt: Date.now(),
    coachScreen: 'clients',
  }
}

const createCoachRuntime = (coachContext, overrides = {}) => {
  const snapshot = {
    coachHub: true,
    coachScreen: 'clients',
    selectedClientId: null,
    weeklyReviewOpen: false,
    profileOpen: false,
  }

  return {
    isCoachRuntime: true,
    setCoachScreen: vi.fn((screen) => {
      snapshot.coachScreen = screen
    }),
    openClientProfile: vi.fn((client) => {
      snapshot.selectedClientId = client.athlete_id
      snapshot.profileOpen = true
      snapshot.weeklyReviewOpen = false
    }),
    openWeeklyReview: vi.fn((client) => {
      snapshot.selectedClientId = client.athlete_id
      snapshot.weeklyReviewOpen = true
      snapshot.profileOpen = false
    }),
    getSnapshot: () => snapshot,
    getCoachContext: () => coachContext,
    ...overrides,
  }
}

describe('ava coach operations', () => {
  beforeEach(() => {
    resetAvaActionIdempotency()
  })

  it('resolves a single authorized Sarah to OPEN_CLIENT_PROFILE', () => {
    const coachContext = buildCoachContext({ clients: [sarah, mike] })
    const resolution = resolveCoachExplicitCommand('Open Sarah.', { coachContext })

    expect(resolution.kind).toBe('navigation')
    expect(resolution.resolution.actionId).toBe(AVA_ACTION_IDS.OPEN_CLIENT_PROFILE)
    expect(resolution.resolution.meta.athleteId).toBe('sarah-1')
  })

  it('rejects unauthorized client execution attempts', async () => {
    const coachContext = buildCoachContext({ clients: [sarah] })
    const runtime = createCoachRuntime(coachContext)
    const session = createAvaSession()

    const result = await executeAvaAction({
      actionId: AVA_ACTION_IDS.OPEN_CLIENT_PROFILE,
      runtime,
      context: { athleteId: unauthorized.athlete_id, session },
      session,
    })

    expect(result.ok).toBe(false)
    expect(result.rejected).toBe(true)
    expect(runtime.openClientProfile).not.toHaveBeenCalled()
  })

  it('shows disambiguation when two authorized Sarah clients match', () => {
    const coachContext = buildCoachContext({ clients: [sarah, sarahTwo] })
    const resolution = resolveCoachClientByName('Sarah', coachContext.clients)

    expect(resolution.status).toBe('ambiguous')
    expect(resolution.matches).toHaveLength(2)

    const command = resolveCoachExplicitCommand('Open Sarah.', { coachContext })
    expect(command.kind).toBe('disambiguation')
    expect(command.choices).toHaveLength(2)
  })

  it('returns Sarah only for missing check-ins', () => {
    const coachContext = buildCoachContext({
      clients: [sarah, mike],
      athleteStatesById: {
        'sarah-1': sarahStateMissingCheckIn,
        'mike-1': mikeStateCheckedIn,
      },
      weeklyCheckInsByAthleteId: {
        'mike-1': submittedWeeklyCheckIn('mike-1'),
      },
    })

    expect(hasWeeklyAthleteCheckIn(submittedWeeklyCheckIn('mike-1'), now)).toBe(true)
    expect(hasWeeklyAthleteCheckIn(null, now)).toBe(false)

    const result = queryClientsMissingCheckIn(coachContext, now)
    expect(result.items).toHaveLength(1)
    expect(result.items[0].athleteId).toBe('sarah-1')
  })

  it('ranks Sarah and John for attention using deterministic evidence', () => {
    const coachContext = buildCoachContext({
      clients: [sarah, john, mike],
      athleteStatesById: {
        'sarah-1': sarahStateMissingCheckIn,
        'john-1': johnRecoveryState,
        'mike-1': mikeStateCheckedIn,
      },
      weeklyCheckInsByAthleteId: {
        'john-1': submittedWeeklyCheckIn('john-1'),
        'mike-1': submittedWeeklyCheckIn('mike-1'),
      },
    })

    const johnEntry = coachContext.rosterEntries.find(
      (entry) => entry.client.athlete_id === 'john-1',
    )
    johnEntry.intelligence.readiness = {
      available: true,
      trend: 'Below recent baseline',
      detail: 'Recent readiness is lower than the prior two-week average.',
      score: 42,
      status: 'Manage load',
    }
    johnEntry.intelligence.attention = [
      {
        id: 'readiness-low',
        title: 'Readiness is below baseline',
        description: 'Recent readiness is lower than the prior two-week average.',
        severity: 'watch',
        action: 'progress',
        actionLabel: 'View recovery',
      },
    ]

    const result = queryClientsNeedingAttention(coachContext, now)
    const athleteIds = result.items.map((item) => item.athleteId)

    expect(athleteIds).toContain('sarah-1')
    expect(athleteIds).toContain('john-1')
    expect(athleteIds).not.toContain('mike-1')
    expect(athleteIds.indexOf('john-1')).toBeLessThan(athleteIds.indexOf('sarah-1'))

    const sarahItem = result.items.find((item) => item.athleteId === 'sarah-1')
    expect(sarahItem.reason).toMatch(/hasn't submitted this week's check-in/i)

    const johnItem = result.items.find((item) => item.athleteId === 'john-1')
    expect(johnItem.reason).toMatch(/recovery concern/i)
  })

  it('resolves her review to the active coach client referent', () => {
    const coachContext = buildCoachContext({ clients: [sarah, mike] })
    const session = createAvaSession()

    setSessionActiveCoachContext(session, {
      athleteId: 'sarah-1',
      clientName: 'Sarah Jones',
    })

    const resolution = resolveCoachReferentCommand('Show me her review.', {
      coachContext,
      session,
    })

    expect(resolution.kind).toBe('navigation')
    expect(resolution.resolution.actionId).toBe(AVA_ACTION_IDS.OPEN_WEEKLY_REVIEWS)
    expect(resolution.resolution.meta.athleteId).toBe('sarah-1')
  })

  it('builds client summary from trusted fields only', () => {
    const entry = buildEntry(sarah, sarahStateMissingCheckIn)
    const facts = buildClientSummaryFacts({
      entry,
      coachContext: buildCoachContext({
        clients: [sarah],
        athleteStatesById: { 'sarah-1': sarahStateMissingCheckIn },
      }),
      now,
    })

    expect(facts.trainingSessionsThisWeek).toBeGreaterThan(0)
    expect(facts.missingWeeklyCheckIn).toBe(true)
    expect(facts).not.toHaveProperty('privateNotes')

    const message = formatClientSummaryMessage(facts)
    expect(message).toMatch(/check-in/i)
    expect(message).toMatch(/trained|sessions/i)
    expect(message.startsWith('•')).toBe(true)
  })

  it('returns an all-good empty state when everyone checked in', () => {
    const coachContext = buildCoachContext({
      clients: [mike],
      athleteStatesById: { 'mike-1': mikeStateCheckedIn },
      weeklyCheckInsByAthleteId: {
        'mike-1': submittedWeeklyCheckIn('mike-1'),
      },
    })

    const result = queryClientsMissingCheckIn(coachContext, now)
    expect(result.items).toHaveLength(0)
    expect(result.emptyMessage).toMatch(/checked in this week/i)
  })

  it('rejects coach-only model actions for athletes', () => {
    const resolution = resolveModelProposedAction(
      { id: AVA_ACTION_IDS.OPEN_COACH_HUB },
      { role: 'athlete' },
    )

    expect(resolution.rejected).toBe(true)
  })

  it('opens Sarah through the coach pipeline with verification', async () => {
    const coachContext = buildCoachContext({ clients: [sarah, mike] })
    const runtime = createCoachRuntime(coachContext)
    const session = createAvaSession()

    const outcome = await runCoachPipelineStep({
      message: 'Open Sarah.',
      session,
      coachContext,
      actionRuntime: runtime,
    })

    expect(outcome.kind).toBe(AVA_PIPELINE_KIND.ACTION_SUCCESS)
    expect(runtime.openClientProfile).toHaveBeenCalledWith(
      expect.objectContaining({ athlete_id: 'sarah-1' }),
    )
    expect(session.activeCoachContext?.athleteId).toBe('sarah-1')
  })

  it('does not route athlete nutrition commands through coach operations', async () => {
    const coachContext = buildCoachContext({ clients: [sarah] })
    const session = createAvaSession()

    const outcome = await runAvaMessagePipeline({
      message: 'Open nutrition',
      nutrition: { goals: {}, days: {} },
      session,
      packet: null,
      coachContext,
      role: 'coach',
      actionRuntime: createCoachRuntime(coachContext),
    })

    expect(outcome.kind).not.toBe(AVA_PIPELINE_KIND.COACH_RESULT)
  })

  it('matches client names within the authorized roster only', () => {
    const matches = matchCoachClientsByName('Sarah', [sarah, sarahTwo, unauthorized])
    expect(matches.map((client) => client.athlete_id)).toEqual(['sarah-1', 'sarah-2'])
  })

  it('prioritizes Sarah, Jake, then Mia for flagship attention query', () => {
    const sarahRecoveryState = {
      readiness: {
        entries: [
          { id: 's-old', date: '2026-07-28', sleep: 4, energy: 4, soreness: 2, stress: 2 },
          { id: 's-now', date: weekRange.weekStart, sleep: 2, energy: 2, soreness: 4, stress: 4 },
        ],
      },
      history: [{ id: 's1', date: weekRange.weekStart, name: 'Lower', sets: [] }],
    }
    const jakeState = {
      readiness: { entries: [] },
      history: [{ id: 'j1', date: weekRange.weekStart, name: 'Upper', sets: [] }],
    }
    const miaState = {
      readiness: {
        entries: [
          {
            id: 'm1',
            date: weekRange.weekStart,
            sleep: 4,
            energy: 4,
            soreness: 2,
            stress: 2,
          },
        ],
      },
      history: [{ id: 'm1', date: weekRange.weekStart, name: 'Push', sets: [] }],
    }

    const coachContext = buildCoachContext({
      clients: [sarah, jake, mia],
      athleteStatesById: {
        'sarah-1': sarahRecoveryState,
        'jake-1': jakeState,
        'mia-1': miaState,
      },
      weeklyCheckInsByAthleteId: {
        'sarah-1': submittedWeeklyCheckIn('sarah-1'),
        'mia-1': submittedWeeklyCheckIn('mia-1'),
      },
      weeklyReviewStatusById: {
        'sarah-1': 'REVIEWED',
        'jake-1': 'REVIEWED',
        'mia-1': 'REVIEW DUE',
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

    const result = queryClientsNeedingAttention(coachContext, now)
    expect(result.items.map((item) => item.athleteId)).toEqual([
      'sarah-1',
      'jake-1',
      'mia-1',
    ])
    expect(result.items[0].reason).toMatch(/recovery concern/i)
    expect(result.items[1].reason).toMatch(/hasn't submitted this week's check-in/i)
    expect(result.items[2].reason).toMatch(/review still open/i)
  })

  it('removes Jake from missing check-in after canonical submission', () => {
    const coachContext = buildCoachContext({
      clients: [jake],
      athleteStatesById: { 'jake-1': sarahStateMissingCheckIn },
    })

    let result = queryClientsMissingCheckIn(coachContext, now)
    expect(result.items.map((item) => item.athleteId)).toEqual(['jake-1'])

    const submittedContext = buildCoachContext({
      clients: [jake],
      athleteStatesById: { 'jake-1': sarahStateMissingCheckIn },
      weeklyCheckInsByAthleteId: {
        'jake-1': submittedWeeklyCheckIn('jake-1'),
      },
    })
    result = queryClientsMissingCheckIn(submittedContext, now)
    expect(result.items).toHaveLength(0)
    expect(result.emptyMessage).toMatch(/checked in this week/i)
  })

  it('returns only evidence-backed recovery concerns', () => {
    const coachContext = buildCoachContext({
      clients: [mike, john],
      athleteStatesById: {
        'mike-1': mikeStateCheckedIn,
        'john-1': johnRecoveryState,
      },
      weeklyCheckInsByAthleteId: {
        'john-1': submittedWeeklyCheckIn('john-1'),
        'mike-1': submittedWeeklyCheckIn('mike-1'),
      },
    })

    const johnEntry = coachContext.rosterEntries.find(
      (entry) => entry.client.athlete_id === 'john-1',
    )
    johnEntry.intelligence.readiness = {
      available: true,
      trend: 'Below recent baseline',
      detail: 'Recent readiness is lower than the prior two-week average.',
      score: 42,
      status: 'Manage load',
    }

    const result = queryRecoveryConcerns(coachContext, now)
    expect(result.items).toHaveLength(1)
    expect(result.items[0].athleteId).toBe('john-1')
  })

  it('returns only open weekly reviews', () => {
    const coachContext = buildCoachContext({
      clients: [sarah, mike],
      athleteStatesById: {
        'sarah-1': sarahStateMissingCheckIn,
        'mike-1': mikeStateCheckedIn,
      },
      weeklyCheckInsByAthleteId: {
        'mike-1': submittedWeeklyCheckIn('mike-1'),
      },
      weeklyReviewStatusById: {
        'sarah-1': 'REVIEW DUE',
        'mike-1': 'REVIEWED',
      },
    })

    const result = queryWeeklyReviews(coachContext, now)
    expect(result.items).toHaveLength(1)
    expect(result.items[0].athleteId).toBe('sarah-1')
  })

  it('keeps Jake scoped across quick update, review, and why follow-ups', () => {
    const coachContext = buildCoachContext({
      clients: [jake, mike],
      athleteStatesById: {
        'jake-1': sarahStateMissingCheckIn,
        'mike-1': mikeStateCheckedIn,
      },
      weeklyReviewStatusById: {
        'jake-1': 'REVIEW DUE',
        'mike-1': 'REVIEWED',
      },
    })
    const session = createAvaSession()

    setSessionActiveCoachContext(session, {
      athleteId: 'jake-1',
      clientName: 'Jake',
    })

    const reviewResolution = resolveCoachReferentCommand('Show me his review.', {
      coachContext,
      session,
    })
    expect(reviewResolution.resolution.meta.athleteId).toBe('jake-1')

    const directReview = resolveCoachExplicitCommand('show me jakes review', {
      coachContext,
      session,
    })
    expect(directReview.kind).toBe('navigation')
    expect(directReview.resolution.actionId).toBe(AVA_ACTION_IDS.OPEN_WEEKLY_REVIEWS)
    expect(directReview.resolution.meta.athleteId).toBe('jake-1')

    const whyMessage = explainClientAttention('jake-1', coachContext, now)
    expect(whyMessage.toLowerCase()).toMatch(/check-in|review/)

    const summaryEntry = coachContext.rosterEntries.find(
      (entry) => entry.client.athlete_id === 'jake-1',
    )
    const facts = buildClientSummaryFacts({ entry: summaryEntry, coachContext, now })
    expect(facts.clientName).toBe('Jake')
    expect(formatClientSummaryMessage(facts)).toMatch(/check-in|review/i)
  })

  it('opens Jake review through pipeline for direct possessive command', async () => {
    const coachContext = buildCoachContext({
      clients: [jake],
      athleteStatesById: { 'jake-1': sarahStateMissingCheckIn },
    })
    const snapshot = {
      coachHub: true,
      coachScreen: 'clients',
      selectedClientId: null,
      weeklyReviewOpen: false,
      profileOpen: false,
    }
    const openWeeklyReview = vi.fn((client) => {
      snapshot.selectedClientId = client.athlete_id
      snapshot.weeklyReviewOpen = true
      snapshot.profileOpen = false
    })
    const runtime = {
      isCoachRuntime: true,
      enterCoachHub: vi.fn(() => {
        snapshot.coachHub = true
      }),
      openClientProfile: vi.fn(),
      openWeeklyReview,
      getSnapshot: () => snapshot,
      getCoachContext: () => coachContext,
    }
    const session = createAvaSession()

    const outcome = await runCoachPipelineStep({
      message: 'show me jakes review',
      session,
      coachContext,
      actionRuntime: runtime,
    })

    expect(outcome.kind).toBe(AVA_PIPELINE_KIND.ACTION_SUCCESS)
    expect(openWeeklyReview).toHaveBeenCalledWith(
      expect.objectContaining({ athlete_id: 'jake-1' }),
    )
    expect(session.activeCoachContext?.athleteId).toBe('jake-1')
  })
})
