import { describe, expect, it } from 'vitest'
import {
  COACH_ATTENTION_CATEGORY,
  getCoachAttentionItems,
} from './coachAttention'
import { BUSINESS_CLIENT_STATUS } from './coachBusinessClient'

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

describe('coachAttention', () => {
  it('flags active clients with no next appointment', () => {
    const result = getCoachAttentionItems({
      rosterEntries: [{ client: activeClient, clientName: 'Sarah' }],
      upcomingByBusinessClientId: {},
      passSummaryByBusinessClientId: {},
      recentMissedByBusinessClientId: {},
      coachFollowUpsByAthleteId: {},
      portfolioStatus: 'ready',
    })

    expect(
      result.items.some(
        (item) => item.category === COACH_ATTENTION_CATEGORY.NO_NEXT_APPOINTMENT,
      ),
    ).toBe(true)
  })

  it('excludes archived clients from attention', () => {
    const result = getCoachAttentionItems({
      rosterEntries: [{ client: archivedClient, clientName: 'Past Client' }],
      upcomingByBusinessClientId: {},
      passSummaryByBusinessClientId: {},
      recentMissedByBusinessClientId: {},
      coachFollowUpsByAthleteId: {},
      portfolioStatus: 'ready',
    })

    expect(result.items).toHaveLength(0)
  })

  it('uses ledger pass truth for low session balance', () => {
    const result = getCoachAttentionItems({
      rosterEntries: [{ client: activeClient, clientName: 'Ryan' }],
      upcomingByBusinessClientId: { 'biz-1': { id: 'appt-1' } },
      passSummaryByBusinessClientId: {
        'biz-1': { totalBalance: 2, activeCount: 1 },
      },
      recentMissedByBusinessClientId: {},
      coachFollowUpsByAthleteId: {},
      portfolioStatus: 'ready',
    })

    expect(
      result.items.some(
        (item) => item.category === COACH_ATTENTION_CATEGORY.LOW_SESSION_BALANCE,
      ),
    ).toBe(true)
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

    const result = getCoachAttentionItems(
      {
        rosterEntries,
        upcomingByBusinessClientId: {},
        passSummaryByBusinessClientId: {},
        recentMissedByBusinessClientId: {},
        coachFollowUpsByAthleteId: {},
        portfolioStatus: 'ready',
      },
      new Date(),
      { limit: 5 },
    )

    expect(result.items.length).toBeLessThanOrEqual(5)
  })

  it('does not emit arbitrary client health scores', () => {
    const result = getCoachAttentionItems({
      rosterEntries: [{ client: activeClient, clientName: 'Sarah' }],
      upcomingByBusinessClientId: {},
      passSummaryByBusinessClientId: {},
      recentMissedByBusinessClientId: {},
      coachFollowUpsByAthleteId: {},
      portfolioStatus: 'ready',
    })

    result.items.forEach((item) => {
      expect(item).not.toHaveProperty('healthScore')
      expect(item).not.toHaveProperty('clientScore')
    })
  })

  it('deduplicates pain-related legacy and business attention cards', () => {
    const result = getCoachAttentionItems({
      rosterEntries: [{ client: activeClient, clientName: 'Sarah' }],
      upcomingByBusinessClientId: { 'biz-1': { id: 'appt-1', startsAt: '2026-08-20T10:00:00.000Z' } },
      passSummaryByBusinessClientId: {},
      recentMissedByBusinessClientId: {},
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
      portfolio: {
        rosterEntries: [{ client: activeClient, clientName: 'Sarah' }],
      },
    })

    const painItems = result.items.filter(
      (item) =>
        item.category === COACH_ATTENTION_CATEGORY.PAIN_OR_DISCOMFORT ||
        /shoulder pain/i.test(item.description ?? ''),
    )
    expect(painItems.length).toBeLessThanOrEqual(1)
  })

  it('does not flag no-next-appointment when a future session exists', () => {
    const now = new Date('2026-08-17T12:00:00.000Z')
    const result = getCoachAttentionItems(
      {
        rosterEntries: [{ client: activeClient, clientName: 'Sarah' }],
        upcomingByBusinessClientId: {
          'biz-1': {
            status: 'scheduled',
            startsAt: '2026-08-18T10:00:00.000Z',
          },
        },
        passSummaryByBusinessClientId: {},
        recentMissedByBusinessClientId: {},
        coachFollowUpsByAthleteId: {},
        portfolioStatus: 'ready',
      },
      now,
    )

    expect(
      result.items.some(
        (item) => item.category === COACH_ATTENTION_CATEGORY.NO_NEXT_APPOINTMENT,
      ),
    ).toBe(false)
  })
})
