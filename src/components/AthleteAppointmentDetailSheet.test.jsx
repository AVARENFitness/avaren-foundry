import { describe, expect, it, vi, beforeEach } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import AthleteAppointmentDetailSheet from './AthleteAppointmentDetailSheet'
import { coachBackend } from '../lib/coachBackend'
import { FOLLOWUP_REASON_TYPE } from '../lib/coachFollowUp'
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
  athleteId: 'athlete-1',
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

describe('AthleteAppointmentDetailSheet schedule conflict handoff', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    coachBackend.listAthleteFollowUps.mockResolvedValue([])
    coachBackend.createClientFollowUp.mockResolvedValue({
      id: 'followup-1',
      reasonType: FOLLOWUP_REASON_TYPE.SCHEDULE_CONFLICT,
      scheduledSessionId: 'appt-1',
      status: 'open',
    })
    coachBackend.updateSessionRsvp.mockResolvedValue({
      ok: true,
      session: {
        id: 'appt-1',
        status: 'scheduled',
        rsvp_status: RSVP_STATUS.CANNOT_ATTEND,
        session_date: '2026-08-12',
        start_time: '09:00:00',
        schedule_timezone: 'America/New_York',
      },
    })
  })

  it('opens the schedule-conflict handoff when tapping Can\'t make it', async () => {
    render(
      <AthleteAppointmentDetailSheet
        appointment={appointment}
        open
        onClose={vi.fn()}
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: "Can't make it" }))

    await waitFor(() => {
      expect(coachBackend.listAthleteFollowUps).toHaveBeenCalled()
    })

    expect(screen.getByText("CAN'T MAKE IT?")).toBeTruthy()
    expect(screen.getByText(/In-person training with Jacob Corell/)).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Send request' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Never mind' })).toBeTruthy()
    expect(screen.getByText('Prefer another time?')).toBeTruthy()
    expect(screen.getByLabelText('Preferred date')).toBeTruthy()
    expect(screen.getByLabelText('Preferred time')).toBeDisabled()
    expect(screen.getByText(/request, not a booking/i)).toBeTruthy()
  })

  it('includes an optional preferred replacement date and time in the coach follow-up', async () => {
    render(
      <AthleteAppointmentDetailSheet
        appointment={appointment}
        open
        onClose={vi.fn()}
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: "Can't make it" }))
    const dateInput = await screen.findByLabelText('Preferred date')
    const timeInput = screen.getByLabelText('Preferred time')

    fireEvent.change(dateInput, { target: { value: '2026-08-14' } })
    fireEvent.change(timeInput, { target: { value: '16:30' } })
    fireEvent.click(screen.getByRole('button', { name: 'Send request' }))

    await waitFor(() => {
      expect(coachBackend.createClientFollowUp).toHaveBeenCalledWith(
        expect.objectContaining({
          summary: expect.stringContaining('Requested another time'),
        }),
      )
    })

    expect(coachBackend.createClientFollowUp.mock.calls[0][0].summary).toContain(
      'Fri, Aug 14 at 4:30 PM',
    )
  })

  it('submits schedule-conflict follow-up with appointment context', async () => {
    const onUpdated = vi.fn()

    render(
      <AthleteAppointmentDetailSheet
        appointment={appointment}
        open
        onClose={vi.fn()}
        onUpdated={onUpdated}
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: "Can't make it" }))
    fireEvent.click(await screen.findByRole('button', { name: 'Send request' }))

    await waitFor(() => {
      expect(coachBackend.createClientFollowUp).toHaveBeenCalledWith(
        expect.objectContaining({
          reasonType: FOLLOWUP_REASON_TYPE.SCHEDULE_CONFLICT,
          scheduledSessionId: 'appt-1',
          assignmentId: 'assign-1',
          coachId: 'coach-correct',
        }),
      )
    })

    expect(coachBackend.updateSessionRsvp).toHaveBeenCalledWith(
      'appt-1',
      RSVP_STATUS.CANNOT_ATTEND,
    )
    expect(screen.getByText('Coach notified')).toBeTruthy()
    expect(onUpdated).toHaveBeenCalled()
  })

  it('shows an error state when follow-up creation fails', async () => {
    coachBackend.createClientFollowUp.mockRejectedValue(new Error('network_failed'))

    render(
      <AthleteAppointmentDetailSheet
        appointment={appointment}
        open
        onClose={vi.fn()}
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: "Can't make it" }))
    fireEvent.click(await screen.findByRole('button', { name: 'Send request' }))

    await waitFor(() => {
      expect(screen.getByText('network_failed')).toBeTruthy()
    })

    expect(screen.getByRole('button', { name: 'Try again' })).toBeTruthy()
  })

  it('still confirms RSVP from the primary action', async () => {
    coachBackend.updateSessionRsvp.mockResolvedValueOnce({
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

    const onUpdated = vi.fn()
    render(
      <AthleteAppointmentDetailSheet
        appointment={appointment}
        open
        onClose={vi.fn()}
        onUpdated={onUpdated}
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: 'Confirm' }))

    await waitFor(() => {
      expect(coachBackend.updateSessionRsvp).toHaveBeenCalledWith(
        'appt-1',
        RSVP_STATUS.CONFIRMED,
      )
      expect(screen.queryByRole('button', { name: 'Confirm' })).not.toBeInTheDocument()
    })

    expect(screen.getByText(/✓ Confirmed/i)).toBeInTheDocument()
    expect(onUpdated).toHaveBeenCalled()
  })

  it('renders confirmed state without a Confirm CTA when already confirmed', () => {
    render(
      <AthleteAppointmentDetailSheet
        appointment={{ ...appointment, rsvpStatus: RSVP_STATUS.CONFIRMED }}
        open
        onClose={vi.fn()}
      />,
    )

    expect(screen.queryByRole('button', { name: 'Confirm' })).not.toBeInTheDocument()
    expect(screen.getByText(/✓ Confirmed/i)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /can't make it/i })).toBeInTheDocument()
  })
})
