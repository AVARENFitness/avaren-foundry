import { render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import AthletePassStatus from '../components/AthletePassStatus'
import { coachBackend } from '../lib/coachBackend'

vi.mock('../lib/coachBackend', () => ({
  coachBackend: {
    getAthleteTrainingPassSummary: vi.fn(),
    listAthletePassUsageHistory: vi.fn(),
  },
}))

describe('AthletePassStatus', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('renders compact remaining on Home when linked', async () => {
    coachBackend.getAthleteTrainingPassSummary.mockResolvedValue([
      {
        pass_id: 'p1',
        business_client_id: 'bc-1',
        balance: 11,
        status: 'active',
        name: 'Training pass',
      },
    ])
    coachBackend.listAthletePassUsageHistory.mockResolvedValue([
      {
        occurred_at: '2026-09-01T10:00:00.000Z',
        entry_type: 'purchase',
        quantity: 13,
        pass_name: 'Training pass',
        business_client_id: 'bc-1',
      },
      {
        occurred_at: '2026-09-05T10:00:00.000Z',
        entry_type: 'session_used',
        quantity: -2,
        pass_name: 'Training pass',
        business_client_id: 'bc-1',
      },
    ])

    render(<AthletePassStatus variant="compact" />)

    await waitFor(() => {
      expect(screen.getByText('11 remaining')).toBeInTheDocument()
    })
    expect(screen.getByText('2 of 13 used')).toBeInTheDocument()
  })

  it('renders detailed Schedule pass context', async () => {
    coachBackend.getAthleteTrainingPassSummary.mockResolvedValue([
      {
        pass_id: 'p1',
        business_client_id: 'bc-1',
        balance: 11,
        status: 'active',
        name: 'Foundry pack',
      },
    ])
    coachBackend.listAthletePassUsageHistory.mockResolvedValue([
      {
        occurred_at: '2026-09-01T10:00:00.000Z',
        entry_type: 'purchase',
        quantity: 13,
        pass_name: 'Foundry pack',
        business_client_id: 'bc-1',
      },
      {
        occurred_at: '2026-09-05T10:00:00.000Z',
        entry_type: 'session_used',
        quantity: -2,
        pass_name: 'Foundry pack',
        business_client_id: 'bc-1',
      },
    ])

    render(<AthletePassStatus variant="detailed" />)

    await waitFor(() => {
      expect(screen.getByText('11 remaining')).toBeInTheDocument()
    })
    expect(screen.getByText('2 of 13 used')).toBeInTheDocument()
    expect(screen.getByText(/Last added/i)).toBeInTheDocument()
  })

  it('renders nothing for unlinked athletes', async () => {
    coachBackend.getAthleteTrainingPassSummary.mockResolvedValue([])
    coachBackend.listAthletePassUsageHistory.mockResolvedValue([])

    const { container } = render(<AthletePassStatus variant="compact" />)

    await waitFor(() => {
      expect(coachBackend.getAthleteTrainingPassSummary).toHaveBeenCalled()
    })
    expect(container).toBeEmptyDOMElement()
  })
})
