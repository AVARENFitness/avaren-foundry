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
    listCoachCalendarEvents: vi.fn(),
    createCoachCalendarEvent: vi.fn(),
    deleteCoachCalendarEvent: vi.fn(),
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

const offlineClient = {
  id: 'bc-offline',
  business_client_id: 'bc-offline',
  businessClientId: 'bc-offline',
  linked_user_id: null,
  athlete_id: null,
  first_name: 'Offline',
  last_name: 'Client',
  display_name: 'Offline Client',
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
      athlete_id: null,
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
    // Mid-week fixed clock keeps today+1 / today+3 inside the Mon–Sun week strip.
    // Fake only Date so waitFor / promises keep working.
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date('2026-09-02T16:00:00.000Z')) // Wed in America/New_York
    vi.clearAllMocks()
    coachBackend.listScheduledSessions.mockResolvedValue(buildSessionsFixture())
    coachBackend.listCoachCalendarEvents.mockResolvedValue([])
    coachBackend.createCoachCalendarEvent.mockResolvedValue({
      id: 'private-1',
      coach_id: 'coach-1',
      title: 'Admin block',
      event_date: dateKey(new Date(), DEFAULT_COACH_SCHEDULE_TIMEZONE),
      start_time: '11:00',
      duration_minutes: 60,
      category: 'admin',
      status: 'scheduled',
    })
    coachBackend.deleteCoachCalendarEvent.mockResolvedValue({})
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

  it('defaults to Month view for a broad schedule picture', async () => {
    render(<CoachSessionCalendar clients={[jake, sarah]} assignments={[]} />)

    await waitFor(() => {
      expect(screen.getByTestId('coach-calendar-month-grid')).toBeInTheDocument()
    })

    expect(screen.getByTestId('coach-calendar-view-month')).toHaveAttribute(
      'aria-selected',
      'true',
    )
    expect(screen.getByText('Jake')).toBeInTheDocument()
    expect(screen.getByText('Sarah')).toBeInTheDocument()
  })

  it('opens week view in one tap and shows a seven-day schedule board', async () => {
    render(<CoachSessionCalendar clients={[jake, sarah]} assignments={[]} />)

    await waitFor(() => {
      expect(screen.getByTestId('coach-calendar-view-week')).toBeInTheDocument()
    })

    fireEvent.click(screen.getByTestId('coach-calendar-view-week'))

    expect(screen.getByTestId('coach-calendar-view-week')).toHaveAttribute(
      'aria-selected',
      'true',
    )
    expect(screen.getByTestId('coach-calendar-week-grid')).toBeInTheDocument()
    expect(screen.getAllByText(/Open|item/i).length).toBeGreaterThanOrEqual(7)
  })

  it('drills from a month date into the Day view', async () => {
    render(<CoachSessionCalendar clients={[jake, sarah]} assignments={[]} />)

    await waitFor(() => {
      expect(screen.getByTestId('coach-calendar-month-grid')).toBeInTheDocument()
    })

    const todayKey = dateKey(new Date(), DEFAULT_COACH_SCHEDULE_TIMEZONE)
    const todayDate = new Date(`${todayKey}T12:00:00`)
    const label = todayDate.toLocaleDateString([], {
      weekday: 'long',
      month: 'short',
      day: 'numeric',
    })

    fireEvent.click(
      screen.getByRole('button', {
        name: new RegExp(label, 'i'),
      }),
    )

    expect(screen.getByTestId('coach-calendar-view-day')).toHaveAttribute(
      'aria-selected',
      'true',
    )
  })

  it('returns to today without changing the selected calendar zoom', async () => {
    render(<CoachSessionCalendar clients={[jake, sarah]} assignments={[]} />)

    fireEvent.click(screen.getByTestId('coach-calendar-view-day'))

    await waitFor(() => {
      expect(screen.getByLabelText('Next day')).toBeInTheDocument()
    })

    fireEvent.click(screen.getByLabelText('Next day'))
    fireEvent.click(screen.getByTestId('coach-calendar-jump-today'))

    expect(screen.getByTestId('coach-calendar-view-day')).toHaveAttribute(
      'aria-selected',
      'true',
    )
  })

  it('renders the unified full-width calendar command bar', async () => {
    render(<CoachSessionCalendar clients={[jake]} assignments={[]} />)

    expect(document.querySelector('.coach-calendar-command-bar')).not.toBeNull()
    expect(screen.getByTestId('coach-calendar-view-month')).toBeInTheDocument()
    expect(screen.getByText(/October|November|December|January|February|March|April|May|June|July|August|September/i)).toBeInTheDocument()
    expect(screen.getByTestId('coach-calendar-jump-today')).toBeInTheDocument()
    expect(screen.getByTestId('coach-calendar-add-trigger')).toBeInTheDocument()
  })

  it('uses one Add menu for personal training and private events', async () => {
    const user = userEvent.setup()
    render(<CoachSessionCalendar clients={[jake]} assignments={[]} />)

    const addButton = await screen.findByTestId('coach-calendar-add-trigger')
    expect(screen.queryByText('Client appointment')).not.toBeInTheDocument()

    await user.click(addButton)

    expect(screen.getByTestId('coach-add-personal-training')).toBeInTheDocument()
    expect(screen.getByTestId('coach-add-private-event-button')).toBeInTheDocument()

    await user.click(screen.getByTestId('coach-add-personal-training'))

    const sheet = await screen.findByTestId('coach-schedule-session-sheet')
    expect(
      within(sheet).getByRole('heading', { name: /personal training/i }),
    ).toBeInTheDocument()
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

  it('schedules a true non-app client using business client identity', async () => {
    const user = userEvent.setup()
    coachBackend.createScheduledSession.mockResolvedValue({
      id: 'session-offline',
      athlete_id: null,
      business_client_id: 'bc-offline',
      session_date: dateKey(new Date(), DEFAULT_COACH_SCHEDULE_TIMEZONE),
      start_time: '15:00',
      duration_minutes: 60,
      status: 'scheduled',
    })

    render(
      <CoachSessionCalendar
        clients={[offlineClient]}
        assignments={[]}
        initialClientId="bc-offline"
        initialOpenComposer
      />,
    )

    const sheet = await screen.findByTestId('coach-schedule-session-sheet')
    expect(within(sheet).getByText('Offline Client')).toBeInTheDocument()

    await user.click(
      within(sheet).getByRole('button', { name: /^save appointment$/i }),
    )

    await waitFor(() => {
      expect(coachBackend.createScheduledSession).toHaveBeenCalledWith(
        expect.objectContaining({
          athleteId: null,
          businessClientId: 'bc-offline',
        }),
      )
    })
  })

  it('shows private coach events alongside client appointments', async () => {
    const todayKey = dateKey(new Date(), DEFAULT_COACH_SCHEDULE_TIMEZONE)
    coachBackend.listCoachCalendarEvents.mockResolvedValue([
      {
        id: 'private-admin',
        coach_id: 'coach-1',
        title: 'Admin block',
        event_date: todayKey,
        start_time: '11:00',
        duration_minutes: 60,
        category: 'admin',
        status: 'scheduled',
      },
    ])

    render(<CoachSessionCalendar clients={[jake, sarah]} assignments={[]} />)

    await waitFor(() => {
      expect(screen.getByText(/Admin block/i)).toBeInTheDocument()
    })

    expect(screen.getByText('Private')).toBeInTheDocument()
    expect(screen.getAllByTestId('coach-appointment-card')).toHaveLength(2)
    expect(screen.getByTestId('coach-private-calendar-event')).toBeInTheDocument()
  })

  it('creates a private event without creating an athlete appointment', async () => {
    const user = userEvent.setup()

    render(<CoachSessionCalendar clients={[jake]} assignments={[]} />)

    const addButton = await screen.findByTestId('coach-calendar-add-trigger')
    await user.click(addButton)
    await user.click(screen.getByTestId('coach-add-private-event-button'))
    const sheet = await screen.findByTestId('coach-calendar-event-sheet')

    await user.type(
      within(sheet).getByPlaceholderText(/Admin work, appointment, lunch/i),
      'Doctor appointment',
    )
    await user.click(
      within(sheet).getByRole('button', { name: /add to calendar/i }),
    )

    await waitFor(() => {
      expect(coachBackend.createCoachCalendarEvent).toHaveBeenCalledWith(
        expect.objectContaining({
          title: 'Doctor appointment',
          category: 'personal',
        }),
      )
    })

    expect(coachBackend.createScheduledSession).not.toHaveBeenCalled()
    expect(appUi.toast).toHaveBeenCalledWith(
      'Private calendar event added.',
      'success',
    )
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
    const todayKey = dateKey(new Date(), DEFAULT_COACH_SCHEDULE_TIMEZONE)
    const agendaDayKey = addDaysKey(todayKey, 1)
    const agendaDay = new Date(`${agendaDayKey}T12:00:00`)
    const weekday = agendaDay.toLocaleDateString([], { weekday: 'short' })
    const dayNumber = agendaDay.getDate()

    render(
      <CoachSessionCalendar
        clients={[jake, offlineClient]}
        assignments={[]}
      />,
    )

    await waitFor(() => {
      expect(screen.getByTestId('coach-calendar-view-week')).toBeInTheDocument()
    })

    fireEvent.click(screen.getByTestId('coach-calendar-view-week'))

    fireEvent.click(
      screen.getByRole('tab', {
        name: new RegExp(`${weekday}[\\s\\S]*${dayNumber}`, 'i'),
      }),
    )

    expect(screen.getByText('Cancelled')).toBeInTheDocument()
    expect(screen.getByText('Offline Client')).toBeInTheDocument()
  })

  it('exports stable calendar zoom levels', () => {
    expect(COACH_CALENDAR_VIEW.MONTH).toBe('month')
    expect(COACH_CALENDAR_VIEW.WEEK).toBe('week')
    expect(COACH_CALENDAR_VIEW.DAY).toBe('day')
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
