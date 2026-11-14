import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import AthleteInPersonScheduleScreen from './AthleteInPersonScheduleScreen'
import { athleteCalendarBackend } from '../lib/athleteCalendarEvents'
import { coachBackend } from '../lib/coachBackend'
import { dateKey } from '../lib/appointmentScheduling'

const refreshAppointments = vi.fn()

vi.mock('../hooks/useAthleteAppointments', () => ({
  useAthleteAppointments: () => ({
    upcomingAppointments: [],
    loading: false,
    ready: true,
    refreshAppointments,
  }),
}))

vi.mock('../components/CoachQuickPlan', () => ({
  default: () => null,
}))
vi.mock('../components/AthletePassStatus', () => ({
  default: () => null,
}))

vi.mock('../lib/athleteCalendarEvents', async () => {
  const original = await vi.importActual('../lib/athleteCalendarEvents')
  return {
    ...original,
    athleteCalendarBackend: {
      list: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      remove: vi.fn(),
    },
  }
})

vi.mock('../lib/coachBackend', () => ({
  coachBackend: {
    listAthleteScheduledSessionHistory: vi.fn(),
    listCoachCalendarEvents: vi.fn(),
    listScheduledSessions: vi.fn(),
    listCoachRoster: vi.fn(),
  },
}))

describe('Athlete calendar partial sync safety', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    athleteCalendarBackend.list.mockResolvedValue([{
      id: 'private-1',
      title: 'Dentist',
      event_date: dateKey(new Date()),
      start_time: '10:00',
      duration_minutes: 60,
      category: 'personal',
      status: 'scheduled',
    }])
    coachBackend.listAthleteScheduledSessionHistory.mockResolvedValue([])
    coachBackend.listCoachCalendarEvents.mockResolvedValue([])
    coachBackend.listScheduledSessions.mockResolvedValue([])
    coachBackend.listCoachRoster.mockResolvedValue([])
  })

  it('retains personal calendar events when only the personal source fails later', async () => {
    render(<AthleteInPersonScheduleScreen embedded includeCoachCalendar />)
    fireEvent.click(screen.getByRole('tab', { name: /day/i }))
    await waitFor(() => {
      expect(screen.getByText(/Dentist/)).toBeInTheDocument()
    })

    athleteCalendarBackend.list.mockRejectedValueOnce(new Error('Personal events unavailable'))
    fireEvent(window, new Event('focus'))
    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent('Some calendar information could not refresh')
    })
    expect(screen.getByText(/Dentist/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /retry calendar/i })).toBeInTheDocument()
  })

  it('keeps coach appointments visible when the history source fails', async () => {
    coachBackend.listScheduledSessions.mockResolvedValue([{
      id: 'coach-1',
      business_client_id: 'bc-1',
      session_date: dateKey(new Date()),
      start_time: '12:00',
      duration_minutes: 60,
      status: 'scheduled',
    }])
    coachBackend.listAthleteScheduledSessionHistory.mockRejectedValueOnce(new Error('History offline'))
    render(<AthleteInPersonScheduleScreen embedded includeCoachCalendar />)
    fireEvent.click(screen.getByRole('tab', { name: /day/i }))
    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent('Some calendar information could not refresh')
    })
    expect(screen.getByText(/Coach Hub appointment/)).toBeInTheDocument()
  })
})
