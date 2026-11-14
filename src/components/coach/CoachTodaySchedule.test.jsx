import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
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
  it('keeps known appointments visible and offers retry if refresh fails', async () => {
    render(<CoachTodaySchedule clients={[jake]} />)
    await waitFor(() => expect(screen.getByText('Jake')).toBeInTheDocument())

    coachBackend.listScheduledSessions.mockRejectedValueOnce(new Error('Network offline'))
    fireEvent(window, new Event('avaren:coach-today-updated'))

    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent('Schedule could not refresh')
    })
    expect(screen.getByText('Jake')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Retry' })).toBeInTheDocument()
  })

  it('keeps earlier completed appointments visible separately from upcoming training', async () => {
    const earlier = {
      id: 'session-earlier',
      athlete_id: 'athlete-jake',
      session_date: dateKey(new Date()),
      start_time: '07:00',
      starts_at: new Date(Date.now() - 3_600_000).toISOString(),
      ends_at: new Date(Date.now() - 1_800_000).toISOString(),
      duration_minutes: 30,
      status: 'completed',
    }
    const upcoming = {
      id: 'session-later',
      athlete_id: 'athlete-jake',
      session_date: dateKey(new Date()),
      start_time: '18:00',
      starts_at: new Date(Date.now() + 3_600_000).toISOString(),
      ends_at: new Date(Date.now() + 7_200_000).toISOString(),
      duration_minutes: 60,
      status: 'scheduled',
    }
    coachBackend.listScheduledSessions.mockResolvedValue([earlier, upcoming])
    render(<CoachTodaySchedule clients={[jake]} />)

    await waitFor(() => expect(screen.getByText('1 upcoming · 1 earlier')).toBeInTheDocument())
    expect(screen.getByRole('region', { name: 'Upcoming' })).toBeInTheDocument()
    expect(screen.getByRole('region', { name: 'Earlier today' })).toBeInTheDocument()
    const cards = screen.getAllByTestId('coach-appointment-card')
    expect(cards).toHaveLength(2)
    expect(cards[0]).toHaveAttribute('data-next', 'true')
    expect(cards[1]).toHaveAttribute('data-past', 'true')
  })

  it('refreshes Coach Today when appointments change in Calendar', async () => {
    render(<CoachTodaySchedule clients={[jake]} />)
    await waitFor(() => expect(screen.getByText('Jake')).toBeInTheDocument())

    fireEvent(window, new Event('avaren:coach-today-updated'))
    await waitFor(() => {
      expect(coachBackend.listScheduledSessions).toHaveBeenCalledTimes(2)
    })
  })

})
