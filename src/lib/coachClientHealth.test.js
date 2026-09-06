import { describe, expect, it } from 'vitest'
import { buildClientHealthSummary, RELATIONSHIP_STATUS } from './coachClientHealth'
import { BUSINESS_CLIENT_STATUS } from './coachBusinessClient'
import { SCHEDULED_SESSION_STATUS } from './coachScheduledSessions'

describe('coachClientHealth', () => {
  it('summarizes next appointment and pass balance', () => {
    const summary = buildClientHealthSummary({
      client: {
        id: 'biz-1',
        status: BUSINESS_CLIENT_STATUS.ACTIVE,
      },
      nextAppointment: {
        id: 'appt-1',
        sessionDate: '2026-08-20',
        startTime: '16:00:00',
        appointmentType: 'TRAINING',
      },
      passes: [{ balance: 2, status: 'active', sessionsPurchased: 10 }],
      appointments: [],
      followUps: [],
    })

    expect(summary.nextAppointment?.id).toBe('appt-1')
    expect(summary.remainingPasses).toBe(2)
    expect(summary.relationshipStatus).toBe(RELATIONSHIP_STATUS.ACTIVE)
  })

  it('preserves offline client relationship status without athlete account', () => {
    const summary = buildClientHealthSummary({
      client: {
        id: 'biz-offline',
        linked_user_id: null,
        status: BUSINESS_CLIENT_STATUS.ACTIVE,
      },
      passes: [],
      appointments: [
        {
          id: 'appt-old',
          status: SCHEDULED_SESSION_STATUS.COMPLETED,
          sessionDate: '2026-08-01',
        },
      ],
    })

    expect(summary.relationshipStatus).toBe(RELATIONSHIP_STATUS.ACTIVE)
    expect(summary.lastAppointment?.sessionDate).toBe('2026-08-01')
  })
})
