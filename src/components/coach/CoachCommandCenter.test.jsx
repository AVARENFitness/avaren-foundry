import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import CoachCommandCenter from './CoachCommandCenter'

const basePortfolio = {
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
  reviewQueue: [],
}

describe('CoachCommandCenter Add client', () => {
  it('opens add client flow instead of legacy invite validation', async () => {
    const user = userEvent.setup()
    const onAddClient = vi.fn()
    const onInvite = vi.fn()

    render(
      <CoachCommandCenter
        clients={[{ id: 'bc-jake', athlete_id: 'athlete-jake' }]}
        portfolio={basePortfolio}
        onAddClient={onAddClient}
        onInvite={onInvite}
        notice=""
      />,
    )

    await user.click(screen.getByRole('button', { name: /^add client$/i }))

    expect(onAddClient).toHaveBeenCalledTimes(1)
    expect(onInvite).not.toHaveBeenCalled()
    expect(
      screen.queryByText(/enter a valid athlete email/i),
    ).not.toBeInTheDocument()
  })

  it('does not show stale invite validation on command center', () => {
    render(
      <CoachCommandCenter
        clients={[{ id: 'bc-jake', athlete_id: 'athlete-jake' }]}
        portfolio={basePortfolio}
        notice=""
      />,
    )

    expect(
      screen.queryByText(/enter a valid athlete email/i),
    ).not.toBeInTheDocument()
  })
})
