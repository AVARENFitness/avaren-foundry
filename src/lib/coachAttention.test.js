import { describe, expect, it } from 'vitest'
import {
  COACH_ATTENTION_CATEGORY,
  getCoachAttentionItems,
  shouldFlagLowSessionBalance,
  shouldFlagNoNextAppointment,
} from './coachAttention'
import { BUSINESS_CLIENT_STATUS } from './coachBusinessClient'
import { SCHEDULED_SESSION_STATUS } from './coachScheduledSessions'

const activeClient = {
  id: 'biz-1',
  business_client_id: 'biz-1',
  athlete_id: 'athlete-1',
  status: BUSINESS_CLIENT_STATUS.ACTIVE,
  display_name: 'Sarah',
}

const archivedClient = {
  id: 'biz-2',
  business_client_id: 'biz-2',
  athlete_id: 'athlete-2',
  status: BUSINESS_CLIENT_STATUS.ARCHIVED,
  display_name: 'Past Client',
}

const inactiveClient = {
  id: 'biz-3',
  business_client_id: 'biz-3',
  athlete_id: 'athlete-3',
  status: 'ended',
  display_name: 'Ended Client',
}

describe('coachAttention signal quality', () => {
  it('surfaces active client with genuine pain/recovery follow-up', () => {
    const result = getCoachAttentionItems({
      rosterEntries: [{ client: activeClient, clientName: 'Sarah' }],
      upcomingByBusinessClientId: { 'biz-1': { id: 'appt-1' } },
      passSummaryByBusinessClientId: {},
      recentMissedByBusinessClientId: {},
      lastCompletedByBusinessClientId: {},
      coachFollowUpsByAthleteId: {
        'athlete-1': [
          {
            reasonType: 'PAIN_OR_DISCOMFORT',
            summary: 'Shoulder pain during pressing',
            status: 'open',
          },
        ],
      },
      portfolioStatus: 'ready',
    })

    expect(result.items[0]?.category).toBe(
      COACH_ATTENTION_CATEGORY.PAIN_OR_DISCOMFORT,
    )
  })

  it('surfaces recent missed appointment', () => {
    const now = new Date('2026-09-06T12:00:00.000Z')
    const result = getCoachAttentionItems(
      {
        rosterEntries: [{ client: activeClient, clientName: 'Sarah' }],
        upcomingByBusinessClientId: {},
        passSummaryByBusinessClientId: {},
        recentMissedByBusinessClientId: {
          'biz-1': {
            status: SCHEDULED_SESSION_STATUS.MISSED,
            sessionDate: '2026-09-04',
          },
        },
        lastCompletedByBusinessClientId: {
          'biz-1': {
            status: SCHEDULED_SESSION_STATUS.COMPLETED,
            sessionDate: '2026-08-20',
          },
        },
        coachFollowUpsByAthleteId: {},
        portfolioStatus: 'ready',
      },
      now,
    )

    expect(
      result.items.some(
        (item) => item.category === COACH_ATTENTION_CATEGORY.MISSED_APPOINTMENT,
      ),
    ).toBe(true)
  })

  it('surfaces unresolved athlete follow-up', () => {
    const result = getCoachAttentionItems({
      rosterEntries: [{ client: activeClient, clientName: 'Sarah' }],
      upcomingByBusinessClientId: { 'biz-1': { id: 'appt-1' } },
      passSummaryByBusinessClientId: {},
      recentMissedByBusinessClientId: {},
      lastCompletedByBusinessClientId: {},
      coachFollowUpsByAthleteId: {
        'athlete-1': [
          {
            reasonType: 'ATHLETE_QUESTION',
            summary: 'Asked about deload week timing',
            status: 'open',
          },
        ],
      },
      portfolioStatus: 'ready',
    })

    expect(result.items[0]?.category).toBe(
      COACH_ATTENTION_CATEGORY.ATHLETE_QUESTION,
    )
  })

  it('does not automatically flag active client with no appointment history', () => {
    const result = getCoachAttentionItems({
      rosterEntries: [{ client: activeClient, clientName: 'Sarah' }],
      upcomingByBusinessClientId: {},
      passSummaryByBusinessClientId: {
        'biz-1': { totalBalance: 8, activeCount: 1 },
      },
      recentMissedByBusinessClientId: {},
      lastCompletedByBusinessClientId: {},
      coachFollowUpsByAthleteId: {},
      portfolioStatus: 'ready',
    })

    expect(result.items).toHaveLength(0)
    expect(
      shouldFlagNoNextAppointment({
        client: activeClient,
        upcoming: null,
        recentMissed: null,
        lastCompleted: null,
      }),
    ).toBe(false)
  })

  it('never includes archived or inactive clients', () => {
    const result = getCoachAttentionItems({
      rosterEntries: [
        { client: archivedClient, clientName: 'Past Client' },
        { client: inactiveClient, clientName: 'Ended Client' },
      ],
      upcomingByBusinessClientId: {},
      passSummaryByBusinessClientId: {
        'biz-2': { totalBalance: 0, activeCount: 1 },
        'biz-3': { totalBalance: 0, activeCount: 1 },
      },
      recentMissedByBusinessClientId: {
        'biz-2': { sessionDate: '2026-09-01', status: 'missed' },
        'biz-3': { sessionDate: '2026-09-01', status: 'missed' },
      },
      lastCompletedByBusinessClientId: {},
      coachFollowUpsByAthleteId: {},
      portfolioStatus: 'ready',
    })

    expect(result.items).toHaveLength(0)
  })

  it('flags low balance only when actionable', () => {
    expect(
      shouldFlagLowSessionBalance({
        client: activeClient,
        passSummary: { totalBalance: 2, activeCount: 1 },
        upcoming: null,
        recentMissed: null,
        lastCompleted: null,
      }),
    ).toBe(false)

    expect(
      shouldFlagLowSessionBalance({
        client: activeClient,
        passSummary: { totalBalance: 0, activeCount: 1 },
        upcoming: null,
        recentMissed: null,
        lastCompleted: null,
      }),
    ).toBe(true)

    expect(
      shouldFlagLowSessionBalance({
        client: activeClient,
        passSummary: { totalBalance: 2, activeCount: 1 },
        upcoming: { id: 'appt-1' },
        recentMissed: null,
        lastCompleted: null,
      }),
    ).toBe(true)

    const result = getCoachAttentionItems({
      rosterEntries: [{ client: activeClient, clientName: 'Ryan' }],
      upcomingByBusinessClientId: { 'biz-1': { id: 'appt-1' } },
      passSummaryByBusinessClientId: {
        'biz-1': { totalBalance: 2, activeCount: 1 },
      },
      recentMissedByBusinessClientId: {},
      lastCompletedByBusinessClientId: {},
      coachFollowUpsByAthleteId: {},
      portfolioStatus: 'ready',
    })

    expect(
      result.items.some(
        (item) => item.category === COACH_ATTENTION_CATEGORY.LOW_SESSION_BALANCE,
      ),
    ).toBe(true)
  })

  it('does not flag LOW_SESSION_BALANCE for archived clients', () => {
    expect(
      shouldFlagLowSessionBalance({
        client: archivedClient,
        passSummary: { totalBalance: 0, activeCount: 1 },
        upcoming: { id: 'appt-archived' },
        recentMissed: null,
        lastCompleted: null,
      }),
    ).toBe(false)

    const result = getCoachAttentionItems({
      rosterEntries: [{ client: archivedClient, clientName: 'Past Client' }],
      upcomingByBusinessClientId: { 'biz-2': { id: 'appt-archived' } },
      passSummaryByBusinessClientId: {
        'biz-2': { totalBalance: 0, activeCount: 1 },
      },
      recentMissedByBusinessClientId: {},
      lastCompletedByBusinessClientId: {},
      coachFollowUpsByAthleteId: {},
      portfolioStatus: 'ready',
    })

    expect(
      result.items.some(
        (item) => item.category === COACH_ATTENTION_CATEGORY.LOW_SESSION_BALANCE,
      ),
    ).toBe(false)
  })

  it('dedupes one client with multiple signals to the highest-priority reason', () => {
    const now = new Date('2026-09-06T12:00:00.000Z')
    const result = getCoachAttentionItems(
      {
        rosterEntries: [{ client: activeClient, clientName: 'Sarah' }],
        upcomingByBusinessClientId: {},
        passSummaryByBusinessClientId: {
          'biz-1': { totalBalance: 1, activeCount: 1 },
        },
        recentMissedByBusinessClientId: {
          'biz-1': {
            status: SCHEDULED_SESSION_STATUS.MISSED,
            sessionDate: '2026-09-04',
          },
        },
        lastCompletedByBusinessClientId: {
          'biz-1': {
            status: SCHEDULED_SESSION_STATUS.COMPLETED,
            sessionDate: '2026-08-20',
          },
        },
        coachFollowUpsByAthleteId: {
          'athlete-1': [
            {
              reasonType: 'PAIN_OR_DISCOMFORT',
              summary: 'Knee discomfort on lunges',
              status: 'open',
            },
          ],
        },
        portfolioStatus: 'ready',
      },
      now,
    )

    expect(result.items).toHaveLength(1)
    expect(result.items[0].category).toBe(
      COACH_ATTENTION_CATEGORY.PAIN_OR_DISCOMFORT,
    )
  })

  it('outranks no-next-appointment with high-priority signals', () => {
    const result = getCoachAttentionItems({
      rosterEntries: [{ client: activeClient, clientName: 'Sarah' }],
      upcomingByBusinessClientId: {},
      passSummaryByBusinessClientId: {},
      recentMissedByBusinessClientId: {},
      lastCompletedByBusinessClientId: {
        'biz-1': {
          status: SCHEDULED_SESSION_STATUS.COMPLETED,
          sessionDate: '2026-08-20',
        },
      },
      coachFollowUpsByAthleteId: {
        'athlete-1': [
          {
            reasonType: 'RECOVERY_CONCERN',
            summary: 'Recovery rating dropped to 2',
            status: 'open',
          },
        ],
      },
      portfolioStatus: 'ready',
    })

    expect(result.items[0].category).toBe(
      COACH_ATTENTION_CATEGORY.RECOVERY_CONCERN,
    )
    expect(result.items).toHaveLength(1)
  })

  it('keeps attention list bounded', () => {
    const rosterEntries = Array.from({ length: 12 }, (_, index) => ({
      client: {
        ...activeClient,
        id: `biz-${index}`,
        business_client_id: `biz-${index}`,
        athlete_id: `athlete-${index}`,
      },
      clientName: `Client ${index}`,
    }))

    const recentMissedByBusinessClientId = Object.fromEntries(
      rosterEntries.map((entry) => [
        entry.client.business_client_id,
        { status: 'missed', sessionDate: '2026-09-04' },
      ]),
    )

    const result = getCoachAttentionItems(
      {
        rosterEntries,
        upcomingByBusinessClientId: {},
        passSummaryByBusinessClientId: {},
        recentMissedByBusinessClientId,
        lastCompletedByBusinessClientId: {},
        coachFollowUpsByAthleteId: {},
        portfolioStatus: 'ready',
      },
      new Date('2026-09-06T12:00:00.000Z'),
      { limit: 5 },
    )

    expect(result.items.length).toBeLessThanOrEqual(5)
  })

  it('returns no fake attention items for a healthy roster', () => {
    const result = getCoachAttentionItems({
      rosterEntries: [{ client: activeClient, clientName: 'Sarah' }],
      upcomingByBusinessClientId: {
        'biz-1': { id: 'appt-1', startsAt: '2026-09-10T15:00:00.000Z' },
      },
      passSummaryByBusinessClientId: {
        'biz-1': { totalBalance: 6, activeCount: 1 },
      },
      recentMissedByBusinessClientId: {},
      lastCompletedByBusinessClientId: {
        'biz-1': { status: 'completed', sessionDate: '2026-09-01' },
      },
      coachFollowUpsByAthleteId: {},
      portfolioStatus: 'ready',
    })

    expect(result.items).toHaveLength(0)
    expect(result.hubItems).toHaveLength(0)
  })

  it('flags no-next only after established cadence', () => {
    const result = getCoachAttentionItems({
      rosterEntries: [{ client: activeClient, clientName: 'Sarah' }],
      upcomingByBusinessClientId: {},
      passSummaryByBusinessClientId: {},
      recentMissedByBusinessClientId: {},
      lastCompletedByBusinessClientId: {
        'biz-1': {
          status: SCHEDULED_SESSION_STATUS.COMPLETED,
          sessionDate: '2026-08-20',
        },
      },
      coachFollowUpsByAthleteId: {},
      portfolioStatus: 'ready',
    })

    expect(
      result.items.some(
        (item) => item.category === COACH_ATTENTION_CATEGORY.NO_NEXT_APPOINTMENT,
      ),
    ).toBe(true)
  })

  it('does not emit arbitrary client health scores', () => {
    const result = getCoachAttentionItems({
      rosterEntries: [{ client: activeClient, clientName: 'Sarah' }],
      upcomingByBusinessClientId: {},
      passSummaryByBusinessClientId: {},
      recentMissedByBusinessClientId: {},
      lastCompletedByBusinessClientId: {
        'biz-1': { status: 'completed', sessionDate: '2026-08-01' },
      },
      coachFollowUpsByAthleteId: {},
      portfolioStatus: 'ready',
    })

    result.items.forEach((item) => {
      expect(item).not.toHaveProperty('healthScore')
      expect(item).not.toHaveProperty('clientScore')
    })
  })
})
