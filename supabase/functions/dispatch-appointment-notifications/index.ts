import { createClient } from '@supabase/supabase-js'
import {
  buildAppointmentPushPayload,
  configureWebPush,
  json,
  resolvePushDeliveryOutcome,
  sendPushToSubscriptions,
  summarizePushResults,
} from '../_shared/appointmentPush.ts'
import { authorizeCronWorkerRequest } from '../_shared/cronWorkerAuth.ts'

type DeliveryRow = {
  id: string
  recipient_user_id: string
  recipient_role: string
  appointment_id: string
  notification_type: string
  dedupe_key: string
  delivery_status: string
  claim_expires_at: string | null
  coach_notification_id: string | null
  attempt_count: number | null
}

type CoachNotificationRow = {
  id: string
  title: string
  body: string
  action: string
  payload: Record<string, unknown>
  type: string
}

const CLAIM_TTL_MINUTES = 10
const BATCH_LIMIT = 25

const isClaimable = (row: DeliveryRow, nowMs: number) => {
  if (row.delivery_status === 'pending' || row.delivery_status === 'failed') {
    return true
  }

  if (row.delivery_status !== 'claimed') return false
  if (!row.claim_expires_at) return true

  return new Date(row.claim_expires_at).getTime() <= nowMs
}

const claimDelivery = async (
  admin: ReturnType<typeof createClient>,
  row: DeliveryRow,
) => {
  const now = new Date()
  const claimExpiresAt = new Date(
    now.getTime() + CLAIM_TTL_MINUTES * 60 * 1000,
  ).toISOString()

  const { data, error } = await admin
    .from('appointment_notification_deliveries')
    .update({
      delivery_status: 'claimed',
      claimed_at: now.toISOString(),
      claim_expires_at: claimExpiresAt,
      updated_at: now.toISOString(),
    })
    .eq('id', row.id)
    .neq('delivery_status', 'sent')
    .neq('delivery_status', 'skipped')
    .select('*')
    .maybeSingle()

  if (error) throw error
  return data as DeliveryRow | null
}

const completeImmediateDelivery = async (
  admin: ReturnType<typeof createClient>,
  delivery: DeliveryRow,
  outcome: {
    status: 'sent' | 'skipped' | 'failed'
    error?: string | null
    deliveredCount?: number
  },
) => {
  const attemptCount = Number(delivery.attempt_count ?? 0) + 1

  await admin
    .from('appointment_notification_deliveries')
    .update({
      delivery_status: outcome.status,
      sent_at: outcome.status === 'sent' ? new Date().toISOString() : null,
      attempt_count: attemptCount,
      last_error: outcome.error ?? null,
      claimed_at: null,
      claim_expires_at: null,
      updated_at: new Date().toISOString(),
    })
    .eq('id', delivery.id)

  if (outcome.status === 'sent' && delivery.coach_notification_id) {
    await admin
      .from('coach_notifications')
      .update({
        push_sent_at: new Date().toISOString(),
        push_delivery_count: outcome.deliveredCount ?? 0,
      })
      .eq('id', delivery.coach_notification_id)
  }
}

export default {
  async fetch(req: Request) {
    const auth = await authorizeCronWorkerRequest(req)
    if (!auth.authorized) {
      return auth.response
    }

    const admin = auth.admin

    try {
      configureWebPush()

      const { data: candidates, error: listError } = await admin
        .from('appointment_notification_deliveries')
        .select(
          'id, recipient_user_id, recipient_role, appointment_id, notification_type, dedupe_key, delivery_status, claim_expires_at, coach_notification_id, attempt_count',
        )
        .not('notification_type', 'like', '%reminder%')
        .in('delivery_status', ['pending', 'failed', 'claimed'])
        .order('scheduled_for', { ascending: true })
        .limit(BATCH_LIMIT * 3)

      if (listError) throw listError

      const nowMs = Date.now()
      const claimable = (candidates ?? [])
        .filter((row) => isClaimable(row as DeliveryRow, nowMs))
        .slice(0, BATCH_LIMIT)

      let processed = 0
      let delivered = 0
      let skipped = 0
      let failed = 0

      for (const candidate of claimable) {
        const claimed = await claimDelivery(admin, candidate as DeliveryRow)
        if (!claimed) continue

        processed += 1

        let notification: CoachNotificationRow | null = null

        if (claimed.coach_notification_id) {
          const { data, error } = await admin
            .from('coach_notifications')
            .select('id, title, body, action, payload, type')
            .eq('id', claimed.coach_notification_id)
            .maybeSingle()

          if (error) throw error
          notification = data as CoachNotificationRow | null
        }

        if (!notification) {
          await completeImmediateDelivery(admin, claimed, {
            status: 'skipped',
            error: 'missing_coach_notification',
          })
          skipped += 1
          continue
        }

        const payload = buildAppointmentPushPayload({
          title: notification.title,
          body: notification.body,
          action: notification.action,
          payload: notification.payload ?? {},
          notificationType: notification.type,
          scheduledSessionId:
            (notification.payload?.scheduledSessionId as string | undefined) ??
            claimed.appointment_id,
          dedupeKey: claimed.dedupe_key,
        })

        const { data: subscriptions, error: subscriptionError } = await admin
          .from('push_subscriptions')
          .select('id, endpoint, p256dh, auth')
          .eq('user_id', claimed.recipient_user_id)
          .eq('active', true)

        if (subscriptionError) throw subscriptionError

        console.info('Dispatching appointment notification', {
          deliveryId: claimed.id,
          appointmentId: claimed.appointment_id,
          recipientRole: claimed.recipient_role,
          notificationType: claimed.notification_type,
          subscriptionCount: subscriptions?.length ?? 0,
        })

        const results = await sendPushToSubscriptions({
          admin,
          subscriptions: subscriptions ?? [],
          payload,
        })

        const summary = summarizePushResults(results)
        const outcome = resolvePushDeliveryOutcome(summary)

        await completeImmediateDelivery(admin, claimed, {
          status: outcome.status,
          error: outcome.error,
          deliveredCount: summary.deliveredCount,
        })

        delivered += summary.deliveredCount
        if (outcome.status === 'skipped') skipped += 1
        if (outcome.status === 'failed') failed += 1
      }

      return json({ processed, delivered, skipped, failed })
    } catch (error) {
      console.error(error)
      return json(
        {
          error:
            error instanceof Error
              ? error.message
              : 'Unknown appointment dispatch error',
        },
        500,
      )
    }
  },
}
