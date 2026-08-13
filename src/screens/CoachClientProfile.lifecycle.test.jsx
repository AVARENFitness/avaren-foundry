import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import CoachClientProfile from './CoachClientProfile'
import { coachBackend } from '../lib/coachBackend'
import { weeklyCheckInBackend } from '../lib/weeklyCheckInBackend'
import { appUi } from '../lib/appUi'

vi.mock('../lib/coachBackend', () => ({
  coachBackend: {
    getSessionPackage: vi.fn(),
    getAthleteFoundryState: vi.fn(),
    getAthleteNutritionSnapshot: vi.fn(),
    getClientWeeklyReview: vi.fn(),
    listCoachClientFollowUps: vi.fn(),
    endBusinessClientCoaching: vi.fn(),
    reopenBusinessClientCoaching: vi.fn(),
    unlinkBusinessClientAccount: vi.fn(),
  },
}))

vi.mock('../lib/weeklyCheckInBackend', () => ({
  weeklyCheckInBackend: {
    getClientWeeklyCheckIn: vi.fn(),
  },
}))

vi.mock('../lib/appUi', () => ({
  appUi: {
    toast: vi.fn(),
    confirm: vi.fn(),
  },
}))

const offlineClient = {
  id: 'bc-test',
  business_client_id: 'bc-test',
  first_name: 'Test',
  last_name: 'Client',
  linked_user_id: null,
  athlete_id: null,
  status: 'active',
  created_at: '2026-08-12T00:00:00.000Z',
  email: 'test@example.com',
  hasCoachBridge: false,
}

const connectedClient = {
  id: 'bc-jake',
  business_client_id: 'bc-jake',
  first_name: 'Jake',
  linked_user_id: '11111111-1111-4111-8111-111111111111',
  athlete_id: '11111111-1111-4111-8111-111111111111',
  status: 'active',
  bridgeCreatedAt: '2026-01-04T00:00:00.000Z',
  athlete_email: 'jake@example.com',
  hasCoachBridge: true,
}

describe('CoachClientProfile offline lifecycle', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    coachBackend.getSessionPackage.mockResolvedValue(null)
    coachBackend.listCoachClientFollowUps.mockResolvedValue([])
    coachBackend.getAthleteFoundryState.mockResolvedValue(null)
    coachBackend.getAthleteNutritionSnapshot.mockResolvedValue({
      profile: null,
      days: [],
    })
    coachBackend.getClientWeeklyReview.mockResolvedValue(null)
    weeklyCheckInBackend.getClientWeeklyCheckIn.mockResolvedValue(null)
  })

  it('shows Active client · No app account for offline clients', async () => {
    render(
      <CoachClientProfile
        client={offlineClient}
        assignments={[]}
        clientNotes=""
        onBack={vi.fn()}
      />,
    )

    await waitFor(() => {
      expect(screen.getByText(/active client · no app account/i)).toBeInTheDocument()
    })

    expect(screen.queryByText(/^connected since/i)).not.toBeInTheDocument()
  })

  it('does not fetch athlete intelligence for offline clients', async () => {
    const user = userEvent.setup()

    render(
      <CoachClientProfile
        client={offlineClient}
        assignments={[]}
        clientNotes=""
        onBack={vi.fn()}
      />,
    )

    await user.click(screen.getByRole('button', { name: /^progress$/i }))

    await waitFor(() => {
      expect(screen.getByText(/no athlete progress data yet/i)).toBeInTheDocument()
    })

    expect(coachBackend.getAthleteFoundryState).not.toHaveBeenCalled()
    expect(coachBackend.getAthleteNutritionSnapshot).not.toHaveBeenCalled()
    expect(coachBackend.getClientWeeklyReview).not.toHaveBeenCalled()
    expect(weeklyCheckInBackend.getClientWeeklyCheckIn).not.toHaveBeenCalled()
    expect(screen.queryByText(/intelligence unavailable/i)).not.toBeInTheDocument()
  })

  it('hides check-in coaching status for offline clients', async () => {
    render(
      <CoachClientProfile
        client={offlineClient}
        assignments={[]}
        clientNotes=""
        onBack={vi.fn()}
      />,
    )

    await waitFor(() => {
      expect(screen.getByText(/active client · no app account/i)).toBeInTheDocument()
    })

    expect(screen.queryByText(/check-in · waiting/i)).not.toBeInTheDocument()
    expect(screen.queryByText(/review · open/i)).not.toBeInTheDocument()
  })

  it('shows end coaching and hides unlink for offline clients', async () => {
    render(
      <CoachClientProfile
        client={offlineClient}
        assignments={[]}
        clientNotes=""
        onBack={vi.fn()}
      />,
    )

    await waitFor(() => {
      expect(screen.getByTestId('coach-end-coaching-button')).toBeInTheDocument()
    })

    expect(
      screen.queryByTestId('coach-unlink-account-button'),
    ).not.toBeInTheDocument()
  })

  it('shows connected status and unlink for linked clients', async () => {
    render(
      <CoachClientProfile
        client={connectedClient}
        assignments={[]}
        clientNotes=""
        onBack={vi.fn()}
      />,
    )

    await waitFor(() => {
      expect(screen.getByText(/active client · connected/i)).toBeInTheDocument()
    })

    expect(screen.getByText(/connected since/i)).toBeInTheDocument()
    expect(screen.getByTestId('coach-unlink-account-button')).toBeInTheDocument()
  })

  it('ends coaching through lifecycle backend', async () => {
    const user = userEvent.setup()
    const onClientUpdated = vi.fn()

    coachBackend.endBusinessClientCoaching.mockResolvedValue({
      id: 'bc-test',
      business_client_id: 'bc-test',
      status: 'archived',
      linked_user_id: null,
    })

    render(
      <CoachClientProfile
        client={offlineClient}
        assignments={[]}
        clientNotes=""
        onBack={vi.fn()}
        onClientUpdated={onClientUpdated}
      />,
    )

    await waitFor(() => {
      expect(screen.getByTestId('coach-end-coaching-button')).toBeInTheDocument()
    })

    await user.click(screen.getByTestId('coach-end-coaching-button'))
    const sheet = screen.getByTestId('coach-end-coaching-sheet')
    await user.click(
      sheet.querySelector('.coach-lifecycle-sheet-footer .gold-button'),
    )

    await waitFor(() => {
      expect(coachBackend.endBusinessClientCoaching).toHaveBeenCalledWith({
        businessClientId: 'bc-test',
        unlinkAccount: false,
      })
    })

    expect(onClientUpdated).toHaveBeenCalled()
  })

  it('does not update client state when end coaching fails', async () => {
    const user = userEvent.setup()
    const onClientUpdated = vi.fn()

    coachBackend.endBusinessClientCoaching.mockRejectedValue(
      new Error('business_client_not_found'),
    )

    render(
      <CoachClientProfile
        client={offlineClient}
        assignments={[]}
        clientNotes=""
        onBack={vi.fn()}
        onClientUpdated={onClientUpdated}
      />,
    )

    await waitFor(() => {
      expect(screen.getByTestId('coach-end-coaching-button')).toBeInTheDocument()
    })

    await user.click(screen.getByTestId('coach-end-coaching-button'))
    const sheet = screen.getByTestId('coach-end-coaching-sheet')
    await user.click(
      sheet.querySelector('.coach-lifecycle-sheet-footer .gold-button'),
    )

    await waitFor(() => {
      expect(appUi.toast).toHaveBeenCalledWith(
        'Client record not found. Refresh and try again.',
        'error',
      )
    })

    expect(onClientUpdated).not.toHaveBeenCalled()
    expect(screen.getByText(/active client · no app account/i)).toBeInTheDocument()
  })

  it('does not update client state when unlink fails', async () => {
    const user = userEvent.setup()
    const onClientUpdated = vi.fn()

    appUi.confirm.mockResolvedValue(true)
    coachBackend.unlinkBusinessClientAccount.mockRejectedValue(
      new Error('not_authorized'),
    )

    render(
      <CoachClientProfile
        client={connectedClient}
        assignments={[]}
        clientNotes=""
        onBack={vi.fn()}
        onClientUpdated={onClientUpdated}
      />,
    )

    await waitFor(() => {
      expect(screen.getByTestId('coach-unlink-account-button')).toBeInTheDocument()
    })

    await user.click(screen.getByTestId('coach-unlink-account-button'))

    await waitFor(() => {
      expect(appUi.toast).toHaveBeenCalledWith(
        'Unable to complete this action.',
        'error',
      )
    })

    expect(onClientUpdated).not.toHaveBeenCalled()
    expect(screen.getByText(/active client · connected/i)).toBeInTheDocument()
  })

  it('does not update client state when reopen fails', async () => {
    const user = userEvent.setup()
    const onClientUpdated = vi.fn()
    const archivedClient = { ...offlineClient, status: 'archived' }

    appUi.confirm.mockResolvedValue(true)
    coachBackend.reopenBusinessClientCoaching.mockRejectedValue(
      new Error('business_client_not_found'),
    )

    render(
      <CoachClientProfile
        client={archivedClient}
        assignments={[]}
        clientNotes=""
        onBack={vi.fn()}
        onClientUpdated={onClientUpdated}
      />,
    )

    await waitFor(() => {
      expect(screen.getByTestId('coach-reopen-coaching-button')).toBeInTheDocument()
    })

    await user.click(screen.getByTestId('coach-reopen-coaching-button'))

    await waitFor(() => {
      expect(appUi.toast).toHaveBeenCalledWith(
        'Client record not found. Refresh and try again.',
        'error',
      )
    })

    expect(onClientUpdated).not.toHaveBeenCalled()
  })
})
