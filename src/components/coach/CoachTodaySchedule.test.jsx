import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import CoachTodaySchedule from './CoachTodaySchedule'
import { coachBackend } from '../../lib/coachBackend'

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
  sessionDate: new Date().toISOString().slice(0, 10),
  startTime: '17:30',
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
        duration_minutes: session.durationMinutes,
        status: session.status,
        location_type: session.locationType,
        rsvp_status: session.rsvpStatus,
      },
    ])
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

    await user.click(screen.getByRole('button', { name: /5:30 PM/i }))

    expect(onOpenSession).toHaveBeenCalledTimes(1)
    expect(onOpenSession.mock.calls[0][0]).toEqual(
      expect.objectContaining({ id: 'session-1', athleteId: 'athlete-jake' }),
    )
    expect(onOpenClient).not.toHaveBeenCalled()
  })
})
