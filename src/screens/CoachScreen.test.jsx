import { render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import CoachScreen from './CoachScreen'
import { buildCoachPortfolioIntelligence } from '../lib/clientIntelligence'
import { normalizeBusinessClientRecord } from '../lib/coachBusinessClient'

vi.mock('../lib/coachBackend', () => ({
  coachBackend: {
    listCoachRoster: vi.fn(),
    listCoachInvitations: vi.fn(),
    listCoachAssignments: vi.fn(),
    listWorkoutTemplates: vi.fn(),
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
    portfolio: null,
    portfolioLoading: false,
    portfolioError: '',
    refreshPortfolio: vi.fn(),
    athleteStatesById: {},
    weeklyReviewsByAthleteId: {},
  }),
}))

vi.mock('../components/coach/CoachCommandCenter', () => ({
  default: () => <div data-testid="coach-command-center">Command Center</div>,
}))

import { coachBackend } from '../lib/coachBackend'

const jake = normalizeBusinessClientRecord({
  id: 'bc-jake',
  business_client_id: 'bc-jake',
  linked_user_id: 'athlete-jake',
  athlete_id: 'athlete-jake',
  athlete_email: 'jake@example.com',
  coach_label: 'Jake',
  status: 'active',
  created_at: '2026-01-01T12:00:00.000Z',
})

const sarah = normalizeBusinessClientRecord({
  id: 'bc-sarah',
  business_client_id: 'bc-sarah',
  linked_user_id: null,
  athlete_id: null,
  first_name: 'Sarah',
  status: 'active',
  created_at: '2026-01-15T12:00:00.000Z',
})

const alex = normalizeBusinessClientRecord({
  id: 'bc-alex',
  business_client_id: 'bc-alex',
  linked_user_id: 'athlete-alex',
  athlete_id: 'athlete-alex',
  status: 'archived',
  created_at: '2025-11-01T12:00:00.000Z',
})

describe('CoachScreen coach hub render', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    coachBackend.listCoachRoster.mockResolvedValue([jake])
    coachBackend.listCoachInvitations.mockResolvedValue([])
    coachBackend.listCoachAssignments.mockResolvedValue([])
    coachBackend.listWorkoutTemplates.mockResolvedValue([])
  })

  it('renders command center with no selected client', () => {
    const onCoachAvaContextChange = vi.fn()

    render(
      <CoachScreen
        workspace={{}}
        setWorkspace={vi.fn()}
        screen="today"
        selectedClient={null}
        setSelectedClient={vi.fn()}
        onCoachAvaContextChange={onCoachAvaContextChange}
      />,
    )

    expect(screen.getByTestId('coach-command-center')).toBeInTheDocument()
    expect(onCoachAvaContextChange).toHaveBeenCalled()
    const lastCall =
      onCoachAvaContextChange.mock.calls[
        onCoachAvaContextChange.mock.calls.length - 1
      ][0]
    expect(lastCall.selectedClient).toBeNull()
    expect(lastCall.selectedClientId).toBeNull()
  })

  it('builds portfolio intelligence for mixed roster shapes without throwing', () => {
    expect(() =>
      buildCoachPortfolioIntelligence({
        clients: [jake, sarah, alex],
        assignments: [],
        athleteStatesById: {},
        nutritionByAthleteId: {},
        weeklyReviewsByAthleteId: {},
        weeklyCheckInsByAthleteId: {},
      }),
    ).not.toThrow()
  })
})
