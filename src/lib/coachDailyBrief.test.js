import { describe, expect, it } from 'vitest'
import {
  buildCoachDailyBriefFallback,
  buildCoachDailyBriefPacket,
  normalizeCoachDailyBrief,
} from './coachDailyBrief'

describe('coach daily brief', () => {
  it('builds a compact trusted packet from existing coach facts', () => {
    const client = {
      id: '11111111-1111-4111-8111-111111111111',
      business_client_id: '11111111-1111-4111-8111-111111111111',
      athlete_id: '22222222-2222-4222-8222-222222222222',
      display_name: 'Jake',
    }
    const packet = buildCoachDailyBriefPacket({
      clients: [client],
      rosterEntries: [
        {
          client,
          clientName: 'Jake',
          intelligence: {
            training: {
              lastSession: {
                name: 'Lower A',
                relativeLabel: '2 days ago',
                sets: 16,
              },
            },
            readiness: {
              available: true,
              band: 'manage',
              score: 62,
              status: 'Manage load',
            },
          },
          athleteCheckInStatus: 'SUBMITTED',
        },
      ],
      attentionItems: [
        {
          client,
          clientName: 'Jake',
          businessClientId: client.business_client_id,
          category: 'RECOVERY_CONCERN',
          description: 'Recovery needs review',
          priorityScore: 90,
          actionLabel: 'Open client',
        },
      ],
      todaySessions: [
        {
          id: 'session-1',
          businessClientId: client.business_client_id,
          athleteId: client.athlete_id,
          startTime: '16:00',
          linkedWorkoutTitle: 'Lower A',
        },
      ],
      wins: [
        {
          client,
          clientName: 'Jake',
          label: 'Consistency held',
          detail: '3 sessions this week',
        },
      ],
    })

    expect(packet.attention[0]).toMatchObject({
      clientName: 'Jake',
      category: 'RECOVERY_CONCERN',
    })
    expect(packet.today[0]).toMatchObject({
      clientName: 'Jake',
      workout: 'Lower A',
      readiness: { band: 'manage' },
    })
    expect(packet.wins[0].label).toBe('Consistency held')
  })

  it('keeps the deterministic fallback useful without OpenAI', () => {
    const packet = {
      attention: [
        {
          businessClientId: 'client-1',
          clientName: 'Jake',
          category: 'MISSED_TRAINING',
          description: 'No recent training',
          actionLabel: 'Open client',
        },
      ],
      today: [],
      wins: [],
    }

    const fallback = buildCoachDailyBriefFallback(packet)
    expect(fallback.attention[0].actionType).toBe('open_training')
    expect(fallback.headline).toContain('1 client')
  })

  it('drops model items that reference clients outside the trusted packet', () => {
    const packet = {
      attention: [
        {
          businessClientId: 'client-1',
          clientName: 'Jake',
        },
      ],
      today: [],
      wins: [],
    }

    const brief = normalizeCoachDailyBrief(
      {
        headline: 'Today',
        attention: [
          {
            businessClientId: 'client-1',
            clientName: 'Jake',
            why: 'Grounded',
            actionType: 'open_training',
          },
          {
            businessClientId: 'client-2',
            clientName: 'Other client',
            why: 'Should not survive',
            actionType: 'open_client',
          },
        ],
      },
      packet,
    )

    expect(brief.attention).toHaveLength(1)
    expect(brief.attention[0].businessClientId).toBe('client-1')
  })
})
