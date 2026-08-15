import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import CoachBuildHub from './CoachBuildHub'
import CoachShell from '../CoachShell'
import CoachScreen from '../../screens/CoachScreen'
import CoachPrograms from '../CoachPrograms'
import { coachBackend } from '../../lib/coachBackend'
import { assignmentNotificationBackend } from '../../lib/assignmentNotifications'
import { COACH_SCREENS } from '../../lib/coachNavigation'

vi.mock('../../lib/coachBackend', () => ({
  coachBackend: {
    listCoachRoster: vi.fn(),
    listCoachInvitations: vi.fn(),
    listCoachAssignments: vi.fn(),
    listWorkoutTemplates: vi.fn(),
    listPrograms: vi.fn(),
    saveProgram: vi.fn(),
    deleteProgram: vi.fn(),
    assignProgram: vi.fn(),
    deleteWorkoutTemplate: vi.fn(),
    getClientNotes: vi.fn().mockResolvedValue({ notes: '', updated_at: null }),
  },
}))

vi.mock('../../lib/assignmentNotifications', () => ({
  assignmentNotificationBackend: {
    deliveryForAssignments: vi.fn().mockResolvedValue([]),
  },
}))

vi.mock('../../lib/identityCapabilities', () => ({
  probeIdentityCapabilities: vi.fn().mockResolvedValue({ coachClientLabels: false }),
  getIdentityCapabilities: vi.fn().mockReturnValue({ coachClientLabels: false }),
}))

vi.mock('../../hooks/useCoachPortfolio', () => ({
  useCoachPortfolio: () => ({
    portfolio: null,
    portfolioLoading: false,
    portfolioError: '',
    refreshPortfolio: vi.fn(),
    athleteStatesById: {},
    weeklyReviewsByAthleteId: {},
    passAvaContextByBusinessClientId: {},
  }),
}))

vi.mock('../../screens/CoachClientProfile', () => ({
  default: ({ onBuildWorkout, onAssignWorkout, onAssignProgram }) => (
    <div data-testid="coach-client-profile-mock">
      <button type="button" onClick={onAssignWorkout}>
        Assign Workout
      </button>
      <button type="button" onClick={onBuildWorkout}>
        Build New Workout
      </button>
      <button type="button" onClick={onAssignProgram} data-testid="coach-client-assign-program">
        Assign Program
      </button>
    </div>
  ),
}))

vi.mock('../CoachWorkoutDesigner', () => ({
  default: ({ initialClientId = '' }) => (
    <div data-testid="coach-workout-designer" data-client-id={initialClientId}>
      Workout designer
    </div>
  ),
}))

vi.mock('../coach/CoachCommandCenter', () => ({
  default: ({ rosterOnly = false }) => (
    <div data-testid={rosterOnly ? 'coach-clients-roster' : 'coach-command-center'} />
  ),
}))

vi.mock('../CoachSessionCalendar', () => ({
  default: () => <div data-testid="coach-calendar">Calendar</div>,
}))

const jake = {
  id: 'bc-jake',
  business_client_id: 'bc-jake',
  athlete_id: 'athlete-jake',
  athlete_email: 'jake@example.com',
  status: 'active',
}

describe('CoachBuildHub', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('1. coach nav exposes Build', () => {
    render(
      <CoachShell screen="build" setScreen={vi.fn()} coachName="Coach Jake" onExit={vi.fn()}>
        <div>Build content</div>
      </CoachShell>,
    )

    expect(screen.getByRole('button', { name: /^Build$/i })).toBeInTheDocument()
  })

  it('2. Build exposes Workouts', () => {
    render(
      <CoachBuildHub
        view="home"
        onViewChange={vi.fn()}
        clients={[jake]}
        templates={[]}
        assignments={[]}
        program={{ workouts: {} }}
      />,
    )

    expect(screen.getByTestId('coach-build-workouts-entry')).toBeInTheDocument()
  })

  it('3. Build exposes Programs', () => {
    render(
      <CoachBuildHub
        view="home"
        onViewChange={vi.fn()}
        clients={[jake]}
        templates={[]}
        assignments={[]}
        program={{ workouts: {} }}
      />,
    )

    expect(screen.getByTestId('coach-build-programs-entry')).toBeInTheDocument()
  })

  it('4. New Workout opens the canonical workout designer', async () => {
    coachBackend.listCoachRoster.mockResolvedValue([jake])
    coachBackend.listCoachInvitations.mockResolvedValue([])
    coachBackend.listCoachAssignments.mockResolvedValue([])
    coachBackend.listWorkoutTemplates.mockResolvedValue([])

    render(
      <CoachScreen
        workspace={{}}
        setWorkspace={vi.fn()}
        screen={COACH_SCREENS.BUILD}
        selectedClient={null}
        setSelectedClient={vi.fn()}
      />,
    )

    await waitFor(() => {
      expect(screen.getByTestId('coach-build-hub')).toBeInTheDocument()
    })

    fireEvent.click(screen.getByTestId('coach-build-workouts-entry'))
    fireEvent.click(screen.getByTestId('coach-new-workout'))

    expect(screen.getByTestId('coach-workout-designer')).toBeInTheDocument()
  })

  it('5. New Program opens Program Builder', async () => {
    coachBackend.listPrograms.mockResolvedValue([])

    render(
      <CoachShell screen="build" setScreen={vi.fn()} coachName="Coach Jake" onExit={vi.fn()}>
        <CoachBuildHub
          view="programs"
          onViewChange={vi.fn()}
          clients={[jake]}
          templates={[]}
          assignments={[]}
          program={{ workouts: {} }}
          onRefresh={vi.fn()}
        />
      </CoachShell>,
    )

    fireEvent.click(screen.getByRole('button', { name: /New Program/i }))

    await waitFor(() => {
      expect(screen.getByTestId('coach-program-builder')).toBeInTheDocument()
    })
  })

  it('6. workout builder no longer requires visiting Assignments', async () => {
    coachBackend.listCoachRoster.mockResolvedValue([jake])
    coachBackend.listCoachInvitations.mockResolvedValue([])
    coachBackend.listCoachAssignments.mockResolvedValue([])
    coachBackend.listWorkoutTemplates.mockResolvedValue([])

    render(
      <CoachScreen
        workspace={{}}
        setWorkspace={vi.fn()}
        screen={COACH_SCREENS.BUILD}
        selectedClient={null}
        setSelectedClient={vi.fn()}
      />,
    )

    await waitFor(() => {
      expect(screen.getByTestId('coach-build-hub')).toBeInTheDocument()
    })

    fireEvent.click(screen.getByTestId('coach-build-workouts-entry'))
    expect(screen.getByTestId('coach-build-workouts')).toBeInTheDocument()
    expect(screen.queryByText(/Assignments/i)).not.toBeInTheDocument()
  })

  it('10. program builder can select existing workouts', async () => {
    coachBackend.listPrograms.mockResolvedValue([])

    render(
      <CoachPrograms
        clients={[jake]}
        templates={[
          {
            id: 'template-1',
            name: 'Upper Body',
            workout_payload: { exercises: [{ name: 'Bench Press' }] },
          },
        ]}
        program={{ workouts: {} }}
        onRefresh={vi.fn()}
        embedded
        onBack={vi.fn()}
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: /New Program/i }))

    await waitFor(() => {
      expect(screen.getByTestId('coach-program-builder')).toBeInTheDocument()
    })

    expect(screen.getByRole('option', { name: 'Upper Body' })).toBeInTheDocument()
  })

  it('11. program builder can initiate workout creation inline', async () => {
    const onCreateWorkout = vi.fn()
    coachBackend.listPrograms.mockResolvedValue([])

    render(
      <CoachPrograms
        clients={[jake]}
        templates={[]}
        program={{ workouts: {} }}
        onRefresh={vi.fn()}
        embedded
        onBack={vi.fn()}
        onCreateWorkout={onCreateWorkout}
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: /New Program/i }))

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /Create workout/i })).toBeInTheDocument()
    })

    fireEvent.click(screen.getByRole('button', { name: /Create workout/i }))
    expect(onCreateWorkout).toHaveBeenCalled()
    expect(screen.getByTestId('coach-program-builder')).toBeInTheDocument()
  })

  it('12. delete-day button is accessible and scoped', async () => {
    coachBackend.listPrograms.mockResolvedValue([])

    render(<CoachPrograms clients={[]} templates={[]} program={{ workouts: {} }} onRefresh={vi.fn()} />)

    fireEvent.click(screen.getByRole('button', { name: /New Program/i }))

    await waitFor(() => {
      expect(screen.getByLabelText('Remove day 1')).toBeInTheDocument()
    })
  })

  it('legacy assignments screen redirects to Build workouts view', async () => {
    coachBackend.listCoachRoster.mockResolvedValue([jake])
    coachBackend.listCoachInvitations.mockResolvedValue([])
    coachBackend.listCoachAssignments.mockResolvedValue([])
    coachBackend.listWorkoutTemplates.mockResolvedValue([])
    const onNavigateCoachScreen = vi.fn()

    render(
      <CoachScreen
        workspace={{}}
        setWorkspace={vi.fn()}
        screen="assignments"
        selectedClient={null}
        setSelectedClient={vi.fn()}
        onNavigateCoachScreen={onNavigateCoachScreen}
      />,
    )

    await waitFor(() => {
      expect(onNavigateCoachScreen).toHaveBeenCalledWith(COACH_SCREENS.BUILD)
      expect(screen.getByTestId('coach-build-workouts')).toBeInTheDocument()
    })
  })
})

describe('CoachScreen client training shortcuts', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    coachBackend.listCoachRoster.mockResolvedValue([jake])
    coachBackend.listCoachInvitations.mockResolvedValue([])
    coachBackend.listCoachAssignments.mockResolvedValue([])
    coachBackend.listWorkoutTemplates.mockResolvedValue([])
    assignmentNotificationBackend.deliveryForAssignments.mockResolvedValue([])
  })

  it('1-3. client training exposes workout and program actions', async () => {
    render(
      <CoachScreen
        workspace={{}}
        setWorkspace={vi.fn()}
        screen={COACH_SCREENS.CLIENTS}
        selectedClient={jake}
        setSelectedClient={vi.fn()}
      />,
    )

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /Assign Workout/i })).toBeInTheDocument()
      expect(screen.getByRole('button', { name: /Build New Workout/i })).toBeInTheDocument()
      expect(screen.getByTestId('coach-client-assign-program')).toBeInTheDocument()
    })
  })

  it('7-9. client training actions preserve client context in designer', async () => {
    render(
      <CoachScreen
        workspace={{}}
        setWorkspace={vi.fn()}
        screen={COACH_SCREENS.CLIENTS}
        selectedClient={jake}
        setSelectedClient={vi.fn()}
      />,
    )

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /Build New Workout/i })).toBeInTheDocument()
    })

    fireEvent.click(screen.getByRole('button', { name: /Build New Workout/i }))

    expect(screen.getByTestId('coach-workout-designer')).toHaveAttribute(
      'data-client-id',
      'athlete-jake',
    )
  })

  it('4. Assign Program opens client program flow', async () => {
    coachBackend.listPrograms.mockResolvedValue([])

    render(
      <CoachScreen
        workspace={{}}
        setWorkspace={vi.fn()}
        screen={COACH_SCREENS.CLIENTS}
        selectedClient={jake}
        setSelectedClient={vi.fn()}
      />,
    )

    await waitFor(() => {
      expect(screen.getByTestId('coach-client-assign-program')).toBeInTheDocument()
    })

    fireEvent.click(screen.getByTestId('coach-client-assign-program'))

    await waitFor(() => {
      expect(screen.getByTestId('coach-client-program-assign')).toBeInTheDocument()
    })
  })
})

describe('CoachShell regression guards', () => {
  it('16-18. athlete switch, calendar tab, and build tab remain available', () => {
    render(
      <CoachShell screen="build" setScreen={vi.fn()} coachName="Coach Jake" onExit={vi.fn()}>
        <div>Build</div>
      </CoachShell>,
    )

    expect(screen.getByRole('button', { name: /Athlete App/i })).toBeVisible()
    expect(screen.getByRole('button', { name: /^Calendar$/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /^Today$/i })).toBeInTheDocument()
  })
})
