import { describe, expect, it } from 'vitest'
import {
  CURRENT_WEEKLY_CHECK_IN_UI_STATUS,
  WEEKLY_CHECK_IN_STATUS,
  getWeeklyCheckInStatus,
  isWeeklyCheckInDue,
  resolveCurrentWeeklyCheckInState,
} from './weeklyCheckIn'
import {
  buildNotifications,
  dismissNotification,
  NOTIFICATION_TYPES,
} from './notifications'
import { WEEKLY_CHECKIN_CAPABILITY_STATUS } from './weeklyCheckInCapability'
import { FROZEN_COACH_WEEK, installFrozenCoachWeek } from '../test/frozenTime'

installFrozenCoachWeek(FROZEN_COACH_WEEK)

const now = FROZEN_COACH_WEEK

const dueStatus = getWeeklyCheckInStatus({
  hasCoach: true,
  submission: null,
  now,
})

const submittedStatus = getWeeklyCheckInStatus({
  hasCoach: true,
  submission: {
    weekStart: dueStatus.weekRange.weekStart,
    weekEnd: dueStatus.weekRange.weekEnd,
    status: 'submitted',
    trainingRating: 4,
    recoveryRating: 4,
    nutritionRating: 4,
  },
  now,
})

const baseNotificationState = {
  history: [],
  readiness: { entries: [], lastPromptedDate: null },
  weeklyCheckInCapability: {
    status: WEEKLY_CHECKIN_CAPABILITY_STATUS.AVAILABLE,
    schemaAvailable: true,
  },
  notifications: { read: [], dismissed: [], actedOn: [] },
}

describe('weekly check-in discoverability', () => {
  it('uses shared due helper for due and overdue states', () => {
    expect(isWeeklyCheckInDue(dueStatus)).toBe(true)
    expect(isWeeklyCheckInDue(submittedStatus)).toBe(false)
    expect(isWeeklyCheckInDue({ status: WEEKLY_CHECK_IN_STATUS.NOT_REQUIRED })).toBe(
      false,
    )
  })

  it('shows notification and remains due when notification is dismissed', () => {
    const fingerprint = `weekly-checkin:${dueStatus.weekKey}`
    const generated = buildNotifications({
      ...baseNotificationState,
      weeklyCheckInState: resolveCurrentWeeklyCheckInState({
        capability: baseNotificationState.weeklyCheckInCapability,
        status: dueStatus,
        loading: false,
        now,
      }),
    })

    expect(
      generated.some(
        (notification) => notification.type === NOTIFICATION_TYPES.WEEKLY_CHECKIN,
      ),
    ).toBe(true)

    const dismissed = buildNotifications({
      ...baseNotificationState,
      weeklyCheckInState: resolveCurrentWeeklyCheckInState({
        capability: baseNotificationState.weeklyCheckInCapability,
        status: dueStatus,
        loading: false,
        now,
      }),
      notifications: dismissNotification(
        baseNotificationState.notifications,
        { fingerprint },
      ),
    })

    expect(
      dismissed.some(
        (notification) => notification.type === NOTIFICATION_TYPES.WEEKLY_CHECKIN,
      ),
    ).toBe(false)
    expect(isWeeklyCheckInDue(dueStatus)).toBe(true)
  })

  it('clears notification when current week is submitted', () => {
    const generated = buildNotifications({
      ...baseNotificationState,
      weeklyCheckInState: resolveCurrentWeeklyCheckInState({
        capability: baseNotificationState.weeklyCheckInCapability,
        status: submittedStatus,
        loading: false,
        now,
      }),
    })

    expect(
      generated.some(
        (notification) => notification.type === NOTIFICATION_TYPES.WEEKLY_CHECKIN,
      ),
    ).toBe(false)
    expect(isWeeklyCheckInDue(submittedStatus)).toBe(false)
  })
})
