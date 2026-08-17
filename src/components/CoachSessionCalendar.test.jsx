import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import CoachSessionCalendar from './CoachSessionCalendar'
import { coachBackend } from '../lib/coachBackend'
import { appUi } from '../lib/appUi'
import { COACH_CALENDAR_VIEW } from '../lib/coachCalendarUi'
import { addDaysKey, dateKey } from '../lib/appointmentScheduling'
import { DEFAULT_COACH_SCHEDULE_TIMEZONE } from '../lib/sessionTimezone'

vi.mock('../lib/appUi', () => ({
  appUi: {
    toast: vi.fn(),
    confirm: vi.fn(),
  },
}))

vi.mock('../lib/coachBackend', () => ({
  coachBackend: {
    listScheduledSessions: vi.fn(),
    listClientPassBalances: vi.fn(),
    getSessionPackage: vi.fn(),
    createScheduledSession: vi.fn(),
    createRecurringAppointmentSeries: vi.fn(),
  },
}))

const jake = {
  id: 'coach-client-1',
  athlete_id: 'athlete-jake',
  business_client_id: 'bc-jake',
  athlete_email: 'jake@example.com',
  coach_label: 'Jake',
}

const sarah = {
  id: 'coach-client-2',
  athlete_id: 'athlete-sarah',
  business_client_id: 'bc-sarah',
  athlete_email: 'sarah@example.com',
  coach_label: 'Sarah',
}

const buildSessionsFixture = () => {
  const todayKey = dateKey(new Date(), DEFAULT_COACH_SCHEDULE_TIMEZONE)
  const weekDayKey = addDaysKey(todayKey, 3)

  return [
    {
      id: 'today-early',
      athlete_id: 'athlete-jake',
      business_client_id: 'bc-jake',
      session_date: todayKey,
      start_time: '08:00',
      duration_minutes: 60,
      status: 'scheduled',
    },
    {
      id: 'today-late',
      athlete_id: 'athlete-sarah',
      business_client_id: 'bc-sarah',
      session_date: todayKey,
      start_time: '20:00',
      duration_minutes: 45,
      status: 'scheduled',
    },
    {
      id: 'week-day',
      athlete_id: 'athlete-jake',
      business_client_id: 'bc-jake',
      session_date: weekDayKey,
      start_time: '09:00',
      duration_minutes: 60,
      status: 'scheduled',
    },
    {
      id: 'cancelled-day',
      athlete_id: 'athlete-jake',
      business_client_id: 'bc-jake',
      session_date: addDaysKey(todayKey, 1),
      start_time: '10:00',
      duration_minutes: 60,
      status: 'cancelled',
    },
    {
      id: 'offline-day',
      athlete_id: 'offline-client',
      business_client_id: 'bc-offline',
      session_date: addDaysKey(todayKey, 1),
      start_time: '14:00',
      duration_minutes: 60,
      status: 'scheduled',
    },
  ]
}

describe('CoachSessionCalendar usability', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    coachBackend.listScheduledSessions.mockResolvedValue(buildSessionsFixture())
    coachBackend.listClientPassBalances.mockResolvedValue([])
    coachBackend.getSessionPackage.mockResolvedValue(null)
    coachBackend.createScheduledSession.mockResolvedValue({
      id: 'session-new',
      athlete_id: 'athlete-jake',
      business_client_id: 'bc-jake',
      session_date: dateKey(new Date(), DEFAULT_COACH_SCHEDULE_TIMEZONE),
      start_time: '15:00',
      duration_minutes: 60,
      status: 'scheduled',
    })
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('defaults to Today view with today agenda visible immediately', async () => {
    render(<CoachSessionCalendar clients={[jake, sarah]} assignments={[]} />)

    await waitFor(() => {
      expect(screen.getAllByTestId('coach-appointment-card')).toHaveLength(2)
    })

    expect(screen.getByTestId('coach-calendar-view-today')).toHaveAttribute(
      'aria-selected',
      'true',
    )
    expect(screen.getByText('Jake')).toBeInTheDocument()
    expect(screen.getByText('Sarah')).toBeInTheDocument()
  })

  it('opens week view in one tap and shows seven day chips with counts', async () => {
    render(<CoachSessionCalendar clients={[jake, sarah]} assignments={[]} />)

    await waitFor(() => {
      expect(screen.getByTestId('coach-calendar-view-week')).toBeInTheDocument()
    })

    fireEvent.click(screen.getByTestId('coach-calendar-view-week'))

    expect(screen.getByTestId('coach-calendar-view-week')).toHaveAttribute(
      'aria-selected',
      'true',
    )
    expect(screen.getAllByRole('tab', { name: /Open|session/i })).toHaveLength(7)
    expect(screen.getByText('2 sessions')).toBeInTheDocument()
  })

  it('returns to current local day from Today action', async () => {
    render(<CoachSessionCalendar clients={[jake, sarah]} assignments={[]} />)

    await waitFor(() => {
      expect(screen.getByLabelText('Next day')).toBeInTheDocument()
    })

    fireEvent.click(screen.getByLabelText('Next day'))
    expect(screen.getByTestId('coach-calendar-jump-today')).toBeInTheDocument()

    fireEvent.click(screen.getByTestId('coach-calendar-jump-today'))
    expect(screen.getByTestId('coach-calendar-view-today')).toHaveAttribute(
      'aria-selected',
      'true',
    )
  })

  it('keeps schedule action available', async () => {
    render(<CoachSessionCalendar clients={[jake]} assignments={[]} />)

    await waitFor(() => {
      expect(screen.getByTestId('coach-schedule-session-button')).toBeInTheDocument()
    })
  })

  it('opens canonical detail when appointment row is tapped', async () => {
    render(<CoachSessionCalendar clients={[jake, sarah]} assignments={[]} />)

    await waitFor(() => {
      expect(screen.getAllByTestId('coach-appointment-card')).toHaveLength(2)
    })

    fireEvent.click(screen.getAllByTestId('coach-appointment-card')[0])

    expect(screen.getByRole('dialog')).toBeInTheDocument()
  })

  it('preselects client when opened from client-first scheduling', async () => {
    render(
      <CoachSessionCalendar
        clients={[jake]}
        assignments={[]}
        initialClientId="athlete-jake"
        initialOpenComposer
      />,
    )

    const sheet = await screen.findByTestId('coach-schedule-session-sheet')
    expect(within(sheet).getByText('Jake')).toBeInTheDocument()
  })

  it('successful schedule submit closes sheet and refreshes calendar', async () => {
    const user = userEvent.setup()
    const onScheduleComplete = vi.fn()

    render(
      <CoachSessionCalendar
        clients={[jake]}
        assignments={[]}
        initialClientId="athlete-jake"
        initialOpenComposer
        onScheduleComplete={onScheduleComplete}
      />,
    )

    const sheet = await screen.findByTestId('coach-schedule-session-sheet')
    await user.click(
      within(sheet).getByRole('button', { name: /^save appointment$/i }),
    )

    await waitFor(() => {
      expect(coachBackend.createScheduledSession).toHaveBeenCalledTimes(1)
    })

    expect(screen.queryByTestId('coach-schedule-session-sheet')).not.toBeInTheDocument()
    expect(onScheduleComplete).toHaveBeenCalled()
    expect(appUi.toast).toHaveBeenCalledWith(expect.stringContaining('Session scheduled'), 'success')
  })

  it('shows cancelled appointments clearly in week day agenda', async () => {
    render(
      <CoachSessionCalendar
        clients={[
          jake,
          {
            ...jake,
            athlete_id: 'offline-client',
            coach_label: 'Offline Client',
          },
        ]}
        assignments={[]}
      />,
    )

    await waitFor(() => {
      expect(screen.getByTestId('coach-calendar-view-week')).toBeInTheDocument()
    })

    fireEvent.click(screen.getByTestId('coach-calendar-view-week'))

    const tomorrow = addDaysKey(
      dateKey(new Date(), DEFAULT_COACH_SCHEDULE_TIMEZONE),
      1,
    )
    const tomorrowDate = new Date(`${tomorrow}T12:00:00`)
    const weekday = tomorrowDate.toLocaleDateString([], { weekday: 'short' })
    const dayNumber = tomorrowDate.getDate()

    fireEvent.click(
      screen.getByRole('tab', { name: new RegExp(`${weekday}[\\s\\S]*${dayNumber}`, 'i') }),
    )

    expect(screen.getByText('Cancelled')).toBeInTheDocument()
    expect(screen.getByText('Offline Client')).toBeInTheDocument()
  })

  it('exports stable calendar view constants', () => {
    expect(COACH_CALENDAR_VIEW.TODAY).toBe('today')
    expect(COACH_CALENDAR_VIEW.WEEK).toBe('week')
  })

  it('creates recurring series through backend RPC when repeat is enabled', async () => {
    const user = userEvent.setup()
    coachBackend.createRecurringAppointmentSeries.mockResolvedValue({
      seriesId: 'series-1',
      materializedCount: 12,
    })

    render(
      <CoachSessionCalendar
        clients={[jake]}
        assignments={[]}
        initialClientId="athlete-jake"
        initialOpenComposer
      />,
    )

    const sheet = await screen.findByTestId('coach-schedule-session-sheet')
    fireEvent.click(within(sheet).getByRole('button', { name: /^custom$/i }))
    fireEvent.click(within(sheet).getByRole('button', { name: /^on date$/i }))

    const endDateInput = within(sheet).getByDisplayValue('')
    fireEvent.change(endDateInput, { target: { value: '2026-11-13' } })

    await user.click(
      within(sheet).getByRole('button', { name: /^save appointment$/i }),
    )

    await waitFor(() => {
      expect(coachBackend.createRecurringAppointmentSeries).toHaveBeenCalled()
    })
    expect(coachBackend.createScheduledSession).not.toHaveBeenCalled()
  })
})
