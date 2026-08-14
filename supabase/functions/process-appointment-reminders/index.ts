import {
  buildReminderPushPayload,
  configureWebPush,
  json,
  resolvePushDeliveryOutcome,
  sendPushToSubscriptions,
  summarizePushResults,
} from '../_shared/appointmentPush.ts'
import { authorizeCronWorkerRequest } from '../_shared/cronWorkerAuth.ts'

type ReminderTarget = {
  delivery_id: string
  recipient_user_id: string
  recipient_role: string
  appointment_id: string
  notification_type: string
  canonical_start_at: string
  dedupe_key: string
  coach_id: string
  athlete_label: string
  rsvp_status: string
  schedule_timezone: string
  starts_at: string
  start_time: string
  session_date: string
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

      const { data: targets, error: claimError } = await admin.rpc(
        'claim_appointment_reminder_targets',
        { p_limit: 25, p_claim_ttl_minutes: 10 },
      )

      if (claimError) throw claimError

      let processed = 0
      let delivered = 0
      let completed = 0
      let released = 0
      let skipped = 0

      for (const target of (targets ?? []) as ReminderTarget[]) {
        processed += 1

        const payload = buildReminderPushPayload(
          {
            ...target,
            appointmentId: target.appointment_id,
            recipientRole: target.recipient_role,
            notificationType: target.notification_type,
            dedupeKey: target.dedupe_key,
            startsAt: target.starts_at,
            startTime: target.start_time,
            sessionDate: target.session_date,
            scheduleTimezone: target.schedule_timezone,
            rsvpStatus: target.rsvp_status,
          },
          target.athlete_label,
        )

        const { data: subscriptions, error: subscriptionError } = await admin
          .from('push_subscriptions')
          .select('id, endpoint, p256dh, auth')
          .eq('user_id', target.recipient_user_id)
          .eq('active', true)

        if (subscriptionError) {
          await admin.rpc('release_appointment_reminder_claim', {
            p_delivery_id: target.delivery_id,
            p_error: subscriptionError.message,
          })
          released += 1
          throw subscriptionError
        }

        console.info('Dispatching appointment reminder', {
          deliveryId: target.delivery_id,
          appointmentId: target.appointment_id,
          recipientRole: target.recipient_role,
          notificationType: target.notification_type,
          subscriptionCount: subscriptions?.length ?? 0,
        })

        const results = await sendPushToSubscriptions({
          admin,
          subscriptions: subscriptions ?? [],
          payload,
        })

        const summary = summarizePushResults(results)
        const outcome = resolvePushDeliveryOutcome(summary)
        delivered += summary.deliveredCount

        if (outcome.status === 'skipped') {
          await admin
            .from('appointment_notification_deliveries')
            .update({
              delivery_status: 'skipped',
              last_error: outcome.error,
              attempt_count: 1,
              claimed_at: null,
              claim_expires_at: null,
              updated_at: new Date().toISOString(),
            })
            .eq('id', target.delivery_id)

          skipped += 1
          continue
        }

        if (outcome.status === 'sent') {
          const { data: didComplete, error: completeError } = await admin.rpc(
            'complete_appointment_reminder_delivery',
            {
              p_delivery_id: target.delivery_id,
              p_success: true,
              p_error: null,
            },
          )

          if (completeError) throw completeError
          if (didComplete) completed += 1
          continue
        }

        const { data: didRelease, error: releaseError } = await admin.rpc(
          'release_appointment_reminder_claim',
          {
            p_delivery_id: target.delivery_id,
            p_error: outcome.error,
          },
        )

        if (releaseError) throw releaseError
        if (didRelease) released += 1
      }

      return json({ processed, delivered, completed, released, skipped })
    } catch (error) {
      console.error(error)
      return json(
        {
          error:
            error instanceof Error
              ? error.message
              : 'Unknown appointment reminder error',
        },
        500,
      )
    }
  },
}
