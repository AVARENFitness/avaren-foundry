import { render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import CoachScreen from './CoachScreen'
import {
  normalizeBusinessClientRecord,
  resolveRecordBusinessClientId,
} from '../lib/coachBusinessClient'

const mockGetClientNotes = vi.fn()
const mockListClientPassBalances = vi.fn()
const mockListClientPassLedger = vi.fn()
const mockListCoachClientFollowUps = vi.fn()

vi.mock('../lib/coachBackend', () => ({
  coachBackend: {
    listCoachRoster: vi.fn(),
    listCoachInvitations: vi.fn(),
    listCoachAssignments: vi.fn(),
    listWorkoutTemplates: vi.fn(),
    getClientNotes: (...args) => mockGetClientNotes(...args),
    getSessionPackage: vi.fn().mockResolvedValue(null),
    getAthleteFoundryState: vi.fn().mockResolvedValue(null),
    getAthleteNutritionSnapshot: vi.fn().mockResolvedValue({ profile: null, days: [] }),
    getClientWeeklyReview: vi.fn().mockResolvedValue(null),
    listCoachClientFollowUps: (...args) => mockListCoachClientFollowUps(...args),
    listClientPassBalances: (...args) => mockListClientPassBalances(...args),
    listClientPassLedger: (...args) => mockListClientPassLedger(...args),
    updateClientFollowUpStatus: vi.fn(),
  },
}))

vi.mock('../lib/assignmentNotifications', () => ({
  assignmentNotificationBackend: {
    deliveryForAssignments: vi.fn().mockResolvedValue([]),
  },
}))

vi.mock('../lib/identityCapabilities', () => ({
  probeIdentityCapabilities: vi.fn().mockResolvedValue({ coachClientLabels: false }),
  getIdentityCapabilities: vi.fn().mockReturnValue({ coachClientLabels: false }),
}))

vi.mock('../lib/weeklyCheckInBackend', () => ({
  weeklyCheckInBackend: {
    getClientWeeklyCheckIn: vi.fn().mockResolvedValue(null),
  },
}))

vi.mock('../hooks/useCoachPortfolio', () => ({
  useCoachPortfolio: () => ({
    portfolio: null,
    portfolioLoading: false,
    portfolioError: '',
    refreshPortfolio: vi.fn(),
    athleteStatesById: {},
    weeklyReviewsByAthleteId: {},
  }),
}))

vi.mock('../lib/appUi', () => ({
  appUi: {
    toast: vi.fn(),
    confirm: vi.fn(),
  },
}))

import { coachBackend } from '../lib/coachBackend'

const offlineTestClient = normalizeBusinessClientRecord({
  id: 'bc-test',
  business_client_id: 'bc-test',
  first_name: 'Test',
  linked_user_id: null,
  athlete_id: null,
  status: 'active',
  email: 'test@example.com',
  hasCoachBridge: false,
})

const connectedJake = normalizeBusinessClientRecord({
  id: 'bc-jake',
  business_client_id: 'bc-jake',
  first_name: 'Jake',
  linked_user_id: '11111111-1111-4111-8111-111111111111',
  athlete_id: '11111111-1111-4111-8111-111111111111',
  status: 'active',
  bridgeCreatedAt: '2026-01-04T00:00:00.000Z',
  hasCoachBridge: true,
})

const archivedAlex = normalizeBusinessClientRecord({
  id: 'bc-alex',
  business_client_id: 'bc-alex',
  first_name: 'Alex',
  linked_user_id: null,
  athlete_id: null,
  status: 'archived',
  hasCoachBridge: false,
})

describe('CoachScreen open client path', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    coachBackend.listCoachRoster.mockResolvedValue([
      offlineTestClient,
      connectedJake,
      archivedAlex,
    ])
    coachBackend.listCoachInvitations.mockResolvedValue([])
    coachBackend.listCoachAssignments.mockResolvedValue([])
    coachBackend.listWorkoutTemplates.mockResolvedValue([])
    mockGetClientNotes.mockResolvedValue(null)
    mockListCoachClientFollowUps.mockResolvedValue([])
    mockListClientPassBalances.mockResolvedValue([])
    mockListClientPassLedger.mockResolvedValue([])
  })

  it('opens offline business client without throwing and resolves business_client_id', async () => {
    const onCoachAvaContextChange = vi.fn()

    render(
      <CoachScreen
        workspace={{}}
        setWorkspace={vi.fn()}
        screen="clients"
        selectedClient={offlineTestClient}
        setSelectedClient={vi.fn()}
        onCoachAvaContextChange={onCoachAvaContextChange}
      />,
    )

    await waitFor(() => {
      expect(screen.getByText(/active client · no app account/i)).toBeInTheDocument()
    })

    expect(resolveRecordBusinessClientId(offlineTestClient)).toBe('bc-test')

    const lastContext =
      onCoachAvaContextChange.mock.calls[
        onCoachAvaContextChange.mock.calls.length - 1
      ][0]
    expect(lastContext.selectedClientId).toBe('bc-test')
    expect(lastContext.profileOpen).toBe(true)
  })

  it('does not fetch athlete notes when linked_user_id is null', async () => {
    render(
      <CoachScreen
        workspace={{}}
        setWorkspace={vi.fn()}
        screen="clients"
        selectedClient={offlineTestClient}
        setSelectedClient={vi.fn()}
      />,
    )

    await waitFor(() => {
      expect(screen.getByText(/active client · no app account/i)).toBeInTheDocument()
    })

    expect(mockGetClientNotes).not.toHaveBeenCalled()
    expect(coachBackend.getAthleteFoundryState).not.toHaveBeenCalled()
  })

  it('renders client management for offline active client', async () => {
    render(
      <CoachScreen
        workspace={{}}
        setWorkspace={vi.fn()}
        screen="clients"
        selectedClient={offlineTestClient}
        setSelectedClient={vi.fn()}
      />,
    )

    await waitFor(() => {
      expect(screen.getByTestId('coach-end-coaching-button')).toBeInTheDocument()
    })

    expect(
      screen.queryByTestId('coach-unlink-account-button'),
    ).not.toBeInTheDocument()
  })

  it('renders connected client profile with unlink action', async () => {
    render(
      <CoachScreen
        workspace={{}}
        setWorkspace={vi.fn()}
        screen="clients"
        selectedClient={connectedJake}
        setSelectedClient={vi.fn()}
      />,
    )

    await waitFor(() => {
      expect(screen.getByText(/active client · connected/i)).toBeInTheDocument()
    })

    expect(screen.getByTestId('coach-end-coaching-button')).toBeInTheDocument()
    expect(screen.getByTestId('coach-unlink-account-button')).toBeInTheDocument()
  })

  it('renders archived client with reopen coaching', async () => {
    render(
      <CoachScreen
        workspace={{}}
        setWorkspace={vi.fn()}
        screen="clients"
        selectedClient={archivedAlex}
        setSelectedClient={vi.fn()}
      />,
    )

    await waitFor(() => {
      expect(screen.getByTestId('coach-reopen-coaching-button')).toBeInTheDocument()
    })
  })

  it('never passes null to getClientNotes for connected clients', async () => {
    render(
      <CoachScreen
        workspace={{}}
        setWorkspace={vi.fn()}
        screen="clients"
        selectedClient={connectedJake}
        setSelectedClient={vi.fn()}
      />,
    )

    await waitFor(() => {
      expect(mockGetClientNotes).toHaveBeenCalled()
    })

    for (const [athleteId] of mockGetClientNotes.mock.calls) {
      expect(athleteId).toBeTruthy()
      expect(String(athleteId)).not.toBe('null')
    }
  })
})
