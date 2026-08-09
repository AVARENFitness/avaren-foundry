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
  formatClientSummaryMessage,
  hasWeeklyAthleteCheckIn,
  queryClientsMissingCheckIn,
  queryClientsNeedingAttention,
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

const buildCoachContext = ({
  clients = [sarah, john, mike],
  athleteStatesById = {},
} = {}) => {
  const rosterEntries = clients.map((client) =>
    buildEntry(client, athleteStatesById[client.athlete_id] ?? null),
  )

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
    })

    expect(hasWeeklyAthleteCheckIn(mikeStateCheckedIn, now)).toBe(true)
    expect(hasWeeklyAthleteCheckIn(sarahStateMissingCheckIn, now)).toBe(false)

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

    const sarahItem = result.items.find((item) => item.athleteId === 'sarah-1')
    expect(sarahItem.reason).toMatch(/check-in is still missing/i)

    const johnItem = result.items.find((item) => item.athleteId === 'john-1')
    expect(johnItem.reason).toMatch(/recovery has been lower recently/i)
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
    expect(message.toLowerCase()).toMatch(/check-in/)
    expect(message.toLowerCase()).toMatch(/trained/)
  })

  it('returns an all-good empty state when everyone checked in', () => {
    const coachContext = buildCoachContext({
      clients: [mike],
      athleteStatesById: { 'mike-1': mikeStateCheckedIn },
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
})
