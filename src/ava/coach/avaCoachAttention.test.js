import { beforeEach, describe, expect, it, vi } from 'vitest'
import { getCoachWeekRange } from '../../lib/weeklyReview'
import { buildClientRosterEntry } from '../../lib/clientIntelligence'
import { AVA_ACTION_IDS } from '../actions/avaActionTypes'
import { resetAvaActionIdempotency } from '../actions/avaActionExecutor'
import { createAvaSession } from '../../lib/avaConversation'
import { runCoachPipelineStep } from './avaCoachPipeline'
import { AVA_PIPELINE_KIND } from '../avaPipelineOutcome'
import {
  ATTENTION_REASON_TYPES,
  buildCoachAttentionQueue,
  computeAttentionPriorityScore,
} from './avaCoachAttention'
import {
  explainClientAttention,
  queryClientsMissingCheckIn,
  queryClientsNeedingAttention,
} from './avaCoachQueries'
import {
  isCoachPortfolioQueryCommand,
  resolveCoachExplicitCommand,
} from './avaCoachResolver'

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

const mike = {
  athlete_id: 'mike-1',
  athlete_email: 'mike.brown@example.com',
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
  history: [{ id: 'm1', date: weekRange.weekStart, name: 'Push', sets: [] }],
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
  clients = [jake, sarah, mike],
  athleteStatesById = {},
  weeklyReviewStatusById = {},
  weeklyCheckInsByAthleteId = {},
} = {}) => {
  const rosterEntries = clients.map((client) => {
    const entry = buildEntry(
      client,
      athleteStatesById[client.athlete_id] ?? null,
    )
    return {
      ...entry,
      weeklyReviewStatus:
        weeklyReviewStatusById[client.athlete_id] ?? 'REVIEWED',
    }
  })

  return {
    isCoachMode: true,
    authorized: true,
    clients,
    rosterEntries,
    portfolio: { rosterEntries },
    athleteStatesById,
    weeklyCheckInsByAthleteId,
    portfolioStatus: 'ready',
    portfolioLoadedAt: Date.now(),
  }
}

describe('ava coach attention engine 7.9.7', () => {
  beforeEach(() => {
    resetAvaActionIdempotency()
  })

  it('returns Jake only for missing check-ins', () => {
    const coachContext = buildCoachContext({
      clients: [jake, sarah],
      athleteStatesById: {
        'jake-1': jakeStateMissingCheckIn,
        'sarah-1': sarahStateCheckedIn,
      },
      weeklyCheckInsByAthleteId: {
        'sarah-1': submittedWeeklyCheckIn('sarah-1'),
      },
    })

    const result = queryClientsMissingCheckIn(coachContext, now)
    expect(result.items).toHaveLength(1)
    expect(result.items[0].athleteId).toBe('jake-1')
    expect(result.items[0].clientName).toBe('Jake')
    expect(result.items[0].reason).toMatch(/hasn't submitted this week's check-in/i)
  })

  it('ranks Jake and Sarah for attention using deterministic evidence', () => {
    const coachContext = buildCoachContext({
      clients: [jake, sarah, mike],
      athleteStatesById: {
        'jake-1': jakeStateMissingCheckIn,
        'sarah-1': sarahStateCheckedIn,
        'mike-1': mikeStateCheckedIn,
      },
      weeklyCheckInsByAthleteId: {
        'sarah-1': submittedWeeklyCheckIn('sarah-1'),
        'mike-1': submittedWeeklyCheckIn('mike-1'),
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

    const { queue } = buildCoachAttentionQueue(coachContext, now)
    const athleteIds = queue.map((entry) => entry.athleteId)

    expect(athleteIds).toContain('jake-1')
    expect(athleteIds).toContain('sarah-1')
    expect(athleteIds).not.toContain('mike-1')

    const jakeEntry = queue.find((entry) => entry.athleteId === 'jake-1')
    expect(
      jakeEntry.reasons.some(
        (reason) => reason.type === ATTENTION_REASON_TYPES.MISSING_WEEKLY_CHECKIN,
      ),
    ).toBe(true)

    const sarahAttention = queue.find((entry) => entry.athleteId === 'sarah-1')
    expect(
      sarahAttention.reasons.some(
        (reason) => reason.type === ATTENTION_REASON_TYPES.RECOVERY_CONCERN,
      ),
    ).toBe(true)

    const attentionResult = queryClientsNeedingAttention(coachContext, now)
    expect(attentionResult.items.length).toBeGreaterThan(0)
    expect(attentionResult.items.length).toBeLessThanOrEqual(3)
    expect(attentionResult.totalCount).toBeGreaterThanOrEqual(2)
  })

  it('returns an all-good empty state when nobody needs attention', () => {
    const coachContext = buildCoachContext({
      clients: [mike],
      athleteStatesById: { 'mike-1': mikeStateCheckedIn },
      weeklyCheckInsByAthleteId: {
        'mike-1': submittedWeeklyCheckIn('mike-1'),
      },
    })

    const result = queryClientsNeedingAttention(coachContext, now)
    expect(result.items).toHaveLength(0)
    expect(result.emptyMessage).toMatch(/nothing urgent stands out/i)
  })

  it('does not flag recovery when readiness data is unavailable', () => {
    const coachContext = buildCoachContext({
      clients: [mike],
      athleteStatesById: { 'mike-1': mikeStateCheckedIn },
      weeklyCheckInsByAthleteId: {
        'mike-1': submittedWeeklyCheckIn('mike-1'),
      },
    })

    const entry = coachContext.rosterEntries[0]
    entry.intelligence.readiness = {
      available: false,
      shared: false,
      status: 'No readiness data',
      detail: 'No readiness check-ins logged yet.',
    }
    entry.intelligence.attention = entry.intelligence.attention.filter(
      (item) => item.id !== 'readiness-low',
    )

    const { queue, meta } = buildCoachAttentionQueue(coachContext, now)
    expect(
      queue.every((item) =>
        item.reasons.every(
          (reason) => reason.type !== ATTENTION_REASON_TYPES.RECOVERY_CONCERN,
        ),
      ),
    ).toBe(true)
    expect(meta.clientsMissingRecoveryData).toBe(1)
  })

  it('boosts priority when check-in and recovery concerns combine', () => {
    const score = computeAttentionPriorityScore([
      {
        type: ATTENTION_REASON_TYPES.MISSING_WEEKLY_CHECKIN,
        severity: 'high',
      },
      {
        type: ATTENTION_REASON_TYPES.RECOVERY_CONCERN,
        severity: 'medium',
      },
    ])

    expect(score).toBeGreaterThan(
      computeAttentionPriorityScore([
        {
          type: ATTENTION_REASON_TYPES.MISSING_WEEKLY_CHECKIN,
          severity: 'high',
        },
      ]),
    )
  })

  it('explains deterministic attention reasons for a named client', () => {
    const coachContext = buildCoachContext({
      clients: [jake],
      athleteStatesById: { 'jake-1': jakeStateMissingCheckIn },
      weeklyReviewStatusById: { 'jake-1': 'REVIEW DUE' },
    })

    const message = explainClientAttention('jake-1', coachContext, now)
    expect(message.toLowerCase()).toMatch(/check-in/)
    expect(message.toLowerCase()).toMatch(/review/)
  })

  it('opens Jake from an attention result through the coach pipeline', async () => {
    const coachContext = buildCoachContext({
      clients: [jake],
      athleteStatesById: { 'jake-1': jakeStateMissingCheckIn },
    })
    const openClientProfile = vi.fn()
    const runtime = {
      isCoachRuntime: true,
      enterCoachHub: vi.fn(),
      openClientProfile,
      getSnapshot: () => ({
        coachHub: true,
        coachScreen: 'clients',
        selectedClientId: null,
        profileOpen: false,
        weeklyReviewOpen: false,
      }),
      getCoachContext: () => coachContext,
    }

    const resolution = resolveCoachExplicitCommand('Who needs my attention today?', {
      coachContext,
    })
    expect(resolution.kind).toBe('query')
    expect(resolution.actionId).toBe(AVA_ACTION_IDS.SHOW_CLIENTS_NEEDING_ATTENTION)

    const outcome = await runCoachPipelineStep({
      message: 'Who needs my attention today?',
      session: createAvaSession(),
      coachContext,
      actionRuntime: runtime,
    })

    expect(outcome.kind).toBe(AVA_PIPELINE_KIND.COACH_RESULT)
    expect(outcome.coachResults?.[0]?.clientName).toBe('Jake')

    await runtime.openClientProfile(jake)
    expect(openClientProfile).toHaveBeenCalledWith(
      expect.objectContaining({ athlete_id: 'jake-1' }),
    )
  })

  it('routes expanded attention and check-in phrases deterministically', () => {
    expect(isCoachPortfolioQueryCommand('Who should I follow up with?')).toBe(true)
    expect(isCoachPortfolioQueryCommand('What do I need to handle today?')).toBe(
      true,
    )
    expect(isCoachPortfolioQueryCommand("Who hasn't checked in?")).toBe(true)
    expect(isCoachPortfolioQueryCommand('Who do I still need to review?')).toBe(
      true,
    )
  })
})
