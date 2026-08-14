import { describe, expect, it } from 'vitest'
import {
  isOfflineBusinessClient,
  resolveBusinessClientReminderLabel,
} from './businessClientReminderLabel'
import { buildAppointmentNotificationCopy } from './appointmentNotifications'
import { APPOINTMENT_NOTIFICATION_TYPES } from './appointmentNotifications'

describe('businessClientReminderLabel', () => {
  it('uses preferred_name first', () => {
    expect(
      resolveBusinessClientReminderLabel({
        preferred_name: 'Jake',
        display_name: 'Jacob C.',
        first_name: 'Jacob',
        last_name: 'Corell',
      }),
    ).toBe('Jake')
  })

  it('falls back to display_name', () => {
    expect(
      resolveBusinessClientReminderLabel({
        display_name: 'Sarah Johnson',
        first_name: 'Sarah',
        last_name: 'Johnson',
      }),
    ).toBe('Sarah Johnson')
  })

  it('falls back to first and last name', () => {
    expect(
      resolveBusinessClientReminderLabel({
        first_name: 'Jacob',
        last_name: 'Corell',
      }),
    ).toBe('Jacob Corell')
  })

  it('falls back to linked athlete display name for connected clients', () => {
    expect(
      resolveBusinessClientReminderLabel(
        { linked_user_id: 'athlete-1' },
        { linkedAthleteDisplayName: 'Will' },
      ),
    ).toBe('Will')
  })

  it('uses Athlete when all identity fields are missing', () => {
    expect(resolveBusinessClientReminderLabel({})).toBe('Athlete')
  })

  it('supports offline business clients with coach-facing names', () => {
    const offlineClient = {
      linked_user_id: null,
      preferred_name: '',
      display_name: 'Guest Client',
      first_name: '',
      last_name: '',
    }

    expect(isOfflineBusinessClient(offlineClient)).toBe(true)
    expect(resolveBusinessClientReminderLabel(offlineClient)).toBe('Guest Client')
  })

  it('does not expose raw email as reminder fallback', () => {
    expect(
      resolveBusinessClientReminderLabel({
        email: 'guest.client@example.com',
      }),
    ).toBe('Athlete')
  })

  it('builds coach reminder copy with resolved client label', () => {
    const athleteLabel = resolveBusinessClientReminderLabel({
      preferred_name: 'Jake',
    })

    const copy = buildAppointmentNotificationCopy({
      type: APPOINTMENT_NOTIFICATION_TYPES.COACH_REMINDER_2H,
      appointment: {
        sessionDate: '2026-08-20',
        startTime: '17:30:00',
        scheduleTimezone: 'America/New_York',
        rsvpStatus: 'confirmed',
      },
      athleteDisplayName: athleteLabel,
    })

    expect(copy.title).toBe('Training in 2 hours')
    expect(copy.body).toContain('Jake')
    expect(copy.body).toContain('Confirmed')
  })
})
