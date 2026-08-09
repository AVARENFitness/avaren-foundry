import { describe, expect, it } from 'vitest'
import { getCoachWeekRange } from './weeklyReview'
import {
  WEEKLY_CHECK_IN_STATUS,
  getWeeklyCheckInStatus,
  isSubmittedWeeklyCheckIn,
  isWeeklyCheckInDue,
  validateWeeklyCheckInDraft,
} from './weeklyCheckIn'

const now = new Date('2026-08-07T12:00:00.000Z')
const weekRange = getCoachWeekRange(now)

const submittedRecord = {
  athleteId: 'athlete-1',
  weekStart: weekRange.weekStart,
  weekEnd: weekRange.weekEnd,
  status: 'submitted',
  trainingRating: 4,
  recoveryRating: 3,
  nutritionRating: 5,
  submittedAt: `${weekRange.weekStart}T18:00:00.000Z`,
}

describe('weeklyCheckIn', () => {
  it('uses Sprint 7.5 week boundaries as weekKey', () => {
    expect(weekRange.weekStart).toBe('2026-08-03')
    expect(weekRange.weekEnd).toBe('2026-08-09')
  })

  it('marks submitted only with positive persisted evidence', () => {
    expect(isSubmittedWeeklyCheckIn(submittedRecord, now)).toBe(true)
    expect(
      isSubmittedWeeklyCheckIn(
        { ...submittedRecord, weekStart: '2026-07-28' },
        now,
      ),
    ).toBe(false)
    expect(isSubmittedWeeklyCheckIn(null, now)).toBe(false)
  })

  it('returns due/overdue for coached athletes without submission', () => {
    const due = getWeeklyCheckInStatus({
      hasCoach: true,
      submission: null,
      now: new Date('2026-08-05T12:00:00.000Z'),
    })
    const overdue = getWeeklyCheckInStatus({
      hasCoach: true,
      submission: null,
      now,
    })

    expect(due.status).toBe(WEEKLY_CHECK_IN_STATUS.DUE)
    expect(overdue.status).toBe(WEEKLY_CHECK_IN_STATUS.OVERDUE)
  })

  it('returns not_required without a coach relationship', () => {
    expect(
      getWeeklyCheckInStatus({ hasCoach: false, submission: null, now }).status,
    ).toBe(WEEKLY_CHECK_IN_STATUS.NOT_REQUIRED)
  })

  it('uses isWeeklyCheckInDue for due and submitted states', () => {
    const overdue = getWeeklyCheckInStatus({
      hasCoach: true,
      submission: null,
      now,
    })
    const submitted = getWeeklyCheckInStatus({
      hasCoach: true,
      submission: submittedRecord,
      now,
    })

    expect(isWeeklyCheckInDue(overdue)).toBe(true)
    expect(isWeeklyCheckInDue(submitted)).toBe(false)
  })

  it('validates draft ratings and pain note requirements', () => {
    expect(
      validateWeeklyCheckInDraft({
        training_rating: 4,
        recovery_rating: 3,
        nutrition_rating: 5,
        pain_or_issue: 'no_issues',
      }).ok,
    ).toBe(true)

    expect(
      validateWeeklyCheckInDraft({
        training_rating: 4,
        recovery_rating: 3,
        nutrition_rating: 5,
        pain_or_issue: 'coach_should_know',
        pain_note: '',
      }).ok,
    ).toBe(false)
  })
})
