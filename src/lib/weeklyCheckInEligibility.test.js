import { describe, expect, it } from 'vitest'
import {
  hasLinkedAthlete,
  isValidUuid,
  normalizeBusinessClientRecord,
  resolveCanonicalLinkedUserId,
  resolveClientIdentityBadge,
  CLIENT_IDENTITY_BADGE,
} from './coachBusinessClient'
import {
  canLoadAthleteIntelligence,
  isWeeklyCheckInEligible,
  isWeeklyCheckInObligationActive,
} from './weeklyCheckInEligibility'

describe('weeklyCheckInEligibility', () => {
  const offlineClient = normalizeBusinessClientRecord({
    id: 'bc-test',
    status: 'active',
    linked_user_id: null,
    created_at: '2026-08-12T00:00:00.000Z',
    hasCoachBridge: false,
  })

  const connectedClient = normalizeBusinessClientRecord({
    id: 'bc-jake',
    status: 'active',
    linked_user_id: '11111111-1111-4111-8111-111111111111',
    hasCoachBridge: true,
  })

  it('does not treat created_at as connected', () => {
    expect(resolveClientIdentityBadge(offlineClient)).toBe(
      CLIENT_IDENTITY_BADGE.NO_APP,
    )
    expect(hasLinkedAthlete(offlineClient)).toBe(false)
  })

  it('rejects stringified null UUIDs', () => {
    expect(isValidUuid('null')).toBe(false)
    expect(isValidUuid('undefined')).toBe(false)
    expect(resolveCanonicalLinkedUserId({ linked_user_id: 'null' })).toBeNull()
  })

  it('does not infer connection from stale athlete_id alone', () => {
    expect(
      resolveCanonicalLinkedUserId({
        linked_user_id: null,
        athlete_id: '11111111-1111-4111-8111-111111111111',
      }),
    ).toBeNull()
  })

  it('blocks offline clients from athlete intelligence and check-ins', () => {
    expect(canLoadAthleteIntelligence(offlineClient)).toBe(false)
    expect(isWeeklyCheckInEligible(offlineClient)).toBe(false)
    expect(isWeeklyCheckInEligible(connectedClient)).toBe(true)
  })

  it('respects coach not-required preference for connected clients', () => {
    expect(
      isWeeklyCheckInObligationActive({
        ...connectedClient,
        hasCoachBridge: true,
        coaching_requirements: { weekly_check_in: 'not_required' },
      }),
    ).toBe(false)
  })

  it('does not create obligation for offline stored-required clients', () => {
    expect(
      isWeeklyCheckInObligationActive({
        status: 'active',
        linked_user_id: null,
        coaching_requirements: { weekly_check_in: 'required' },
      }),
    ).toBe(false)
  })

  it('does not create obligation without an active bridge', () => {
    expect(
      isWeeklyCheckInObligationActive({
        ...connectedClient,
        hasCoachBridge: false,
        coaching_requirements: { weekly_check_in: 'required' },
      }),
    ).toBe(false)
  })
})

describe('resolveAthleteWeeklyCheckInSession', () => {
  it('marks current week due when required and no current-week submission exists', async () => {
    const { resolveAthleteWeeklyCheckInSession } = await import(
      './weeklyCheckInEligibility.js'
    )
    const { WEEKLY_CHECK_IN_STATUS } = await import('./weeklyCheckIn.js')

    const session = resolveAthleteWeeklyCheckInSession({
      requirements: { weekly_check_in: 'required' },
      submission: null,
    })

    expect(session.required).toBe(true)
    expect([WEEKLY_CHECK_IN_STATUS.DUE, WEEKLY_CHECK_IN_STATUS.OVERDUE]).toContain(
      session.status.status,
    )
    expect(session.status.submitted).toBe(false)
  })

  it('suppresses duplicate obligation when current week is already submitted', async () => {
    const { resolveAthleteWeeklyCheckInSession } = await import(
      './weeklyCheckInEligibility.js'
    )
    const { WEEKLY_CHECK_IN_STATUS } = await import('./weeklyCheckIn.js')
    const { getCoachWeekRange } = await import('./weeklyReview.js')
    const weekRange = getCoachWeekRange()

    const session = resolveAthleteWeeklyCheckInSession({
      requirements: { weekly_check_in: 'required' },
      submission: {
        week_start: weekRange.weekStart,
        week_end: weekRange.weekEnd,
        status: 'submitted',
        training_rating: 4,
        recovery_rating: 4,
        nutrition_rating: 4,
      },
    })

    expect(session.required).toBe(true)
    expect(session.status.status).toBe(WEEKLY_CHECK_IN_STATUS.SUBMITTED)
    expect(session.status.submitted).toBe(true)
  })

  it('does not treat a prior-week submission as current-week completion', async () => {
    const { resolveAthleteWeeklyCheckInSession } = await import(
      './weeklyCheckInEligibility.js'
    )
    const { WEEKLY_CHECK_IN_STATUS } = await import('./weeklyCheckIn.js')

    const session = resolveAthleteWeeklyCheckInSession({
      requirements: { weekly_check_in: 'required' },
      submission: {
        week_start: '2020-01-01',
        week_end: '2020-01-07',
        status: 'submitted',
        training_rating: 4,
        recovery_rating: 4,
        nutrition_rating: 4,
      },
    })

    expect(session.required).toBe(true)
    expect([WEEKLY_CHECK_IN_STATUS.DUE, WEEKLY_CHECK_IN_STATUS.OVERDUE]).toContain(
      session.status.status,
    )
    expect(session.status.submitted).toBe(false)
  })

  it('returns not_required when RPC says not_required', async () => {
    const { resolveAthleteWeeklyCheckInSession } = await import(
      './weeklyCheckInEligibility.js'
    )
    const { WEEKLY_CHECK_IN_STATUS } = await import('./weeklyCheckIn.js')

    const session = resolveAthleteWeeklyCheckInSession({
      requirements: { weekly_check_in: 'not_required' },
      submission: null,
    })

    expect(session.required).toBe(false)
    expect(session.status.status).toBe(WEEKLY_CHECK_IN_STATUS.NOT_REQUIRED)
  })
})
