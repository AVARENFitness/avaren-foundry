import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import CoachTodaySchedule from './CoachTodaySchedule'
import { coachBackend } from '../../lib/coachBackend'
import { dateKey } from '../../lib/appointmentScheduling'

vi.mock('../../lib/coachBackend', () => ({
  coachBackend: {
    listScheduledSessions: vi.fn(),
  },
}))

const jake = {
  athlete_id: 'athlete-jake',
  coach_label: 'Jake',
  athlete_email: 'jake@example.com',
}

const session = {
  id: 'session-1',
  athleteId: 'athlete-jake',
  sessionDate: dateKey(new Date()),
  startTime: new Date().toTimeString().slice(0, 5),
  durationMinutes: 60,
  status: 'scheduled',
  locationType: 'avaren_gym',
  rsvpStatus: 'confirmed',
}

describe('CoachTodaySchedule', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    coachBackend.listScheduledSessions.mockResolvedValue([
      {
        id: session.id,
        athlete_id: session.athleteId,
        session_date: session.sessionDate,
        start_time: session.startTime,
        starts_at: new Date(Date.now() - 60_000).toISOString(),
        ends_at: new Date(Date.now() + 3_600_000).toISOString(),
        duration_minutes: session.durationMinutes,
        status: session.status,
        location_type: session.locationType,
        rsvp_status: session.rsvpStatus,
      },
    ])
  })

  it('keeps one client action on each upcoming appointment', async () => {
    const user = userEvent.setup()
    const onOpenClient = vi.fn()
    render(
      <CoachTodaySchedule
        clients={[jake]}
        onOpenClient={onOpenClient}
        onOpenClientSection={vi.fn()}
      />,
    )
    await waitFor(() => expect(screen.getByText('Jake')).toBeInTheDocument())
    expect(screen.getAllByRole('button', { name: 'Open client' })).toHaveLength(1)
    expect(screen.queryByRole('button', { name: 'Notes' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Passes' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Training' })).not.toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Open client' }))
    expect(onOpenClient).toHaveBeenCalledWith(jake)
  })

  it('opens appointment detail instead of client profile when onOpenSession is provided', async () => {
    const user = userEvent.setup()
    const onOpenSession = vi.fn()
    const onOpenClient = vi.fn()

    render(
      <CoachTodaySchedule
        clients={[jake]}
        onOpenSession={onOpenSession}
        onOpenClient={onOpenClient}
      />,
    )

    await waitFor(() => {
      expect(screen.getByText('Jake')).toBeInTheDocument()
    })

    await user.click(screen.getByTestId('coach-appointment-card'))

    expect(onOpenSession).toHaveBeenCalledTimes(1)
    expect(onOpenSession.mock.calls[0][0]).toEqual(
      expect.objectContaining({ id: 'session-1', athleteId: 'athlete-jake' }),
    )
    expect(onOpenClient).not.toHaveBeenCalled()
  })
})
