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
    updateBusinessClientEmail: vi.fn(),
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

  it('creates business client with optional email and no invite', async () => {
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
        linked_user_id: null,
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
    await user.click(screen.getByTestId('coach-add-client-only'))

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

  it('requires email before Add & invite to AVAREN', async () => {
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
    await user.type(screen.getByLabelText(/first name/i), 'Sarah')
    await user.click(screen.getByTestId('coach-add-client-invite'))

    expect(await screen.findByText(/enter a valid athlete email/i)).toBeInTheDocument()
    expect(coachBackend.createBusinessClient).not.toHaveBeenCalled()
    expect(coachBackend.inviteAthlete).not.toHaveBeenCalled()
  })

  it('creates business client and pending invite on Add & invite', async () => {
    const user = userEvent.setup()
    const setSelectedClient = vi.fn()

    coachBackend.createBusinessClient.mockResolvedValue({
      business_client_id: 'bc-sarah',
      display_name: 'Sarah Test',
    })
    coachBackend.inviteAthlete.mockResolvedValue({
      invitation_id: 'inv-sarah',
      business_client_id: 'bc-sarah',
    })
    coachBackend.listCoachRoster
      .mockResolvedValueOnce([jake])
      .mockResolvedValueOnce([
        jake,
        {
          id: 'bc-sarah',
          business_client_id: 'bc-sarah',
          first_name: 'Sarah',
          last_name: 'Test',
          email: 'sarah@example.com',
          status: 'active',
          linked_user_id: null,
        },
      ])
    coachBackend.listCoachInvitations
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([
        {
          id: 'inv-sarah',
          status: 'pending',
          athlete_email: 'sarah@example.com',
          business_client_id: 'bc-sarah',
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
    await user.type(screen.getByLabelText(/^email$/i), '  Sarah@Example.COM ')
    await user.click(screen.getByTestId('coach-add-client-invite'))

    await waitFor(() => {
      expect(coachBackend.createBusinessClient).toHaveBeenCalledWith(
        expect.objectContaining({
          firstName: 'Sarah',
          lastName: 'Test',
          email: 'sarah@example.com',
        }),
      )
    })

    await waitFor(() => {
      expect(coachBackend.inviteAthlete).toHaveBeenCalledWith('sarah@example.com', {
        businessClientId: 'bc-sarah',
      })
    })

    await waitFor(() => {
      expect(setSelectedClient).toHaveBeenCalledWith(
        expect.objectContaining({ business_client_id: 'bc-sarah' }),
      )
    })
  })

  it('blocks double-submit while create is in flight', async () => {
    const user = userEvent.setup()
    let resolveCreate
    coachBackend.createBusinessClient.mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveCreate = resolve
        }),
    )

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
    await user.type(screen.getByLabelText(/first name/i), 'Sarah')
    await user.type(screen.getByLabelText(/^email$/i), 'sarah@example.com')

    const inviteButton = screen.getByTestId('coach-add-client-invite')
    await user.click(inviteButton)
    await user.click(inviteButton)

    await waitFor(() => {
      expect(coachBackend.createBusinessClient).toHaveBeenCalledTimes(1)
    })

    resolveCreate({ business_client_id: 'bc-sarah' })
    coachBackend.inviteAthlete.mockResolvedValue({ invitation_id: 'inv-1' })
    await waitFor(() => {
      expect(coachBackend.inviteAthlete).toHaveBeenCalledTimes(1)
    })
  })
})
