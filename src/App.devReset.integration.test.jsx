import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import App from './App'
import AppUiProvider from './components/ui/AppUiProvider'
import { AvaProvider } from './ava/AvaContext'
import ErrorBoundary from './components/ErrorBoundary'
import { getCoachWeekRange } from './lib/weeklyReview'
import { STATE_SCHEMA_VERSION } from './lib/stateSchema'
import { createNutritionState } from './lib/nutrition'

const now = new Date('2026-08-07T12:00:00.000Z')

const {
  mockSession,
  mockSupabaseFrom,
  mockSupabaseRpc,
  weekRange,
  buildSubmittedRow,
  setCurrentWeeklyCheckInRow,
} = vi.hoisted(() => {
  const weekRange = {
    weekStart: '2026-08-03',
    weekEnd: '2026-08-09',
  }
  const mockSession = {
    user: {
      id: 'athlete-integration',
      email: 'athlete@test.com',
      user_metadata: { display_name: 'Integration Athlete' },
    },
  }

  let currentWeeklyCheckInRow = null

  const buildSubmittedRow = () => ({
    athlete_id: 'athlete-integration',
    week_start: weekRange.weekStart,
    week_end: weekRange.weekEnd,
    training_rating: 4,
    recovery_rating: 4,
    nutrition_rating: 4,
    pain_or_issue: 'no_issues',
    pain_note: '',
    weekly_win: '',
    coach_note: '',
    status: 'submitted',
    submitted_at: `${weekRange.weekStart}T18:00:00.000Z`,
    updated_at: `${weekRange.weekStart}T18:00:00.000Z`,
  })

  currentWeeklyCheckInRow = buildSubmittedRow()

  const createBuilder = (table) => {
    let op = 'select'

    const resolve = async () => {
      if (op === 'delete' && table === 'athlete_weekly_check_ins') {
        currentWeeklyCheckInRow = null
        return { data: null, error: null }
      }

      if (table === 'athlete_weekly_check_ins') {
        return { data: currentWeeklyCheckInRow, error: null }
      }

      if (table === 'coach_clients') {
        return { data: [{ coach_id: 'coach-1' }], error: null }
      }

      if (table === 'foundry_state') {
        return { data: null, error: null }
      }

      return { data: null, error: null }
    }

    const builder = {
      select: vi.fn(() => {
        op = 'select'
        return builder
      }),
      delete: vi.fn(() => {
        op = 'delete'
        return builder
      }),
      eq: vi.fn(() => builder),
      in: vi.fn(() => builder),
      limit: vi.fn(() => builder),
      order: vi.fn(() => builder),
      upsert: vi.fn(() => builder),
      maybeSingle: vi.fn(resolve),
      single: vi.fn(resolve),
      then(onFulfilled, onRejected) {
        return resolve().then(onFulfilled, onRejected)
      },
    }

    return builder
  }

  const mockSupabaseFrom = vi.fn((table) => createBuilder(table))
  const mockSupabaseRpc = vi.fn(async (name) => {
    if (name === 'get_athlete_coaching_requirements') {
      return {
        data: { weekly_check_in: 'required' },
        error: null,
      }
    }

    if (name !== 'dev_reset_current_weekly_check_in') {
      return { data: null, error: null }
    }

    const rowExistedBefore = Boolean(currentWeeklyCheckInRow)
    currentWeeklyCheckInRow = null
    return {
      data: {
        week_start: weekRange.weekStart,
        week_end: weekRange.weekEnd,
        row_existed_before: rowExistedBefore,
        rows_affected: rowExistedBefore ? 1 : 0,
        row_exists_after: false,
        deleted: rowExistedBefore,
      },
      error: null,
    }
  })

  return {
    mockSession,
    mockSupabaseFrom,
    mockSupabaseRpc,
    weekRange,
    buildSubmittedRow,
    setCurrentWeeklyCheckInRow: (row) => {
      currentWeeklyCheckInRow = row
    },
  }
})

vi.mock('./lib/supabase', () => ({
  isSupabaseConfigured: true,
  supabase: {
    auth: {
      getSession: vi.fn(async () => ({
        data: { session: mockSession },
        error: null,
      })),
      onAuthStateChange: vi.fn(() => ({
        data: { subscription: { unsubscribe: vi.fn() } },
      })),
      getUser: vi.fn(async () => ({
        data: { user: mockSession.user },
        error: null,
      })),
      signOut: vi.fn(async () => ({ error: null })),
    },
    from: (...args) => mockSupabaseFrom(...args),
    rpc: (...args) => mockSupabaseRpc(...args),
  },
}))

vi.mock('./lib/storage', () => ({
  loadState: vi.fn(() => null),
  saveState: vi.fn(),
  exportState: vi.fn(),
  importState: vi.fn(),
  clearState: vi.fn(),
  lastBackupAt: vi.fn(() => null),
  normalizeAppState: vi.fn((state) => state),
}))

vi.mock('./lib/cloudSync', () => ({
  loadCloudState: vi.fn(async () => null),
  saveCloudState: vi.fn(async () => new Date().toISOString()),
  chooseNewestState: vi.fn(({ localState }) => ({
    state: localState,
    source: 'local',
  })),
}))

vi.mock('./lib/pushNotifications', () => ({
  registerPushWorker: vi.fn(async () => {}),
  syncPushSubscription: vi.fn(async () => {}),
  deactivatePushSubscriptionForDevice: vi.fn(async () => {}),
}))

vi.mock('./lib/assignmentNotifications', () => ({
  assignmentNotificationBackend: {
    list: vi.fn(async () => []),
    markRead: vi.fn(async () => {}),
    subscribe: vi.fn(() => () => {}),
  },
  mapAssignmentNotification: vi.fn(),
}))

vi.mock('./lib/nutritionBackend', () => ({
  nutritionBackend: {
    syncProfile: vi.fn(async () => {}),
    syncDay: vi.fn(async () => {}),
  },
}))

vi.mock('./lib/userProfileBackend', () => ({
  userProfileBackend: {
    getUserProfile: vi.fn(async () => null),
    updateOwnUserProfile: vi.fn(async (draft) => draft),
    ensureOwnUserProfileFromSession: vi.fn(async () => {}),
  },
  profileSeedFromAuthUser: vi.fn(() => ({
    first_name: '',
    last_name: '',
    preferred_name: '',
  })),
  sanitizeOwnProfileDraft: vi.fn((draft) => draft),
}))

vi.mock('./lib/identityCapabilities', () => ({
  probeIdentityCapabilities: vi.fn(async () => ({ userProfiles: false })),
}))

vi.mock('./lib/coachBackend', () => ({
  coachBackend: {
    listAthleteAssignments: vi.fn(async () => []),
    listAthleteSchedule: vi.fn(async () => []),
    listAthleteScheduledSessions: vi.fn(async () => []),
    listClients: vi.fn(async () => []),
    listInvitations: vi.fn(async () => []),
  },
}))

vi.mock('./components/AthleteAssignmentHome', () => ({
  default: () => null,
}))

vi.mock('./components/AthleteScheduledSessions', () => ({
  default: () => null,
  respondToSessionRsvpFromPush: vi.fn(),
}))

vi.mock('./components/AthleteSessionPackageCard', () => ({
  default: () => null,
}))

vi.mock('./components/AthleteCoachPanel', () => ({
  default: () => null,
}))

vi.mock('./components/ImportBackupButton', () => ({
  default: () => null,
}))

vi.mock('./hooks/useCoachAccess', async (importOriginal) => {
  const actual = await importOriginal()
  return {
    ...actual,
    useCoachAccess: vi.fn(() => ({
      authorized: false,
      loading: false,
    })),
  }
})

vi.mock('./lib/weeklyCheckInCapability', async (importOriginal) => {
  const actual = await importOriginal()
  return {
    ...actual,
    probeWeeklyCheckInCapability: vi.fn(async () => ({
      status: 'available',
      schemaAvailable: true,
    })),
    isWeeklyCheckInFeatureEnabled: vi.fn(() => true),
    isMissingWeeklyCheckInTable: vi.fn(() => false),
  }
})

const hydratedState = {
  ownerUserId: 'athlete-integration',
  schemaVersion: STATE_SCHEMA_VERSION,
  program: {
    nextWorkout: { name: 'Chest + Back' },
  },
  activeWorkout: null,
  history: [{ id: '1', date: weekRange.weekStart, name: 'Upper', sets: [] }],
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
  readiness: {
    entries: [
      {
        date: '2026-08-07',
        sleep: 4,
        soreness: 3,
        stress: 2,
        energy: 4,
      },
    ],
    lastPromptedDate: '2026-08-07',
  },
  notifications: { read: [], dismissed: [], actedOn: [] },
  onboarding: { completed: true, completedAt: '2026-08-01T12:00:00.000Z' },
  nutrition: createNutritionState(),
  coachWorkspace: {
    role: 'athlete',
    modeEnabled: false,
    clients: [],
    invitations: [],
    assignments: [],
  },
}

const renderAppTree = () =>
  render(
    <ErrorBoundary boundary="test-root">
      <AvaProvider>
        <AppUiProvider>
          <App />
        </AppUiProvider>
      </AvaProvider>
    </ErrorBoundary>,
  )

const advancePastSplash = async () => {
  await waitFor(() => {
    expect(screen.queryByText(/Opening The Foundry/i)).not.toBeInTheDocument()
  })
  await vi.advanceTimersByTimeAsync(900)
}

const openAccountMoreScreen = async (user) => {
  await user.click(screen.getByTestId('app-profile-button'))
  await vi.advanceTimersByTimeAsync(300)
  const sectionNav = screen.getByRole('navigation', {
    name: 'Profile sections',
  })
  await user.click(
    within(sectionNav).getByRole('button', { name: /^Account/ }),
  )
}

describe('App dev weekly check-in reset integration', () => {
  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    vi.setSystemTime(now)
    setCurrentWeeklyCheckInRow(buildSubmittedRow())
    mockSupabaseFrom.mockClear()
    window.scrollTo = vi.fn()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('renders authenticated App without Recovery Mode when dev reset is wired', async () => {
    const { loadCloudState, chooseNewestState } = await import('./lib/cloudSync')
    chooseNewestState.mockReturnValue({
      state: hydratedState,
      source: 'local',
    })
    loadCloudState.mockResolvedValue(null)

    renderAppTree()
    await advancePastSplash()

    expect(
      screen.queryByText(/This screen hit an unexpected error/i),
    ).not.toBeInTheDocument()
    expect(screen.getByRole('heading', { level: 1 })).toBeInTheDocument()
  })

  it('resets submitted weekly check-in and restores Home reminder without crashing', async () => {
    const user = userEvent.setup({
      advanceTimers: vi.advanceTimersByTimeAsync,
    })
    const { loadCloudState, chooseNewestState } = await import('./lib/cloudSync')
    chooseNewestState.mockReturnValue({
      state: hydratedState,
      source: 'local',
    })
    loadCloudState.mockResolvedValue(null)

    renderAppTree()
    await advancePastSplash()

    await waitFor(() => {
      expect(
        screen.queryByText(/This screen hit an unexpected error/i),
      ).not.toBeInTheDocument()
    })

    expect(
      screen.queryByRole('button', { name: 'Check In' }),
    ).not.toBeInTheDocument()

    await openAccountMoreScreen(user)

    const resetButton = await screen.findByRole('button', {
      name: /Reset weekly check-in \(dev\)/i,
    })
    await user.click(resetButton)

    const dialog = await screen.findByRole('dialog')
    await user.click(within(dialog).getByRole('button', { name: 'Reset check-in' }))

    await waitFor(() => {
      expect(mockSupabaseRpc).toHaveBeenCalledWith(
        'dev_reset_current_weekly_check_in',
      )
    })

    await user.click(screen.getByRole('button', { name: 'Home' }))
    await vi.advanceTimersByTimeAsync(300)

    await waitFor(() => {
      expect(
        screen.getByRole('button', { name: 'Check In' }),
      ).toBeInTheDocument()
    })

    expect(
      screen.queryByText(/This screen hit an unexpected error/i),
    ).not.toBeInTheDocument()
  })
})
