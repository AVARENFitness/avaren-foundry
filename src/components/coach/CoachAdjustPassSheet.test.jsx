import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import CoachAdjustPassSheet from './CoachAdjustPassSheet'
import { PASS_DEBIT_REASON } from '../../lib/coachPassAdjustment'

const passes = [
  {
    id: 'pass-a',
    name: '3 Session Package',
    status: 'active',
    balance: 3,
    expiresAt: '2026-12-31',
  },
  {
    id: 'pass-b',
    name: 'Training pass',
    status: 'active',
    balance: 1,
    expiresAt: null,
  },
]

describe('CoachAdjustPassSheet', () => {
  beforeEach(() => {
    document.body.innerHTML = ''
  })

  it('opens with current balance and adjustment actions', () => {
    render(
      <CoachAdjustPassSheet
        open
        passes={passes}
        totalBalance={4}
        onClose={vi.fn()}
        onRemoveSession={vi.fn()}
        onAddSession={vi.fn()}
      />,
    )

    expect(screen.getByTestId('coach-adjust-pass-sheet')).toBeInTheDocument()
    expect(document.querySelector('[data-app-ui-backdrop="open"]')).not.toBeNull()
    expect(screen.getByText(/4 sessions/i)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /remove session/i })).toBeEnabled()
  })

  it('requires pass selection when multiple eligible passes exist', async () => {
    const user = userEvent.setup()
    const onRemoveSession = vi.fn()

    render(
      <CoachAdjustPassSheet
        open
        passes={passes}
        totalBalance={4}
        onClose={vi.fn()}
        onRemoveSession={onRemoveSession}
        onAddSession={vi.fn()}
      />,
    )

    await user.click(screen.getByRole('button', { name: /remove session/i }))
    expect(screen.getByLabelText(/^pass/i)).toBeInTheDocument()

    await user.selectOptions(screen.getByLabelText(/^pass/i), 'pass-b')
    await user.selectOptions(screen.getByLabelText(/^reason/i), PASS_DEBIT_REASON.LATE_CANCELLATION)
    await user.click(
      screen.getByRole('button', { name: /^remove 1 session$/i }),
    )

    expect(onRemoveSession).toHaveBeenCalledWith(
      expect.objectContaining({
        passId: 'pass-b',
        quantity: 1,
        reasonCode: PASS_DEBIT_REASON.LATE_CANCELLATION,
      }),
    )
  })

  it('blocks remove session when no balance remains', () => {
    render(
      <CoachAdjustPassSheet
        open
        passes={[{ id: 'pass-a', name: 'Empty pass', status: 'active', balance: 0 }]}
        totalBalance={0}
        onClose={vi.fn()}
        onRemoveSession={vi.fn()}
        onAddSession={vi.fn()}
      />,
    )

    expect(screen.getByRole('button', { name: /remove session/i })).toBeDisabled()
    expect(
      screen.getByText(/no sessions remaining on this pass/i),
    ).toBeInTheDocument()
  })

  it('requires a reason before removing sessions', async () => {
    const user = userEvent.setup()
    const onRemoveSession = vi.fn()

    render(
      <CoachAdjustPassSheet
        open
        passes={[passes[0]]}
        totalBalance={3}
        onClose={vi.fn()}
        onRemoveSession={onRemoveSession}
        onAddSession={vi.fn()}
      />,
    )

    await user.click(screen.getByRole('button', { name: /remove session/i }))
    await user.click(
      screen.getByRole('button', { name: /^remove 1 session$/i }),
    )

    expect(screen.getByText(/enter a reason/i)).toBeInTheDocument()
    expect(onRemoveSession).not.toHaveBeenCalled()
  })
})
