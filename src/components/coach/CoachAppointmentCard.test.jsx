import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import CoachAppointmentCard from './CoachAppointmentCard'
import { APPOINTMENT_STATUS } from '../../lib/coachingAppointment'
import { RSVP_STATUS } from '../../lib/sessionRsvp'

const session = {
  id: 's1',
  sessionDate: '2026-08-15',
  startTime: '17:30',
  durationMinutes: 60,
  status: APPOINTMENT_STATUS.SCHEDULED,
  locationType: 'default',
  rsvpStatus: RSVP_STATUS.CONFIRMED,
}

const jake = {
  athlete_id: 'athlete-jake',
  coach_label: 'Jake',
  profile: { preferred_name: 'Jake' },
}

describe('CoachAppointmentCard', () => {
  it('renders compact hierarchy with time, client, and duration only', () => {
    render(
      <CoachAppointmentCard session={session} client={jake} onClick={vi.fn()} />,
    )

    expect(screen.getByText('Jake')).toBeInTheDocument()
    expect(screen.getByText(/60 min/i)).toBeInTheDocument()
    expect(screen.queryByText(/AVAREN Gym/i)).not.toBeInTheDocument()
    expect(screen.queryByText('Confirmed')).not.toBeInTheDocument()
  })

  it('shows cancelled status clearly', () => {
    render(
      <CoachAppointmentCard
        session={{ ...session, status: APPOINTMENT_STATUS.CANCELLED }}
        client={jake}
        onClick={vi.fn()}
      />,
    )

    expect(screen.getByText('Cancelled')).toBeInTheDocument()
  })

  it('marks next and past visual states', () => {
    const { rerender } = render(
      <CoachAppointmentCard
        session={session}
        client={jake}
        onClick={vi.fn()}
        isNext
      />,
    )

    expect(screen.getByText('Next')).toBeInTheDocument()
    expect(screen.getByTestId('coach-appointment-card')).toHaveAttribute(
      'data-next',
      'true',
    )

    rerender(
      <CoachAppointmentCard
        session={session}
        client={jake}
        onClick={vi.fn()}
        isPast
      />,
    )

    expect(screen.getByTestId('coach-appointment-card')).toHaveAttribute(
      'data-past',
      'true',
    )
  })
})
