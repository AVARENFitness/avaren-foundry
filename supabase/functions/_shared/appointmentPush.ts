import webpush from 'web-push'

export const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type',
}

export const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: {
      ...corsHeaders,
      'Content-Type': 'application/json',
    },
  })

export type PushSubscriptionRow = {
  id: string
  endpoint: string
  p256dh: string
  auth: string
}

export type PushSendResult = {
  subscriptionId: string
  success: boolean
  invalidSubscription: boolean
}

export const isInvalidPushSubscriptionStatus = (statusCode: number) =>
  statusCode === 404 || statusCode === 410

export const buildAppointmentPushUrl = ({
  action,
  payload = {},
  scheduledSessionId = null,
}: {
  action?: string | null
  payload?: Record<string, unknown>
  scheduledSessionId?: string | null
} = {}) => {
  const sessionId =
    scheduledSessionId ??
    (payload.scheduledSessionId as string | undefined) ??
    (payload.scheduled_session_id as string | undefined) ??
    null

  if (action === 'open-coach-calendar' && sessionId) {
    return `/?open=coach-calendar&session=${encodeURIComponent(sessionId)}`
  }

  if (action === 'open-athlete-schedule') {
    return '/?open=athlete-schedule'
  }

  if (
    payload.openTarget === 'athlete-schedule' ||
    payload.open_target === 'athlete-schedule'
  ) {
    return '/?open=athlete-schedule'
  }

  if (sessionId) {
    return `/?session=${encodeURIComponent(sessionId)}&open=appointment-detail`
  }

  return '/?open=notifications'
}

export const buildAppointmentPushPayload = ({
  title,
  body,
  action,
  payload = {},
  notificationType,
  scheduledSessionId = null,
  dedupeKey = null,
}: {
  title?: string | null
  body?: string | null
  action?: string | null
  payload?: Record<string, unknown>
  notificationType?: string | null
  scheduledSessionId?: string | null
  dedupeKey?: string | null
} = {}) => {
  const sessionId =
    scheduledSessionId ??
    (payload.scheduledSessionId as string | undefined) ??
    (payload.scheduled_session_id as string | undefined) ??
    null

  const url = buildAppointmentPushUrl({ action, payload, scheduledSessionId: sessionId })
  const tag =
    dedupeKey ??
    (notificationType && sessionId
      ? `${notificationType}:${sessionId}`
      : sessionId ?? 'avaren-appointment')

  return {
    title: title ?? 'AVAREN',
    body: body ?? 'You have a training update.',
    sessionId,
    url,
    tag,
    notificationType: notificationType ?? null,
  }
}

const formatTimeLabel = (
  target: Record<string, unknown>,
  timeZone = 'America/New_York',
) => {
  const startTime = target.startTime ?? target.start_time
  if (typeof startTime === 'string' && startTime.trim()) {
    const [hours, minutes] = startTime.split(':').map(Number)
    if (Number.isFinite(hours) && Number.isFinite(minutes)) {
      const date = new Date(Date.UTC(2026, 0, 1, hours, minutes))
      return date.toLocaleTimeString('en-US', {
        hour: 'numeric',
        minute: '2-digit',
        timeZone: 'UTC',
      })
    }
  }

  const startsAt = target.startsAt ?? target.starts_at ?? target.canonicalStartAt
  if (typeof startsAt === 'string' && startsAt) {
    const parsed = new Date(startsAt)
    if (Number.isFinite(parsed.getTime())) {
      return parsed.toLocaleTimeString('en-US', {
        hour: 'numeric',
        minute: '2-digit',
        timeZone,
      })
    }
  }

  return 'your session'
}

const formatDayLabel = (target: Record<string, unknown>) => {
  const sessionDate = target.sessionDate ?? target.session_date
  if (typeof sessionDate === 'string' && sessionDate) {
    const [year, month, day] = sessionDate.split('-').map(Number)
    if ([year, month, day].every(Number.isFinite)) {
      const date = new Date(year, month - 1, day)
      return date.toLocaleDateString('en-US', { weekday: 'short' })
    }
  }

  const startsAt = target.startsAt ?? target.starts_at
  const timeZone =
    (target.scheduleTimezone as string | undefined) ??
    (target.schedule_timezone as string | undefined) ??
    'America/New_York'

  if (typeof startsAt === 'string' && startsAt) {
    const parsed = new Date(startsAt)
    if (Number.isFinite(parsed.getTime())) {
      return parsed.toLocaleDateString('en-US', {
        weekday: 'short',
        timeZone,
      })
    }
  }

  return 'Session'
}

export const buildReminderPushPayload = (
  target: Record<string, unknown>,
  athleteLabel = 'Athlete',
) => {
  const notificationType =
    (target.notificationType as string | undefined) ??
    (target.notification_type as string | undefined) ??
    ((target.recipientRole ?? target.recipient_role) === 'coach'
      ? 'appointment-coach-reminder-2h'
      : 'appointment-athlete-reminder-2h')

  const timeZone =
    (target.scheduleTimezone as string | undefined) ??
    (target.schedule_timezone as string | undefined) ??
    'America/New_York'

  const timeLabel = formatTimeLabel(target, timeZone)
  const dayLabel = formatDayLabel(target)
  const rsvpStatus = target.rsvpStatus ?? target.rsvp_status

  const isCoach = notificationType === 'appointment-coach-reminder-2h'
  const title = 'Training in 2 hours'
  const body = isCoach
    ? rsvpStatus === 'confirmed'
      ? `${athleteLabel} · ${timeLabel} · Confirmed`
      : rsvpStatus === 'awaiting'
        ? `${athleteLabel} · ${timeLabel} · Awaiting response`
        : `${athleteLabel} · ${timeLabel}`
    : `Your session starts at ${timeLabel}.`

  const appointmentId =
    (target.appointmentId as string | undefined) ??
    (target.appointment_id as string | undefined)

  return buildAppointmentPushPayload({
    title,
    body,
    action: isCoach ? 'open-coach-calendar' : 'open-appointment-detail',
    payload: {
      scheduledSessionId: appointmentId,
      startsAt: target.startsAt ?? target.starts_at,
      scheduleTimezone: timeZone,
    },
    notificationType,
    scheduledSessionId: appointmentId ?? null,
    dedupeKey:
      (target.dedupeKey as string | undefined) ??
      (target.dedupe_key as string | undefined) ??
      null,
  })
}

export const configureWebPush = () => {
  const vapidPublicKey = Deno.env.get('VAPID_PUBLIC_KEY')!
  const vapidPrivateKey = Deno.env.get('VAPID_PRIVATE_KEY')!
  const vapidSubject =
    Deno.env.get('VAPID_SUBJECT') ?? 'mailto:hello@avarenfitness.com'

  if (!vapidPublicKey || !vapidPrivateKey) {
    throw new Error('VAPID secrets are missing')
  }

  webpush.setVapidDetails(vapidSubject, vapidPublicKey, vapidPrivateKey)
}

export const sendPushToSubscriptions = async ({
  admin,
  subscriptions,
  payload,
}: {
  admin: {
    from: (table: string) => {
      update: (values: Record<string, unknown>) => {
        eq: (column: string, value: string) => Promise<unknown>
      }
    }
  }
  subscriptions: PushSubscriptionRow[]
  payload: Record<string, unknown>
}): Promise<PushSendResult[]> => {
  const serialized = JSON.stringify(payload)
  const results: PushSendResult[] = []

  for (const subscription of subscriptions) {
    try {
      await webpush.sendNotification(
        {
          endpoint: subscription.endpoint,
          keys: {
            p256dh: subscription.p256dh,
            auth: subscription.auth,
          },
        },
        serialized,
      )
      results.push({
        subscriptionId: subscription.id,
        success: true,
        invalidSubscription: false,
      })
    } catch (error) {
      const statusCode = Number(
        (error as { statusCode?: number }).statusCode ?? 0,
      )

      if (isInvalidPushSubscriptionStatus(statusCode)) {
        await admin
          .from('push_subscriptions')
          .update({ active: false })
          .eq('id', subscription.id)
        results.push({
          subscriptionId: subscription.id,
          success: false,
          invalidSubscription: true,
        })
      } else {
        console.error('Push delivery failed', {
          subscriptionId: subscription.id,
          statusCode,
          message:
            error instanceof Error ? error.message : 'Unknown push error',
        })
        results.push({
          subscriptionId: subscription.id,
          success: false,
          invalidSubscription: false,
        })
      }
    }
  }

  return results
}

export const resolvePushDeliveryOutcome = ({
  subscriptionCount = 0,
  deliveredCount = 0,
  hadTransientFailure = false,
}: {
  subscriptionCount?: number
  deliveredCount?: number
  hadTransientFailure?: boolean
} = {}) => {
  if (subscriptionCount === 0) {
    return {
      status: 'skipped' as const,
      error: 'no_active_push_subscription',
      retryable: false,
    }
  }

  if (deliveredCount > 0) {
    return {
      status: 'sent' as const,
      error: null,
      retryable: false,
    }
  }

  if (hadTransientFailure) {
    return {
      status: 'failed' as const,
      error: 'push_delivery_failed',
      retryable: true,
    }
  }

  return {
    status: 'skipped' as const,
    error: 'no_deliverable_push_subscription',
    retryable: false,
  }
}

export const summarizePushResults = (results: PushSendResult[]) => ({
  subscriptionCount: results.length,
  deliveredCount: results.filter((entry) => entry.success).length,
  hadTransientFailure: results.some(
    (entry) => !entry.success && !entry.invalidSubscription,
  ),
})
