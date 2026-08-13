import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import CoachClientCard from './CoachClientCard'

describe('CoachClientCard compact roster row', () => {
  it('opens client from entire row without View client text', async () => {
    const user = userEvent.setup()
    const onSelect = vi.fn()

    render(
      <CoachClientCard
        entry={{
          client: { id: 'bc-test', status: 'active', linked_user_id: null },
          clientName: 'Test',
          attentionCount: 0,
        }}
        onSelect={onSelect}
        passSummary={{ totalBalance: 3, activeCount: 1 }}
      />,
    )

    expect(screen.queryByText(/view client/i)).not.toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: /open test/i }))
    expect(onSelect).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'bc-test' }),
    )
  })

  it('renders operational metadata on one secondary line', () => {
    render(
      <CoachClientCard
        entry={{
          client: { id: 'bc-jake', status: 'active', linked_user_id: 'a1' },
          clientName: 'Jake',
          attentionCount: 0,
        }}
        nextSession={{
          status: 'scheduled',
          sessionDate: '2026-08-14',
          startTime: '17:30:00',
          scheduleTimezone: 'America/New_York',
        }}
        passSummary={{ totalBalance: 2, activeCount: 1 }}
      />,
    )

    expect(screen.getByText(/2 sessions left/i)).toBeInTheDocument()
    expect(screen.getByText(/Aug/i)).toBeInTheDocument()
  })
})
