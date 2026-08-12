import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import CoachAppointmentCard from './CoachAppointmentCard'
import { APPOINTMENT_STATUS } from '../../lib/coachingAppointment'
import { RSVP_STATUS } from '../../lib/sessionRsvp'

const session = {
  id: 's1',
  sessionDate: '2026-08-13',
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
  it('renders compact hierarchy with client display name and RSVP status', () => {
    render(
      <CoachAppointmentCard session={session} client={jake} onClick={vi.fn()} />,
    )

    expect(screen.getByText('Jake')).toBeInTheDocument()
    expect(screen.getByText(/60 min · AVAREN Gym/i)).toBeInTheDocument()
    expect(screen.getByText('Confirmed')).toBeInTheDocument()
  })

  it('shows Awaiting reply for scheduled sessions without confirmation', () => {
    render(
      <CoachAppointmentCard
        session={{ ...session, rsvpStatus: RSVP_STATUS.AWAITING }}
        client={jake}
        onClick={vi.fn()}
      />,
    )

    expect(screen.getByText('Awaiting reply')).toBeInTheDocument()
  })
})
