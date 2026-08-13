import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import CoachScreen from './CoachScreen'

vi.mock('../lib/coachBackend', () => ({
  coachBackend: {
    listCoachRoster: vi.fn(),
    listCoachInvitations: vi.fn(),
    listCoachAssignments: vi.fn(),
    listWorkoutTemplates: vi.fn(),
    createBusinessClient: vi.fn(),
    inviteAthlete: vi.fn(),
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

vi.mock('../hooks/useCoachPortfolio', () => ({
  useCoachPortfolio: () => ({
    portfolio: {
      hero: { activeClients: 1, activeAssignments: 0 },
      rosterEntries: [
        {
          client: { id: 'bc-jake', athlete_id: 'athlete-jake', status: 'active' },
          clientName: 'Jake',
          status: 'on_track',
          attentionCount: 0,
          card: {},
        },
      ],
      attentionQueue: [],
    },
    portfolioLoading: false,
    portfolioError: '',
    refreshPortfolio: vi.fn(),
    athleteStatesById: {},
    weeklyReviewsByAthleteId: {},
  }),
}))

import { coachBackend } from '../lib/coachBackend'

const jake = {
  id: 'bc-jake',
  business_client_id: 'bc-jake',
  athlete_id: 'athlete-jake',
  status: 'active',
}

describe('CoachScreen Add client integration', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    coachBackend.listCoachRoster.mockResolvedValue([jake])
    coachBackend.listCoachInvitations.mockResolvedValue([])
    coachBackend.listCoachAssignments.mockResolvedValue([])
    coachBackend.listWorkoutTemplates.mockResolvedValue([])
  })

  it('clicking Add client opens sheet without calling inviteAthlete', async () => {
    const user = userEvent.setup()

    render(
      <CoachScreen
        workspace={{}}
        setWorkspace={vi.fn()}
        selectedClient={null}
        setSelectedClient={vi.fn()}
      />,
    )

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /^add client$/i })).toBeInTheDocument()
    })

    await user.click(screen.getByRole('button', { name: /^add client$/i }))

    expect(screen.getByTestId('coach-create-client-sheet')).toBeInTheDocument()
    expect(coachBackend.inviteAthlete).not.toHaveBeenCalled()
    expect(
      screen.queryByText(/enter a valid athlete email/i),
    ).not.toBeInTheDocument()
  })

  it('creates business client with optional email', async () => {
    const user = userEvent.setup()
    const setSelectedClient = vi.fn()

    coachBackend.createBusinessClient.mockResolvedValue({
      business_client_id: 'bc-sarah',
      display_name: 'Sarah Test',
    })
    coachBackend.listCoachRoster.mockResolvedValueOnce([jake]).mockResolvedValueOnce([
      jake,
      {
        id: 'bc-sarah',
        business_client_id: 'bc-sarah',
        first_name: 'Sarah',
        last_name: 'Test',
        status: 'active',
      },
    ])

    render(
      <CoachScreen
        workspace={{}}
        setWorkspace={vi.fn()}
        selectedClient={null}
        setSelectedClient={setSelectedClient}
      />,
    )

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /^add client$/i })).toBeInTheDocument()
    })

    await user.click(screen.getByRole('button', { name: /^add client$/i }))
    await user.type(screen.getByLabelText(/first name/i), 'Sarah')
    await user.type(screen.getByLabelText(/last name/i), 'Test')
    await user.click(screen.getByRole('button', { name: /^create client$/i }))

    await waitFor(() => {
      expect(coachBackend.createBusinessClient).toHaveBeenCalledWith(
        expect.objectContaining({
          firstName: 'Sarah',
          lastName: 'Test',
          email: null,
        }),
      )
    })

    expect(coachBackend.inviteAthlete).not.toHaveBeenCalled()
    await waitFor(() => {
      expect(setSelectedClient).toHaveBeenCalled()
    })
  })
})
