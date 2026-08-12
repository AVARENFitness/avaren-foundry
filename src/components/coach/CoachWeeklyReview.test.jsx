import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import CoachWeeklyReview from './CoachWeeklyReview'
import { coachBackend } from '../../lib/coachBackend'
import { weeklyCheckInBackend } from '../../lib/weeklyCheckInBackend'
import { FROZEN_COACH_WEEK, installFrozenCoachWeek } from '../../test/frozenTime'

installFrozenCoachWeek(FROZEN_COACH_WEEK)

vi.mock('../../lib/appUi', () => ({
  appUi: {
    toast: vi.fn(),
    confirm: vi.fn(),
  },
}))

vi.mock('../../lib/coachBackend', () => ({
  coachBackend: {
    getClientWeeklyReview: vi.fn(),
    listClientWeeklyReviews: vi.fn(),
    getAthleteFoundryState: vi.fn(),
    getAthleteNutritionSnapshot: vi.fn(),
    saveClientWeeklyReview: vi.fn(),
  },
}))

vi.mock('../../lib/weeklyCheckInBackend', () => ({
  weeklyCheckInBackend: {
    getClientWeeklyCheckIn: vi.fn(),
  },
}))

const jake = {
  athlete_id: 'jake-1',
  athlete_email: 'jacobcorell2218@gmail.com',
  coach_label: 'Jake',
  profile: {
    first_name: 'Jacob',
    last_name: 'Corell',
    preferred_name: 'Jacob',
    display_name: '',
  },
  created_at: '2026-01-01T12:00:00.000Z',
}

describe('CoachWeeklyReview', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    coachBackend.getClientWeeklyReview.mockResolvedValue(null)
    coachBackend.listClientWeeklyReviews.mockResolvedValue([])
    coachBackend.getAthleteFoundryState.mockResolvedValue({
      readiness: { entries: [] },
      history: [],
    })
    coachBackend.getAthleteNutritionSnapshot.mockResolvedValue({
      profile: null,
      days: [],
    })
    weeklyCheckInBackend.getClientWeeklyCheckIn.mockResolvedValue({
      athlete_id: 'jake-1',
      week_start: '2026-08-03',
      week_end: '2026-08-09',
      status: 'submitted',
      training_rating: 4,
      recovery_rating: 3,
      nutrition_rating: 4,
      pain_or_issue: 'no_issues',
      submitted_at: '2026-08-07T12:00:00.000Z',
    })
  })

  it('renders Jake review workspace without crashing when no coach review exists', async () => {
    render(
      <CoachWeeklyReview
        client={jake}
        assignments={[]}
        onBack={vi.fn()}
      />,
    )

    await waitFor(() => {
      expect(screen.getByRole('heading', { level: 1, name: 'Jake' })).toBeInTheDocument()
    })

    expect(screen.getByText(/Weekly submission/i)).toBeInTheDocument()
    expect(screen.getByText(/READY FOR REVIEW/i)).toBeInTheDocument()
  })

  it('renders an existing reviewed week safely', async () => {
    coachBackend.getClientWeeklyReview.mockResolvedValue({
      id: 'review-1',
      athlete_id: 'jake-1',
      week_start: '2026-08-03',
      week_end: '2026-08-09',
      decision: 'keep_course',
      observation: 'Solid week.',
      priorities: ['Keep volume steady'],
      follow_up_required: false,
      follow_up_note: '',
      snapshot: {},
      created_at: '2026-08-07T12:00:00.000Z',
      updated_at: '2026-08-07T12:00:00.000Z',
    })
    coachBackend.listClientWeeklyReviews.mockResolvedValue([
      {
        id: 'review-1',
        athlete_id: 'jake-1',
        week_start: '2026-08-03',
        week_end: '2026-08-09',
        decision: 'keep_course',
        observation: 'Solid week.',
        priorities: ['Keep volume steady'],
        follow_up_required: false,
        follow_up_note: '',
        snapshot: {},
        created_at: '2026-08-07T12:00:00.000Z',
        updated_at: '2026-08-07T12:00:00.000Z',
      },
    ])

    render(
      <CoachWeeklyReview
        client={jake}
        assignments={[]}
        onBack={vi.fn()}
      />,
    )

    await waitFor(() => {
      expect(screen.getByText(/REVIEWED/i)).toBeInTheDocument()
    })
  })
})
