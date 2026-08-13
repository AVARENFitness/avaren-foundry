import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import CoachClientTrainingPassPanel from './CoachClientTrainingPassPanel'
import { coachBackend } from '../../lib/coachBackend'
import { appUi } from '../../lib/appUi'
import { auditDirectPassMutations } from '../../lib/coachPass'

vi.mock('../../lib/appUi', () => ({
  appUi: {
    toast: vi.fn(),
  },
}))

vi.mock('../../lib/coachBackend', () => ({
  coachBackend: {
    resolveBusinessClientId: vi.fn(),
    listClientPassBalances: vi.fn(),
    listClientPassLedger: vi.fn(),
    getSessionPackage: vi.fn(),
    createCoachClientPass: vi.fn(),
    applyCoachClientPassManualDebit: vi.fn(),
    applyCoachClientPassManualCredit: vi.fn(),
    applyCoachClientPassCreditRestored: vi.fn(),
  },
}))

const clientWithBusinessId = {
  athlete_id: 'athlete-1',
  business_client_id: 'bc-123',
  coach_label: 'Jake',
}

const activePassBalance = [
  {
    pass_id: 'pass-1',
    coach_id: 'coach-1',
    business_client_id: 'bc-123',
    name: '3 Session Package',
    sessions_purchased: 4,
    pass_status: 'active',
    starts_at: '2026-08-01',
    balance: 4,
  },
]

describe('CoachClientTrainingPassPanel', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    coachBackend.listClientPassBalances.mockResolvedValue(activePassBalance)
    coachBackend.listClientPassLedger.mockResolvedValue([])
    coachBackend.getSessionPackage.mockResolvedValue(null)
    coachBackend.createCoachClientPass.mockResolvedValue({ pass_id: 'pass-1' })
    coachBackend.applyCoachClientPassManualDebit.mockResolvedValue({
      ok: true,
      balanceBefore: 4,
      balanceAfter: 3,
      quantity: 1,
    })
  })

  it('Add pass click opens the create sheet', async () => {
    const user = userEvent.setup()
    coachBackend.listClientPassBalances.mockResolvedValue([])

    render(<CoachClientTrainingPassPanel client={clientWithBusinessId} />)

    await waitFor(() => {
      expect(screen.getByTestId('coach-add-pass-button')).toBeInTheDocument()
    })

    await user.click(screen.getByTestId('coach-add-pass-button'))

    expect(document.querySelector('[data-app-ui-backdrop="open"]')).not.toBeNull()
    expect(screen.getByRole('dialog', { name: /add pass/i })).toBeInTheDocument()
  })

  it('reports businessClientIdPresent on the panel', async () => {
    render(<CoachClientTrainingPassPanel client={clientWithBusinessId} />)

    await waitFor(() => {
      expect(screen.getByTestId('coach-training-pass-panel')).toHaveAttribute(
        'data-business-client-id-present',
        'true',
      )
    })
  })

  it('shows the preferred empty state without repeating no sessions remaining', async () => {
    coachBackend.listClientPassBalances.mockResolvedValue([])

    render(<CoachClientTrainingPassPanel client={clientWithBusinessId} />)

    await waitFor(() => {
      expect(screen.getByText(/no active training pass/i)).toBeInTheDocument()
    })

    expect(
      screen.getByText(/add a pass to track this client's in-person sessions/i),
    ).toBeInTheDocument()
    expect(screen.queryByText(/^no sessions remaining$/i)).not.toBeInTheDocument()
  })

  it('calls create_coach_client_pass RPC once with business_client_id', async () => {
    const user = userEvent.setup()
    coachBackend.listClientPassBalances.mockResolvedValue([])

    render(<CoachClientTrainingPassPanel client={clientWithBusinessId} />)

    await waitFor(() => {
      expect(screen.getByTestId('coach-add-pass-button')).toBeInTheDocument()
    })

    await user.click(screen.getByTestId('coach-add-pass-button'))
    await user.clear(screen.getByLabelText(/^sessions$/i))
    await user.type(screen.getByLabelText(/^sessions$/i), '3')
    await user.click(screen.getByRole('button', { name: /^create pass$/i }))

    await waitFor(() => {
      expect(coachBackend.createCoachClientPass).toHaveBeenCalledTimes(1)
    })

    expect(coachBackend.createCoachClientPass).toHaveBeenCalledWith(
      expect.objectContaining({
        businessClientId: 'bc-123',
        sessionsPurchased: 3,
      }),
    )
  })

  it('closes the sheet and refreshes pass summary after successful RPC', async () => {
    const user = userEvent.setup()

    coachBackend.listClientPassBalances
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([
        {
          pass_id: 'pass-1',
          coach_id: 'coach-1',
          business_client_id: 'bc-123',
          name: 'Training pass',
          sessions_purchased: 3,
          pass_status: 'active',
          starts_at: '2026-08-12',
          balance: 3,
        },
      ])

    render(<CoachClientTrainingPassPanel client={clientWithBusinessId} />)

    await waitFor(() => {
      expect(screen.getByTestId('coach-add-pass-button')).toBeInTheDocument()
    })

    await user.click(screen.getByTestId('coach-add-pass-button'))
    await user.clear(screen.getByLabelText(/^sessions$/i))
    await user.type(screen.getByLabelText(/^sessions$/i), '3')
    await user.click(screen.getByRole('button', { name: /^create pass$/i }))

    await waitFor(() => {
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    })

    expect(coachBackend.listClientPassBalances).toHaveBeenCalledTimes(2)
    expect(screen.getByText(/3 remaining/i)).toBeInTheDocument()
    expect(screen.getByText(/0 of 3 used/i)).toBeInTheDocument()
    expect(screen.queryByText(/^no sessions remaining$/i)).not.toBeInTheDocument()
    expect(appUi.toast).toHaveBeenCalledWith('Training pass created.', 'success')
  })

  it('blocks duplicate submit while creating', async () => {
    const user = userEvent.setup()
    coachBackend.listClientPassBalances.mockResolvedValue([])
    let resolveCreate
    coachBackend.createCoachClientPass.mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveCreate = resolve
        }),
    )

    render(<CoachClientTrainingPassPanel client={clientWithBusinessId} />)

    await waitFor(() => {
      expect(screen.getByTestId('coach-add-pass-button')).toBeInTheDocument()
    })

    await user.click(screen.getByTestId('coach-add-pass-button'))
    await user.click(screen.getByRole('button', { name: /^create pass$/i }))

    await waitFor(() => {
      expect(
        screen.getByRole('button', { name: /^creating…$/i }),
      ).toBeDisabled()
    })

    expect(coachBackend.createCoachClientPass).toHaveBeenCalledTimes(1)

    resolveCreate?.({ pass_id: 'pass-1' })
  })

  it('shows a human-friendly error when RPC fails', async () => {
    const user = userEvent.setup()
    coachBackend.listClientPassBalances.mockResolvedValue([])
    coachBackend.createCoachClientPass.mockRejectedValue(
      new Error('business_client_not_found'),
    )

    render(<CoachClientTrainingPassPanel client={clientWithBusinessId} />)

    await waitFor(() => {
      expect(screen.getByTestId('coach-add-pass-button')).toBeInTheDocument()
    })

    await user.click(screen.getByTestId('coach-add-pass-button'))
    await user.click(screen.getByRole('button', { name: /^create pass$/i }))

    await waitFor(() => {
      expect(
        screen.getByText(/we couldn't create this pass\. try again\./i),
      ).toBeInTheDocument()
    })

    expect(appUi.toast).toHaveBeenCalledWith(
      "We couldn't create this pass. Try again.",
      'error',
    )
    expect(screen.queryByText(/business_client_not_found/i)).not.toBeInTheDocument()
  })

  it('does not use direct pass table inserts in panel source', () => {
    const source = CoachClientTrainingPassPanel.toString()
    expect(auditDirectPassMutations(source)).toHaveLength(0)
  })

  it('Adjust opens pass adjustment sheet and debits through RPC', async () => {
    const user = userEvent.setup()

    render(<CoachClientTrainingPassPanel client={clientWithBusinessId} />)

    await waitFor(() => {
      expect(screen.getByTestId('coach-adjust-pass-button')).toBeInTheDocument()
    })

    await user.click(screen.getByTestId('coach-adjust-pass-button'))
    await user.click(screen.getByRole('button', { name: /remove session/i }))
    await user.selectOptions(screen.getByLabelText(/^reason/i), 'late_cancellation')
    await user.click(screen.getByRole('button', { name: /^remove 1 session$/i }))

    await waitFor(() => {
      expect(coachBackend.applyCoachClientPassManualDebit).toHaveBeenCalledWith(
        expect.objectContaining({
          passId: 'pass-1',
          quantity: 1,
          reason: 'Late cancellation',
          balanceBefore: 4,
        }),
      )
    })

    expect(coachBackend.listClientPassBalances).toHaveBeenCalledTimes(2)
    expect(appUi.toast).toHaveBeenCalledWith(
      expect.stringMatching(/1 session removed · 4 → 3 remaining/i),
      'success',
    )
  })

  it('works for offline clients with business_client_id only', async () => {
    render(
      <CoachClientTrainingPassPanel
        client={{
          business_client_id: 'bc-offline',
          display_name: 'Sarah',
        }}
      />,
    )

    await waitFor(() => {
      expect(screen.getByTestId('coach-adjust-pass-button')).toBeInTheDocument()
    })

    expect(coachBackend.resolveBusinessClientId).not.toHaveBeenCalled()
    expect(coachBackend.listClientPassBalances).toHaveBeenCalledWith('bc-offline')
  })

  it('renders manual debit history with reason headline', async () => {
    const user = userEvent.setup()
    coachBackend.listClientPassLedger.mockResolvedValue([
      {
        id: 'ledger-1',
        pass_id: 'pass-1',
        entry_type: 'manual_debit',
        quantity: -1,
        reason: 'Late cancellation',
        created_at: '2026-08-12T12:00:00.000Z',
        pass_name: '3 Session Package',
      },
    ])

    render(<CoachClientTrainingPassPanel client={clientWithBusinessId} />)

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /view usage/i })).toBeInTheDocument()
    })

    await user.click(screen.getByRole('button', { name: /view usage/i }))

    await waitFor(() => {
      expect(screen.getByText(/late cancellation/i)).toBeInTheDocument()
    })

    expect(screen.getByText(/−1 session/i)).toBeInTheDocument()
    expect(screen.queryByText(/^manual debit$/i)).not.toBeInTheDocument()
  })
})
