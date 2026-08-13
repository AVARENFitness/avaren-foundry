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
})
