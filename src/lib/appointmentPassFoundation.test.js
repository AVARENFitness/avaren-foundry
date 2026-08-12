import { describe, expect, it } from 'vitest'
import { APPOINTMENT_STATUS } from './coachingAppointment'
import {
  appointmentConsumesPassCredit,
  derivePassUsageSnapshot,
  PASS_USAGE_POLICY,
  scheduledAppointmentConsumesPassCredit,
} from './appointmentPassFoundation'

describe('appointmentPassFoundation', () => {
  it('does not consume pass credit for scheduled-only appointments', () => {
    expect(scheduledAppointmentConsumesPassCredit()).toBe(false)
    expect(
      appointmentConsumesPassCredit({ status: APPOINTMENT_STATUS.SCHEDULED }),
    ).toBe(false)
    expect(
      appointmentConsumesPassCredit({ status: APPOINTMENT_STATUS.CANCELLED }),
    ).toBe(false)
  })

  it('consumes pass credit only for completed appointments', () => {
    expect(
      appointmentConsumesPassCredit({ status: APPOINTMENT_STATUS.COMPLETED }),
    ).toBe(true)
  })

  it('derives used sessions from completed appointment records', () => {
    const snapshot = derivePassUsageSnapshot({
      appointments: [
        { status: APPOINTMENT_STATUS.COMPLETED },
        { status: APPOINTMENT_STATUS.COMPLETED },
        { status: APPOINTMENT_STATUS.CANCELLED },
        { status: APPOINTMENT_STATUS.SCHEDULED },
      ],
      packageRow: {
        total_sessions: 12,
        sessions_used: 1,
        sessions_remaining: 11,
      },
    })

    expect(snapshot.completedFromAppointments).toBe(2)
    expect(snapshot.usedSessions).toBe(2)
    expect(snapshot.remainingSessions).toBe(10)
    expect(snapshot.policy.COMPLETED).toBe(PASS_USAGE_POLICY.COMPLETED)
    expect(snapshot.policy.CANCELLED).toBe(PASS_USAGE_POLICY.CANCELLED)
  })
})
