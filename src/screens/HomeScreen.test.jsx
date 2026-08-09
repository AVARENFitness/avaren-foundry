import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import HomeScreen from './HomeScreen'
import {
  CURRENT_WEEKLY_CHECK_IN_UI_STATUS,
  resolveCurrentWeeklyCheckInState,
  WEEKLY_CHECK_IN_STATUS,
} from '../lib/weeklyCheckIn'
import { buildNotifications, dismissNotification, NOTIFICATION_TYPES } from '../lib/notifications'
import {
  WEEKLY_CHECKIN_CAPABILITY_STATUS,
} from '../lib/weeklyCheckInCapability'
import { createNutritionState } from '../lib/nutrition'

vi.mock('../ava/useAvaUi', () => ({
  useAvaUi: () => ({ openAva: vi.fn() }),
}))

vi.mock('../lib/coachBackend', () => ({
  coachBackend: {
    listAthleteAssignments: vi.fn().mockResolvedValue([]),
  },
}))

vi.mock('../components/AthleteAssignmentHome', () => ({
  default: () => null,
}))

vi.mock('../components/AvaDailyBriefing', () => ({
  default: ({ briefing }) => (
    <section aria-label="AVA briefing">{briefing?.headline}</section>
  ),
}))

vi.mock('../lib/avaIntelligence', () => ({
  buildAvaDailyBriefing: () => ({
    greeting: 'Good evening',
    headline: 'Chest + Back is up.',
    summary: 'Start when you are ready.',
    primaryAction: null,
    secondaryAction: null,
    watchItem: null,
    evidence: [],
  }),
}))

const baseState = {
  program: { nextWorkout: { name: 'Chest + Back' } },
  activeWorkout: null,
  history: [],
  weeklySchedule: {
    0: 'Rest',
    1: 'Chest + Back',
    2: 'Arms',
    3: 'Legs + Core',
    4: 'Chest + Back',
    5: 'Arms',
    6: 'Legs + Core',
  },
  mobility: { completed: [], durationPreferences: {} },
  readiness: { entries: [], lastPromptedDate: null },
  nutrition: createNutritionState(),
}

const capabilityAvailable = {
  status: WEEKLY_CHECKIN_CAPABILITY_STATUS.AVAILABLE,
  schemaAvailable: true,
}

const dueStatus = {
  status: WEEKLY_CHECK_IN_STATUS.OVERDUE,
  weekKey: '2026-08-03',
  weekRange: { weekStart: '2026-08-03', weekEnd: '2026-08-09' },
  submitted: false,
}

const submittedStatus = {
  status: WEEKLY_CHECK_IN_STATUS.SUBMITTED,
  weekKey: '2026-08-03',
  weekRange: { weekStart: '2026-08-03', weekEnd: '2026-08-09' },
  submitted: true,
}

const dueCanonical = resolveCurrentWeeklyCheckInState({
  capability: capabilityAvailable,
  status: dueStatus,
  loading: false,
})

const submittedCanonical = resolveCurrentWeeklyCheckInState({
  capability: capabilityAvailable,
  status: submittedStatus,
  loading: false,
})

const loadingCanonical = {
  status: CURRENT_WEEKLY_CHECK_IN_UI_STATUS.LOADING,
  weekStart: '2026-08-03',
  weekEnd: '2026-08-09',
  weekKey: '2026-08-03',
  due: false,
  submitted: false,
  loading: true,
}

const renderHome = (props = {}) =>
  render(
    <HomeScreen
      state={baseState}
      onStart={vi.fn()}
      setScreen={vi.fn()}
      recoveryIntelligence={{ score: 72 }}
      userName="Jacob"
      readiness={{ completed: false }}
      onOpenReadiness={vi.fn()}
      onOpenMobility={vi.fn()}
      onOpenReset={vi.fn()}
      nutritionSummary={{ calories: 0, goal: 2200, protein: 0 }}
      {...props}
    />,
  )

describe('HomeScreen weekly check-in discoverability', () => {
  it('renders Home without weekly check-in state pre-migration', () => {
    renderHome({ currentWeeklyCheckInState: null })

    expect(screen.getByRole('heading', { level: 1 })).toBeInTheDocument()
    expect(screen.queryByText(/WEEKLY CHECK-IN/i)).not.toBeInTheDocument()
  })

  it('shows notification and Home reminder when weekly check-in is due', () => {
    renderHome({
      currentWeeklyCheckInState: dueCanonical,
      onOpenWeeklyCheckIn: vi.fn(),
    })

    const notifications = buildNotifications({
      ...baseState,
      weeklyCheckInState: dueCanonical,
      weeklyCheckInCapability: capabilityAvailable,
      notifications: { read: [], dismissed: [], actedOn: [] },
    })

    expect(
      notifications.some(
        (notification) => notification.type === NOTIFICATION_TYPES.WEEKLY_CHECKIN,
      ),
    ).toBe(true)
    expect(
      screen.getByRole('button', { name: 'Check In' }),
    ).toBeInTheDocument()
    expect(
      screen.getByText(/Give your coach a quick read on your week/i),
    ).toBeInTheDocument()
  })

  it('keeps Home reminder visible after notification dismiss', () => {
    const fingerprint = `weekly-checkin:${dueStatus.weekKey}`
    const dismissed = buildNotifications({
      ...baseState,
      weeklyCheckInState: dueCanonical,
      weeklyCheckInCapability: capabilityAvailable,
      notifications: dismissNotification(
        { read: [], dismissed: [], actedOn: [] },
        { fingerprint },
      ),
    })

    expect(
      dismissed.some(
        (notification) => notification.type === NOTIFICATION_TYPES.WEEKLY_CHECKIN,
      ),
    ).toBe(false)

    renderHome({
      currentWeeklyCheckInState: dueCanonical,
      onOpenWeeklyCheckIn: vi.fn(),
    })

    expect(
      screen.getByRole('button', { name: 'Check In' }),
    ).toBeInTheDocument()
  })

  it('hides weekly reminder while status is loading', () => {
    renderHome({ currentWeeklyCheckInState: loadingCanonical })

    expect(
      screen.queryByText(/WEEKLY CHECK-IN/i),
    ).not.toBeInTheDocument()
    expect(
      screen.queryByRole('button', { name: 'Check In' }),
    ).not.toBeInTheDocument()
  })

  it('hides Home due reminder after submission and clears notification', () => {
    renderHome({ currentWeeklyCheckInState: submittedCanonical })

    expect(
      screen.queryByRole('button', { name: 'Check In' }),
    ).not.toBeInTheDocument()

    const notifications = buildNotifications({
      ...baseState,
      weeklyCheckInState: submittedCanonical,
      weeklyCheckInCapability: capabilityAvailable,
      notifications: { read: [], dismissed: [], actedOn: [] },
    })

    expect(
      notifications.some(
        (notification) => notification.type === NOTIFICATION_TYPES.WEEKLY_CHECKIN,
      ),
    ).toBe(false)
  })

  it('shows temporary confirmation without a permanent completed card', () => {
    renderHome({
      currentWeeklyCheckInState: submittedCanonical,
      weeklyCheckInConfirmation: true,
    })

    expect(screen.getByRole('status')).toHaveTextContent(/Weekly check-in sent/i)
    expect(screen.queryByText(/Your weekly update is with your coach/i)).not.toBeInTheDocument()
  })

  it('renders daily readiness and weekly check-in reminders without conflation', () => {
    renderHome({
      currentWeeklyCheckInState: dueCanonical,
      readiness: { completed: false },
      onOpenWeeklyCheckIn: vi.fn(),
    })

    expect(screen.getByText(/DAILY READINESS/i)).toBeInTheDocument()
    expect(screen.getByText(/How are you today/i)).toBeInTheDocument()
    expect(screen.getByText(/WEEKLY CHECK-IN/i)).toBeInTheDocument()
    expect(
      screen.getByText(/Give your coach a quick read on your week/i),
    ).toBeInTheDocument()
  })

  it('does not emit weekly check-in notifications when schema is unavailable', () => {
    const notifications = buildNotifications({
      history: [],
      readiness: { entries: [], lastPromptedDate: null },
      weeklyCheckInState: dueCanonical,
      weeklyCheckInCapability: {
        status: WEEKLY_CHECKIN_CAPABILITY_STATUS.UNAVAILABLE,
        schemaAvailable: false,
      },
      notifications: { read: [], dismissed: [], actedOn: [] },
    })

    expect(
      notifications.some((notification) => notification.type === 'weekly-checkin'),
    ).toBe(false)
  })
})
