import { describe, expect, it, vi } from 'vitest'
import {
  buildClientReviewNavigationTarget,
  openClientReview,
} from './coachReviewNavigation'

const jake = {
  athlete_id: 'jake-1',
  athlete_email: 'jacob@example.com',
  coach_label: 'Jake',
  profile: {
    first_name: 'Jacob',
    last_name: 'Corell',
    preferred_name: 'Jacob',
    display_name: '',
  },
}

describe('coachReviewNavigation', () => {
  it('builds a normalized review navigation payload', () => {
    const target = buildClientReviewNavigationTarget({
      client: jake,
      athleteCheckIn: { id: 'checkin-1' },
      coachReview: { id: 'review-1' },
      source: 'client_profile',
    })

    expect(target.athleteId).toBe('jake-1')
    expect(target.clientDisplayName).toBe('Jake')
    expect(target.athleteCheckInId).toBe('checkin-1')
    expect(target.coachReviewId).toBe('review-1')
    expect(target.weekKey).toBeTruthy()
  })

  it('opens review through the shared navigation helper', () => {
    const openWeeklyReview = vi.fn()
    const result = openClientReview({
      client: jake,
      openWeeklyReview,
    })

    expect(result.ok).toBe(true)
    expect(openWeeklyReview).toHaveBeenCalledWith(jake, null)
  })

  it('returns an explicit failure when review navigation is unavailable', () => {
    const result = openClientReview({ client: jake })
    expect(result.ok).toBe(false)
    expect(result.message).toMatch(/couldn't open/i)
  })
})
