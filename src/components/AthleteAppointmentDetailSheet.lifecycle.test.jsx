import { describe, expect, it, vi, beforeEach } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import AthleteAppointmentDetailSheet from './AthleteAppointmentDetailSheet'
import { coachBackend } from '../lib/coachBackend'
import { RSVP_STATUS } from '../lib/sessionRsvp'

vi.mock('../lib/coachBackend', () => ({
  coachBackend: {
    listAthleteFollowUps: vi.fn(),
    createClientFollowUp: vi.fn(),
    updateSessionRsvp: vi.fn(),
  },
}))

vi.mock('../lib/appUi', () => ({
  appUi: {
    toast: vi.fn(),
  },
}))

const appointment = {
  id: 'appt-1',
  coachId: 'coach-correct',
  coachDisplayName: 'Jacob Corell',
  sessionDate: '2026-08-12',
  startTime: '09:00:00',
  scheduleTimezone: 'America/New_York',
  startsAt: '2026-08-12T13:00:00.000Z',
  status: 'scheduled',
  rsvpStatus: RSVP_STATUS.AWAITING,
  appointmentType: 'IN_PERSON_TRAINING',
  assignmentId: 'assign-1',
}

describe('AthleteAppointmentDetailSheet modal lifecycle', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    document.body.style.overflow = ''
    document.body.style.position = ''
    coachBackend.listAthleteFollowUps.mockResolvedValue([])
    coachBackend.updateSessionRsvp.mockResolvedValue({
      ok: true,
      session: {
        id: 'appt-1',
        status: 'scheduled',
        rsvp_status: RSVP_STATUS.CONFIRMED,
        session_date: '2026-08-12',
        start_time: '09:00:00',
        schedule_timezone: 'America/New_York',
      },
    })
  })

  it('clears the modal backdrop after close so the page can receive clicks again', async () => {
    const onClose = vi.fn()
    const { rerender } = render(
      <AthleteAppointmentDetailSheet
        appointment={appointment}
        open
        onClose={onClose}
      />,
    )

    expect(document.querySelector('[data-app-ui-backdrop="open"]')).not.toBeNull()

    fireEvent.click(screen.getByRole('button', { name: 'Close' }))
    expect(onClose).toHaveBeenCalled()

    rerender(
      <AthleteAppointmentDetailSheet
        appointment={null}
        open={false}
        onClose={onClose}
      />,
    )

    await waitFor(() => {
      expect(document.querySelector('[data-app-ui-backdrop="open"]')).toBeNull()
    })
    expect(document.body.style.overflow).not.toBe('hidden')
    expect(document.body.style.position).not.toBe('fixed')
  })
})
