import {
  APPOINTMENT_NOTIFICATION_TYPES,
  buildAppointmentDedupeKey,
  buildCanonicalStartAt,
  didMaterialScheduleChange,
  resolveLinkedAthleteUserId,
} from './appointmentNotifications'

export const DELIVERY_STATUS = {
  PENDING: 'pending',
  CLAIMED: 'claimed',
  SENT: 'sent',
  FAILED: 'failed',
  SKIPPED: 'skipped',
}

export const REMINDER_CLAIM_DEDUPE_UNIQUE_CONSTRAINT =
  'appointment_notification_deliveries_dedupe_key_unique'

export const COACH_NOTIFICATIONS_DEDUPE_PARTIAL_INDEX =
  'coach_notifications_dedupe_key_unique'

export const COACH_NOTIFICATIONS_DEDUPE_PARTIAL_CONFLICT =
  'on conflict (dedupe_key) where dedupe_key is not null do nothing'

export const DEFAULT_CLAIM_TTL_MS = 10 * 60 * 1000

export const LEGACY_COACH_NOTIFICATION_TYPES = [
  'assignment-created',
  'assignment-due',
  'assignment-overdue',
  'assignment-completed',
  'coach-comment',
  'session-rsvp-confirmed',
  'session-rsvp-declined',
  'session-reminder',
]

export const APPOINTMENT_COACH_NOTIFICATION_TYPES = [
  'appointment-scheduled',
  'appointment-rescheduled',
  'appointment-cancelled',
  'appointment-athlete-confirmed',
  'appointment-athlete-cannot-attend',
  'appointment-athlete-reminder-2h',
  'appointment-coach-reminder-2h',
]

export const ALL_COACH_NOTIFICATION_TYPES = [
  ...LEGACY_COACH_NOTIFICATION_TYPES,
  ...APPOINTMENT_COACH_NOTIFICATION_TYPES,
]

export const buildRsvpTransitionDedupeKey = ({
  recipientUserId,
  appointmentId,
  notificationType,
  canonicalStartAt,
  rsvpTransitionAt,
  transitionIdentity = rsvpTransitionAt,
} = {}) =>
  buildAppointmentDedupeKey({
    recipientUserId,
    appointmentId,
    notificationType,
    canonicalStartAt,
    transitionIdentity,
  })

export const buildReminderDedupeKey = ({
  recipientUserId,
  appointmentId,
  recipientRole,
  canonicalStartAt,
} = {}) =>
  buildAppointmentDedupeKey({
    recipientUserId,
    appointmentId,
    notificationType:
      recipientRole === 'coach'
        ? APPOINTMENT_NOTIFICATION_TYPES.COACH_REMINDER_2H
        : APPOINTMENT_NOTIFICATION_TYPES.ATHLETE_REMINDER_2H,
    canonicalStartAt,
  })

export const isTerminalDeliveryStatus = (status) =>
  status === DELIVERY_STATUS.SENT || status === DELIVERY_STATUS.SKIPPED

export const isDeliveryClaimable = (
  delivery,
  now = new Date(),
  claimTtlMs = DEFAULT_CLAIM_TTL_MS,
) => {
  if (!delivery || isTerminalDeliveryStatus(delivery.deliveryStatus ?? delivery.delivery_status)) {
    return false
  }

  const status = delivery.deliveryStatus ?? delivery.delivery_status

  if (status === DELIVERY_STATUS.PENDING || status === DELIVERY_STATUS.FAILED) {
    return true
  }

  if (status !== DELIVERY_STATUS.CLAIMED) return false

  const claimExpiresAt =
    delivery.claimExpiresAt ?? delivery.claim_expires_at ?? null
  if (!claimExpiresAt) return true

  return new Date(claimExpiresAt).getTime() <= now.getTime()
}

export const claimDelivery = (
  delivery,
  now = new Date(),
  claimTtlMs = DEFAULT_CLAIM_TTL_MS,
) => {
  if (!isDeliveryClaimable(delivery, now, claimTtlMs)) return delivery

  const claimExpiresAt = new Date(now.getTime() + claimTtlMs).toISOString()

  return {
    ...delivery,
    deliveryStatus: DELIVERY_STATUS.CLAIMED,
    delivery_status: DELIVERY_STATUS.CLAIMED,
    claimedAt: now.toISOString(),
    claimed_at: now.toISOString(),
    claimExpiresAt,
    claim_expires_at: claimExpiresAt,
    updatedAt: now.toISOString(),
    updated_at: now.toISOString(),
  }
}

export const REMINDER_MARKER_FIELDS = {
  ATHLETE: 'reminder_sent_at',
  COACH: 'coach_reminder_sent_at',
}

export const resolveReminderMarkerFieldOnCompletion = ({
  notificationType,
  success = true,
} = {}) => {
  if (!success) return null

  const resolvedType = String(notificationType ?? '')

  if (resolvedType === APPOINTMENT_NOTIFICATION_TYPES.ATHLETE_REMINDER_2H) {
    return REMINDER_MARKER_FIELDS.ATHLETE
  }

  if (resolvedType === APPOINTMENT_NOTIFICATION_TYPES.COACH_REMINDER_2H) {
    return REMINDER_MARKER_FIELDS.COACH
  }

  return null
}

export const completeDelivery = (delivery, { success = true, error = null, now = new Date() } = {}) => {
  if (!delivery) return delivery

  const attemptCount = Number(delivery.attemptCount ?? delivery.attempt_count ?? 0) + 1

  if (success) {
    return {
      ...delivery,
      deliveryStatus: DELIVERY_STATUS.SENT,
      delivery_status: DELIVERY_STATUS.SENT,
      sentAt: now.toISOString(),
      sent_at: now.toISOString(),
      attemptCount,
      attempt_count: attemptCount,
      lastError: null,
      last_error: null,
      claimedAt: null,
      claimed_at: null,
      claimExpiresAt: null,
      claim_expires_at: null,
      updatedAt: now.toISOString(),
      updated_at: now.toISOString(),
    }
  }

  return {
    ...delivery,
    deliveryStatus: DELIVERY_STATUS.FAILED,
    delivery_status: DELIVERY_STATUS.FAILED,
    attemptCount,
    attempt_count: attemptCount,
    lastError: error,
    last_error: error,
    claimedAt: null,
    claimed_at: null,
    claimExpiresAt: null,
    claim_expires_at: null,
    updatedAt: now.toISOString(),
    updated_at: now.toISOString(),
  }
}

export const hasSuccessfulDelivery = (deliveries = [], dedupeKey) =>
  deliveries.some(
    (entry) =>
      (entry.dedupeKey === dedupeKey || entry.dedupe_key === dedupeKey) &&
      (entry.deliveryStatus === DELIVERY_STATUS.SENT ||
        entry.delivery_status === DELIVERY_STATUS.SENT),
  )

export const resetReminderCompatibilityMarkers = (session = {}) => ({
  ...session,
  reminderSentAt: null,
  reminder_sent_at: null,
  reminderClaimedAt: null,
  reminder_claimed_at: null,
  reminderClaimExpiresAt: null,
  reminder_claim_expires_at: null,
  coachReminderSentAt: null,
  coach_reminder_sent_at: null,
})

export const shouldResetReminderCompatibilityMarkers = (before = {}, after = {}) =>
  didMaterialScheduleChange(before, after)

export const invalidateStaleReminderDeliveries = (
  deliveries = [],
  { before = {}, after = {} } = {},
) => {
  const nextCanonicalStartAt = buildCanonicalStartAt(after)
  const previousCanonicalStartAt = buildCanonicalStartAt(before)

  if (!didMaterialScheduleChange(before, after)) return deliveries

  return deliveries.map((delivery) => {
    const notificationType =
      delivery.notificationType ?? delivery.notification_type ?? ''
    const canonicalStartAt =
      delivery.canonicalStartAt ?? delivery.canonical_start_at ?? null

    if (
      !notificationType.includes('reminder') ||
      canonicalStartAt == null ||
      canonicalStartAt === nextCanonicalStartAt
    ) {
      return delivery
    }

    if (isTerminalDeliveryStatus(delivery.deliveryStatus ?? delivery.delivery_status)) {
      return delivery
    }

    return {
      ...delivery,
      deliveryStatus: DELIVERY_STATUS.SKIPPED,
      delivery_status: DELIVERY_STATUS.SKIPPED,
      lastError: `superseded_by_reschedule:${previousCanonicalStartAt}->${nextCanonicalStartAt}`,
      last_error: `superseded_by_reschedule:${previousCanonicalStartAt}->${nextCanonicalStartAt}`,
    }
  })
}

export const buildDueReminderTargets = ({
  appointment = {},
  now = new Date(),
  openFollowUps = [],
  deliveries = [],
  isEligible = () => true,
} = {}) => {
  const targets = []

  for (const recipientRole of ['athlete', 'coach']) {
    if (
      !isEligible(appointment, {
        now,
        recipientRole,
        openFollowUps,
        reminderDeliveries: deliveries,
      })
    ) {
      continue
    }

    const recipientUserId =
      recipientRole === 'coach'
        ? appointment.coachId ?? appointment.coach_id
        : resolveLinkedAthleteUserId(appointment)

    if (!recipientUserId) continue

    const dedupeKey = buildReminderDedupeKey({
      recipientUserId,
      appointmentId: appointment.id,
      recipientRole,
      canonicalStartAt: buildCanonicalStartAt(appointment),
    })

    if (hasSuccessfulDelivery(deliveries, dedupeKey)) continue

    targets.push({
      recipientUserId,
      recipientRole,
      appointmentId: appointment.id,
      dedupeKey,
      canonicalStartAt: buildCanonicalStartAt(appointment),
    })
  }

  return targets
}
