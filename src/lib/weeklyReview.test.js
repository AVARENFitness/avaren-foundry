import { describe, expect, it } from 'vitest'
import { buildWeeklyReviewSnapshot } from './clientIntelligence'
import { buildClientIntelligence } from './clientIntelligence'
import {
  formatWeekRangeLabel,
  getCoachWeekRange,
  getWeeklyReviewStatus,
  normalizeWeeklyReview,
  sanitizeWeeklyReviewDraft,
} from './weeklyReview'
import { rankClientsForWeeklyReview } from './clientIntelligence'

const client = {
  athlete_id: 'athlete-1',
  athlete_email: 'jacob@example.com',
  created_at: '2026-01-01T12:00:00.000Z',
}

describe('weeklyReview', () => {
  it('calculates the current coach week range from Monday', () => {
    const range = getCoachWeekRange(new Date('2026-08-07T12:00:00.000Z'))
    expect(range.weekStart).toBe('2026-08-03')
    expect(range.weekEnd).toBe('2026-08-09')
    expect(formatWeekRangeLabel(range.weekStart, range.weekEnd)).toContain('Aug')
  })

  it('returns review due when no current-week review exists', () => {
    const status = getWeeklyReviewStatus({ currentReview: null })
    expect(status.actionLabel).toBe('Review This Week')
    expect(status.review).toBeNull()
  })

  it('returns reviewed when the current week already has a review', () => {
    const week = getCoachWeekRange(new Date('2026-08-07T12:00:00.000Z'))
    const status = getWeeklyReviewStatus({
      currentReview: normalizeWeeklyReview({
        athlete_id: 'athlete-1',
        week_start: week.weekStart,
        week_end: week.weekEnd,
        decision: 'keep_course',
        observation: 'Solid week',
        priorities: ['Stay consistent'],
        follow_up_required: false,
        follow_up_note: '',
        snapshot: {},
      }),
      now: new Date('2026-08-07T12:00:00.000Z'),
    })

    expect(status.status).toBe('REVIEWED')
    expect(status.actionLabel).toBe('Reviewed')
  })

  it('builds a weekly snapshot with empty states when data is missing', () => {
    const intelligence = buildClientIntelligence({
      client,
      assignments: [],
      athleteState: null,
      nutritionProfile: null,
      nutritionDays: [],
      now: new Date('2026-08-07T12:00:00.000Z'),
    })

    const snapshot = buildWeeklyReviewSnapshot({
      intelligence,
      assignments: [],
      now: new Date('2026-08-07T12:00:00.000Z'),
    })

    expect(snapshot.training.workoutsCompleted).toBe(0)
    expect(snapshot.recovery.available).toBe(false)
    expect(snapshot.nutrition.shared).toBe(false)
    expect(snapshot.wins).toEqual([])
  })

  it('sanitizes priorities and requires a decision at save time', () => {
    const cleaned = sanitizeWeeklyReviewDraft({
      decision: ' progress ',
      observation: ' Good week ',
      priorities: [' One ', '', 'Two', 'Three', 'Four'],
      followUpRequired: true,
      followUpNote: ' Check in ',
    })

    expect(cleaned.decision).toBe('progress')
    expect(cleaned.priorities).toEqual(['One', 'Two', 'Three'])
    expect(cleaned.followUpRequired).toBe(true)
  })

  it('ranks clients needing review ahead of reviewed clients', () => {
    const week = getCoachWeekRange(new Date('2026-08-07T12:00:00.000Z'))
    const entries = [
      {
        client: { athlete_id: 'a1' },
        clientName: 'Alpha',
        sortScore: 10,
        attentionCount: 0,
      },
      {
        client: { athlete_id: 'a2' },
        clientName: 'Beta',
        sortScore: 80,
        attentionCount: 2,
      },
    ]

    const ranked = rankClientsForWeeklyReview(
      entries,
      {
        a1: normalizeWeeklyReview({
          athlete_id: 'a1',
          week_start: week.weekStart,
          week_end: week.weekEnd,
          decision: 'keep_course',
          priorities: [],
        }),
      },
      new Date('2026-08-07T12:00:00.000Z'),
    )

    expect(ranked).toHaveLength(1)
    expect(ranked[0].client.athlete_id).toBe('a2')
  })

  it('normalizes persisted review records', () => {
    const review = normalizeWeeklyReview({
      id: 'review-1',
      athlete_id: 'athlete-1',
      week_start: '2026-08-03',
      week_end: '2026-08-09',
      decision: 'manage_load',
      observation: 'Keep an eye on fatigue',
      priorities: ['Reduce volume'],
      follow_up_required: true,
      follow_up_note: 'Message before next block',
      snapshot: { training: { workoutsCompleted: 2 } },
      created_at: '2026-08-07T18:00:00.000Z',
      updated_at: '2026-08-07T18:00:00.000Z',
    })

    expect(review.decision).toBe('manage_load')
    expect(review.priorities).toEqual(['Reduce volume'])
    expect(review.followUpRequired).toBe(true)
    expect(review.snapshot.training.workoutsCompleted).toBe(2)
  })
})
