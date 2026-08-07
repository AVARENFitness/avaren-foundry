import { describe, expect, it } from 'vitest'
import { buildStartsAtIso } from './sessionTimezone'
import {
  canClaimReminder,
  isReminderEligible,
  resetReminderStateOnReschedule,
  shouldCompleteReminderDispatch,
  shouldReleaseReminderClaim,
  shouldSkipReminder,
} from './sessionReminders'

describe('sessionReminders', () => {
  const session = {
    id: 'sess-1',
    status: 'scheduled',
    startsAt: '2026-08-07T20:00:00.000Z',
    scheduleTimezone: 'America/New_York',
    reminderSentAt: null,
    reminderClaimedAt: null,
    reminderClaimExpiresAt: null,
  }

  it('builds starts_at from wall clock in America/New_York', () => {
    const iso = buildStartsAtIso(
      '2026-08-07',
      '16:00',
      'America/New_York',
    )
    expect(iso).toBe('2026-08-07T20:00:00.000Z')
  })

  it('uses starts_at timestamptz for reminder timing', () => {
    const now = new Date('2026-08-07T18:00:00.000Z')
    expect(isReminderEligible(session, now)).toBe(true)

    const tooEarly = new Date('2026-08-07T17:59:00.000Z')
    expect(isReminderEligible(session, tooEarly)).toBe(false)
  })

  it('skips reminders without starts_at', () => {
    expect(
      shouldSkipReminder({
        ...session,
        startsAt: null,
      }),
    ).toBe(true)
  })

  it('skips cancelled and completed sessions', () => {
    expect(shouldSkipReminder({ ...session, status: 'cancelled' })).toBe(true)
    expect(shouldSkipReminder({ ...session, status: 'completed' })).toBe(true)
  })

  it('allows retry after an expired claim', () => {
    const claimed = {
      ...session,
      reminderClaimedAt: '2026-08-07T18:55:00.000Z',
      reminderClaimExpiresAt: '2026-08-07T19:05:00.000Z',
    }
    const now = new Date('2026-08-07T19:10:00.000Z')

    expect(canClaimReminder(claimed, now)).toBe(true)
  })

  it('blocks duplicate claims while lock is active', () => {
    const claimed = {
      ...session,
      reminderClaimedAt: '2026-08-07T18:55:00.000Z',
      reminderClaimExpiresAt: '2026-08-07T19:10:00.000Z',
    }
    const now = new Date('2026-08-07T19:00:00.000Z')

    expect(canClaimReminder(claimed, now)).toBe(false)
  })

  it('completes only after successful dispatch', () => {
    expect(
      shouldCompleteReminderDispatch({ delivered: 1, subscriptionCount: 2 }),
    ).toBe(true)
    expect(
      shouldCompleteReminderDispatch({ delivered: 0, subscriptionCount: 0 }),
    ).toBe(true)
    expect(
      shouldReleaseReminderClaim({ delivered: 0, subscriptionCount: 2 }),
    ).toBe(true)
    expect(
      shouldCompleteReminderDispatch({ delivered: 0, subscriptionCount: 2 }),
    ).toBe(false)
  })

  it('resets reminder delivery state when rescheduled', () => {
    const reset = resetReminderStateOnReschedule({
      ...session,
      reminderSentAt: '2026-08-07T18:00:00.000Z',
      reminderClaimedAt: '2026-08-07T17:59:00.000Z',
      reminderClaimExpiresAt: '2026-08-07T18:09:00.000Z',
    })

    expect(reset.reminderSentAt).toBeNull()
    expect(reset.reminderClaimedAt).toBeNull()
    expect(reset.reminderClaimExpiresAt).toBeNull()
  })

  it('never reminds after reminder_sent_at is set', () => {
    expect(
      shouldSkipReminder({
        ...session,
        reminderSentAt: '2026-08-07T19:00:00.000Z',
      }),
    ).toBe(true)
  })
})
