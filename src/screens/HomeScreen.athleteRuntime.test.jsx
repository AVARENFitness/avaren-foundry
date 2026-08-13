import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import HomeScreen from './HomeScreen'
import { createNutritionState } from '../lib/nutrition'
import { buildAvaDailyBriefing } from '../lib/avaIntelligence'
import { resolveCurrentWeeklyCheckInState } from '../lib/weeklyCheckIn'
import { WEEKLY_CHECKIN_CAPABILITY_STATUS } from '../lib/weeklyCheckInCapability'
import { FROZEN_COACH_WEEK, installFrozenCoachWeek } from '../test/frozenTime'

installFrozenCoachWeek(FROZEN_COACH_WEEK)

const today = '2026-08-07'

vi.mock('../ava/useAvaUi', () => ({
  useAvaUi: () => ({ openAva: vi.fn() }),
}))

vi.mock('../hooks/useAthleteAppointments', () => ({
  useAthleteAppointments: () => ({
    status: 'ready',
    loading: false,
    ready: true,
    error: null,
    appointments: [],
    upcomingAppointments: [],
    nextAppointment: null,
    refreshAppointments: vi.fn(),
    reload: vi.fn(),
  }),
}))

vi.mock('../lib/coachBackend', () => ({
  coachBackend: {
    listAthleteAssignments: vi.fn().mockResolvedValue([]),
  },
}))

vi.mock('../components/AthleteAssignmentHome', () => ({
  default: () => null,
}))

const buildAthleteState = (overrides = {}) => ({
  selectedWorkout: null,
  activeWorkout: null,
  program: {
    nextWorkout: { name: 'Legs + Core' },
    rotation: ['Chest + Back', 'Arms', 'Legs + Core'],
    workouts: {
      'Chest + Back': [{ name: 'Bench Press', sets: 3, muscle: 'Chest' }],
      Arms: [{ name: 'Curls', sets: 3, muscle: 'Biceps' }],
      'Legs + Core': [{ name: 'Squat', sets: 3, muscle: 'Legs' }],
    },
  },
  weeklySchedule: {
    0: 'Rest',
    1: 'Chest + Back',
    2: 'Arms',
    3: 'Legs + Core',
    4: 'Chest + Back',
    5: 'Arms',
    6: 'Legs + Core',
  },
  history: [
    {
      id: 'arms-done',
      name: 'Arms',
      finishedAt: `${today}T16:00:00.000Z`,
      sets: [{ exercise: 'Curls', muscle: 'Biceps', weight: 30, reps: 10 }],
    },
  ],
  readiness: {
    entries: [
      {
        date: today,
        sleep: 4,
        energy: 4,
        soreness: 2,
        stress: 2,
        completedAt: `${today}T08:00:00.000Z`,
      },
    ],
  },
  mobility: {
    completed: [{ flowId: 'recovery-flow', completedAt: `${today}T07:00:00.000Z` }],
    durationPreferences: {},
  },
  nutrition: createNutritionState(),
  ...overrides,
})

const capabilityAvailable = {
  status: WEEKLY_CHECKIN_CAPABILITY_STATUS.AVAILABLE,
  schemaAvailable: true,
}

describe('HomeScreen athlete runtime', () => {
  it('renders completed-today state with canonical next workout using real AVA briefing', () => {
    const state = buildAthleteState()
    const briefing = buildAvaDailyBriefing(state, {
      userName: 'Jake',
      now: new Date(`${today}T18:00:00.000Z`),
      weeklyCheckInRequired: false,
    })

    expect(briefing.primaryAction?.type).not.toBe('start-workout')
    expect(String(briefing.primaryAction?.label ?? '')).not.toMatch(/Start Chest/i)

    render(
      <HomeScreen
        state={state}
        onStart={vi.fn()}
        setScreen={vi.fn()}
        recoveryIntelligence={{ score: 72 }}
        userName="Jake"
        readiness={{ completed: true, score: 80, status: 'Ready' }}
        onOpenReadiness={vi.fn()}
        onOpenMobility={vi.fn()}
        onOpenReset={vi.fn()}
        nutritionSummary={{ calories: 0, goal: 2200, protein: 0 }}
        weeklyCheckInRequired={false}
        currentWeeklyCheckInState={null}
      />,
    )

    expect(screen.getByRole('heading', { level: 2, name: 'Workout complete' })).toBeInTheDocument()
    expect(screen.getByText(/Arms · Today/)).toBeInTheDocument()
    expect(screen.getByText(/Next workout: Legs \+ Core/)).toBeInTheDocument()
    expect(screen.queryByText(/Start Chest/i)).not.toBeInTheDocument()
  })

  it('hides weekly check-in reminder when requirement is not_required', () => {
    const dueState = resolveCurrentWeeklyCheckInState({
      capability: capabilityAvailable,
      status: {
        status: 'overdue',
        weekKey: FROZEN_COACH_WEEK.weekStart,
        weekRange: FROZEN_COACH_WEEK,
        submitted: false,
      },
      loading: false,
    })

    render(
      <HomeScreen
        state={buildAthleteState()}
        onStart={vi.fn()}
        setScreen={vi.fn()}
        recoveryIntelligence={{ score: 72 }}
        userName="Jake"
        readiness={{ completed: true, score: 80, status: 'Ready' }}
        onOpenReadiness={vi.fn()}
        onOpenMobility={vi.fn()}
        onOpenReset={vi.fn()}
        nutritionSummary={{ calories: 0, goal: 2200, protein: 0 }}
        weeklyCheckInRequired={false}
        currentWeeklyCheckInState={dueState}
        onOpenWeeklyCheckIn={vi.fn()}
      />,
    )

    expect(screen.queryByRole('button', { name: 'Check In' })).not.toBeInTheDocument()
    expect(
      screen.queryByRole('button', { name: 'Complete Weekly Check-In' }),
    ).not.toBeInTheDocument()
  })

  it('shows weekly check-in reminder when requirement is required and due', () => {
    const dueState = resolveCurrentWeeklyCheckInState({
      capability: capabilityAvailable,
      status: {
        status: 'overdue',
        weekKey: FROZEN_COACH_WEEK.weekStart,
        weekRange: FROZEN_COACH_WEEK,
        submitted: false,
      },
      loading: false,
    })

    render(
      <HomeScreen
        state={buildAthleteState()}
        onStart={vi.fn()}
        setScreen={vi.fn()}
        recoveryIntelligence={{ score: 72 }}
        userName="Jake"
        readiness={{ completed: true, score: 80, status: 'Ready' }}
        onOpenReadiness={vi.fn()}
        onOpenMobility={vi.fn()}
        onOpenReset={vi.fn()}
        nutritionSummary={{ calories: 0, goal: 2200, protein: 0 }}
        weeklyCheckInRequired
        currentWeeklyCheckInState={dueState}
        onOpenWeeklyCheckIn={vi.fn()}
      />,
    )

    expect(screen.getByRole('button', { name: 'Check In' })).toBeInTheDocument()
    expect(
      screen.getByRole('button', { name: 'Complete Weekly Check-In' }),
    ).toBeInTheDocument()
  })

  it('hides weekly check-in reminder when required but current week is submitted', () => {
    const submittedState = resolveCurrentWeeklyCheckInState({
      capability: capabilityAvailable,
      status: {
        status: 'submitted',
        weekKey: FROZEN_COACH_WEEK.weekStart,
        weekRange: FROZEN_COACH_WEEK,
        submitted: true,
      },
      loading: false,
    })

    render(
      <HomeScreen
        state={buildAthleteState()}
        onStart={vi.fn()}
        setScreen={vi.fn()}
        recoveryIntelligence={{ score: 72 }}
        userName="Jake"
        readiness={{ completed: true, score: 80, status: 'Ready' }}
        onOpenReadiness={vi.fn()}
        onOpenMobility={vi.fn()}
        onOpenReset={vi.fn()}
        nutritionSummary={{ calories: 0, goal: 2200, protein: 0 }}
        weeklyCheckInRequired
        currentWeeklyCheckInState={submittedState}
        onOpenWeeklyCheckIn={vi.fn()}
      />,
    )

    expect(screen.queryByRole('button', { name: 'Check In' })).not.toBeInTheDocument()
  })

  it('uses AVAREN secondary styling for choose another workout', () => {
    const { container } = render(
      <HomeScreen
        state={buildAthleteState()}
        onStart={vi.fn()}
        setScreen={vi.fn()}
        recoveryIntelligence={{ score: 72 }}
        userName="Jake"
        readiness={{ completed: true, score: 80, status: 'Ready' }}
        onOpenReadiness={vi.fn()}
        onOpenMobility={vi.fn()}
        onOpenReset={vi.fn()}
        nutritionSummary={{ calories: 0, goal: 2200, protein: 0 }}
        weeklyCheckInRequired={false}
        currentWeeklyCheckInState={null}
      />,
    )

    const chooseButton = container.querySelector('.home-choose-workout-link')
    expect(chooseButton?.classList.contains('athlete-choose-workout-action')).toBe(true)
    expect(chooseButton?.classList.contains('ui-btn-secondary')).toBe(true)
    expect(chooseButton?.classList.contains('home-today-plan-link')).toBe(false)
  })

  it('renders safely when nextWorkout is null and there is no active program', () => {
    render(
      <HomeScreen
        state={{
          ...buildAthleteState(),
          program: null,
          history: [],
        }}
        onStart={vi.fn()}
        setScreen={vi.fn()}
        recoveryIntelligence={{ score: 72 }}
        userName="Jake"
        readiness={{ completed: false, score: null, status: 'Not logged' }}
        onOpenReadiness={vi.fn()}
        onOpenMobility={vi.fn()}
        onOpenReset={vi.fn()}
        nutritionSummary={{ calories: 0, goal: 2200, protein: 0 }}
        weeklyCheckInRequired={false}
        currentWeeklyCheckInState={null}
      />,
    )

    expect(screen.getByRole('heading', { level: 1, name: /Good morning, Jake/i })).toBeInTheDocument()
    expect(screen.queryByText(/Start Chest/i)).not.toBeInTheDocument()
  })
})
