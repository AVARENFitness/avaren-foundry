import { describe, expect, it } from 'vitest'
import {
  buildClientRosterStatus,
  buildClientWins,
  buildCoachPortfolioIntelligence,
  CLIENT_ROSTER_STATUS,
  COACH_CLIENT_SORT,
  rankClientAttention,
  sortCoachClients,
} from './clientIntelligence'

const client = (id, email, createdAt = '2026-01-01T12:00:00.000Z') => ({
  id: `client-${id}`,
  athlete_id: id,
  athlete_email: email,
  created_at: createdAt,
})

const completedAssignment = (athleteId, overrides = {}) => ({
  id: `a-${athleteId}-${overrides.completed_at ?? '1'}`,
  athlete_id: athleteId,
  title: overrides.title ?? 'Push Day',
  status: 'completed',
  completed_at: overrides.completed_at ?? '2026-08-06T18:00:00.000Z',
  due_date: '2026-08-06',
  completion_summary: {
    durationMinutes: 58,
    volume: 12400,
    sets: 18,
    exercises: 5,
  },
  ...overrides,
})

describe('coach portfolio intelligence', () => {
  it('handles a coach with zero clients', () => {
    const portfolio = buildCoachPortfolioIntelligence({
      clients: [],
      assignments: [],
    })

    expect(portfolio.hero.activeClients).toBe(0)
    expect(portfolio.attentionQueue).toEqual([])
    expect(portfolio.rosterEntries).toEqual([])
    expect(portfolio.wins).toEqual([])
  })

  it('summarizes multiple healthy active clients', () => {
    const clients = [
      client('1', 'sarah@example.com'),
      client('2', 'marcus@example.com'),
    ]
    const assignments = [
      completedAssignment('1', { completed_at: '2026-08-05T18:00:00.000Z' }),
      completedAssignment('2', {
        completed_at: '2026-08-06T18:00:00.000Z',
        title: 'Lower A',
      }),
    ]

    const portfolio = buildCoachPortfolioIntelligence({
      clients,
      assignments,
      now: new Date('2026-08-07T12:00:00.000Z'),
    })

    expect(portfolio.hero.activeClients).toBe(2)
    expect(portfolio.hero.trainedThisWeek).toBeGreaterThan(0)
    expect(portfolio.rosterEntries.every((entry) => entry.clientName)).toBe(true)
  })

  it('ranks attention items with inactivity highest', () => {
    const inactiveClient = client('inactive', 'inactive@example.com')
    const activeClient = client('active', 'active@example.com')
    const assignments = [
      completedAssignment('inactive', {
        completed_at: '2026-07-25T18:00:00.000Z',
      }),
      completedAssignment('active', {
        completed_at: '2026-08-06T18:00:00.000Z',
      }),
      {
        id: 'open-1',
        athlete_id: 'active',
        title: 'Upper A',
        status: 'assigned',
        due_date: '2026-08-08',
      },
    ]

    const portfolio = buildCoachPortfolioIntelligence({
      clients: [inactiveClient, activeClient],
      assignments,
      now: new Date('2026-08-07T12:00:00.000Z'),
    })

    const ranked = rankClientAttention(
      portfolio.rosterEntries.map((entry) => ({
        client: entry.client,
        intelligence: entry.intelligence,
      })),
    )

    expect(ranked[0].client.athlete_id).toBe('inactive')
    expect(ranked[0].priority).toBeGreaterThan(ranked[1]?.priority ?? 0)
  })

  it('marks inactive clients and incomplete assignments', () => {
    const rosterClient = client('1', 'jacob@example.com')
    const assignments = [
      completedAssignment('1', {
        completed_at: '2026-07-20T18:00:00.000Z',
      }),
      {
        id: 'open-1',
        athlete_id: '1',
        title: 'Lower A',
        status: 'assigned',
        due_date: '2026-08-05',
      },
    ]

    const portfolio = buildCoachPortfolioIntelligence({
      clients: [rosterClient],
      assignments,
      now: new Date('2026-08-07T12:00:00.000Z'),
    })

    expect(portfolio.rosterEntries[0].status).toBe(
      CLIENT_ROSTER_STATUS.INACTIVE,
    )
    expect(
      portfolio.attentionQueue.some((item) => item.item.id === 'inactive'),
    ).toBe(true)
    expect(
      portfolio.attentionQueue.some(
        (item) =>
          item.item.id === 'open-assignment' ||
          item.item.id === 'overdue-assignment',
      ),
    ).toBe(true)
  })

  it('surfaces low-readiness clients when athlete state is available', () => {
    const rosterClient = client('1', 'marcus@example.com')
    const athleteStatesById = {
      '1': {
        readiness: {
          entries: [
            {
              id: 'r1',
              date: '2026-08-07',
              sleep: 2,
              energy: 2,
              soreness: 4,
              stress: 4,
              completedAt: '2026-08-07T08:00:00.000Z',
            },
            {
              id: 'r0',
              date: '2026-08-06',
              sleep: 4,
              energy: 4,
              soreness: 2,
              stress: 2,
              completedAt: '2026-08-06T08:00:00.000Z',
            },
          ],
        },
        history: [],
      },
    }

    const portfolio = buildCoachPortfolioIntelligence({
      clients: [rosterClient],
      assignments: [],
      athleteStatesById,
      now: new Date('2026-08-07T12:00:00.000Z'),
    })

    expect(portfolio.rosterEntries[0].status).toBe(
      CLIENT_ROSTER_STATUS.RECOVERY_PRIORITY,
    )
  })

  it('builds recent client wins from performance signals', () => {
    const rosterClient = client('1', 'sarah@example.com')
    const athleteStatesById = {
      '1': {
        history: [
          {
            id: 's1',
            name: 'Push',
            date: '2026-07-20',
            finishedAt: '2026-07-20T18:00:00.000Z',
            sets: [
              { exercise: 'Bench Press', weight: 175, reps: 5, estimatedOneRepMax: 204 },
            ],
          },
          {
            id: 's2',
            name: 'Push',
            date: '2026-07-27',
            finishedAt: '2026-07-27T18:00:00.000Z',
            sets: [
              { exercise: 'Bench Press', weight: 185, reps: 5, estimatedOneRepMax: 216 },
            ],
          },
          {
            id: 's3',
            name: 'Push',
            date: '2026-08-03',
            finishedAt: '2026-08-03T18:00:00.000Z',
            sets: [
              { exercise: 'Bench Press', weight: 195, reps: 5, estimatedOneRepMax: 228 },
            ],
          },
        ],
      },
    }

    const portfolio = buildCoachPortfolioIntelligence({
      clients: [rosterClient],
      assignments: [],
      athleteStatesById,
      now: new Date('2026-08-07T12:00:00.000Z'),
    })

    expect(portfolio.wins.length).toBeGreaterThan(0)
    expect(buildClientWins(portfolio.rosterEntries)[0].clientName).toBe('Sarah')
  })

  it('sorts clients by attention by default', () => {
    const entries = [
      {
        clientName: 'Alpha',
        sortScore: 10,
        attentionCount: 0,
        client: client('a', 'alpha@example.com'),
        intelligence: { assignmentStatus: { active: null } },
      },
      {
        clientName: 'Beta',
        sortScore: 90,
        attentionCount: 2,
        client: client('b', 'beta@example.com'),
        intelligence: { assignmentStatus: { active: { title: 'Lower' } } },
      },
    ]

    const sorted = sortCoachClients(entries, COACH_CLIENT_SORT.NEEDS_ATTENTION)
    expect(sorted[0].clientName).toBe('Beta')
  })

  it('does not expose nutrition activity when sharing is disabled', () => {
    const rosterClient = client('1', 'emily@example.com')
    const portfolio = buildCoachPortfolioIntelligence({
      clients: [rosterClient],
      assignments: [],
      nutritionByAthleteId: {
        '1': { profile: { coach_access: false, goals: {} }, days: [] },
      },
    })

    expect(
      portfolio.activityFeed.every((event) => event.type !== 'nutrition'),
    ).toBe(true)
  })

  it('derives new client status for recently connected athletes', () => {
    const status = buildClientRosterStatus({
      client: client('1', 'new@example.com', '2026-08-01T12:00:00.000Z'),
      history: [],
      assignments: [],
      readiness: null,
      attention: [],
      now: new Date('2026-08-07T12:00:00.000Z'),
    })

    expect(status).toBe(CLIENT_ROSTER_STATUS.NEW_CLIENT)
  })
})
