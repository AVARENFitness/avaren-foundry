import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import CoachCommandCenter from './CoachCommandCenter'
import { coachBackend } from '../../lib/coachBackend'

vi.mock('../../lib/coachBackend', () => ({
  coachBackend: {
    listScheduledSessions: vi.fn().mockResolvedValue([]),
  },
}))

vi.mock('./CoachTodaySchedule', () => ({
  default: () => <div data-testid="coach-today-schedule" />,
}))

vi.mock('./CoachAttentionQueue', () => ({
  default: () => null,
}))

vi.mock('./CoachSessionDetailHost', () => ({
  default: ({ children }) => children(() => {}),
}))

const basePortfolio = {
  hero: { activeClients: 1, activeAssignments: 0 },
  rosterEntries: [
    {
      client: { id: 'bc-jake', business_client_id: 'bc-jake', athlete_id: 'athlete-jake', status: 'active' },
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

describe('CoachCommandCenter roster density', () => {
  const rosterEntries = Array.from({ length: 10 }, (_, index) => ({
    client: {
      id: `bc-${index}`,
      business_client_id: `bc-${index}`,
      status: 'active',
      linked_user_id: index % 2 === 0 ? `athlete-${index}` : null,
      athlete_id: index % 2 === 0 ? `athlete-${index}` : null,
    },
    clientName: `Client ${index + 1}`,
    attentionCount: index === 0 ? 1 : 0,
    intelligence:
      index === 0
        ? { attention: [{ id: 'inactive', title: 'Training gap detected' }] }
        : null,
    card: {},
  }))

  it('shows preview limit and expands to full roster', async () => {
    const user = userEvent.setup()

    render(
      <CoachCommandCenter
        clients={rosterEntries.map((entry) => entry.client)}
        portfolio={{ hero: { activeClients: 10 }, rosterEntries, attentionQueue: [] }}
        passAvaContextByBusinessClientId={{}}
        loading={false}
        portfolioLoading={false}
      />,
    )

    expect(screen.getAllByRole('button', { name: /^open client /i })).toHaveLength(6)
    await user.click(screen.getByRole('button', { name: /view all clients/i }))
    expect(screen.getAllByRole('button', { name: /^open client /i })).toHaveLength(10)
    expect(coachBackend.listScheduledSessions).toHaveBeenCalled()
  })
})
