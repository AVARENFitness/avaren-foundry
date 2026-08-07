import { createClient } from '@supabase/supabase-js'
import webpush from 'web-push'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type',
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: {
      ...corsHeaders,
      'Content-Type': 'application/json',
    },
  })

const formatStartsAt = (startsAt: string, timeZone = 'America/New_York') => {
  const parsed = new Date(startsAt)
  if (!Number.isFinite(parsed.getTime())) return 'your session'
  return parsed.toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
    timeZone,
  })
}

export default {
  async fetch(req: Request) {
    if (req.method === 'OPTIONS') {
      return new Response('ok', { headers: corsHeaders })
    }

    try {
      const supabaseUrl = Deno.env.get('SUPABASE_URL')!
      const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
      const vapidPublicKey = Deno.env.get('VAPID_PUBLIC_KEY')!
      const vapidPrivateKey = Deno.env.get('VAPID_PRIVATE_KEY')!
      const vapidSubject =
        Deno.env.get('VAPID_SUBJECT') ?? 'mailto:hello@avarenfitness.com'

      if (!vapidPublicKey || !vapidPrivateKey) {
        return json({ error: 'VAPID secrets are missing' }, 500)
      }

      const admin = createClient(supabaseUrl, serviceKey)

      const { data: sessions, error: claimError } = await admin.rpc(
        'claim_session_reminder_targets',
        { p_limit: 25, p_claim_ttl_minutes: 10 },
      )

      if (claimError) throw claimError

      webpush.setVapidDetails(
        vapidSubject,
        vapidPublicKey,
        vapidPrivateKey,
      )

      let delivered = 0
      let processed = 0
      let completed = 0
      let released = 0

      for (const session of sessions ?? []) {
        processed += 1

        if (!session.starts_at) {
          await admin.rpc('release_session_reminder_claim', {
            p_session_id: session.id,
          })
          released += 1
          continue
        }

        const { data: coachUser, error: coachError } =
          await admin.auth.admin.getUserById(session.coach_id)

        if (coachError) {
          console.error('Coach lookup failed', coachError)
          await admin.rpc('release_session_reminder_claim', {
            p_session_id: session.id,
          })
          released += 1
          continue
        }

        const coachName =
          coachUser.user?.user_metadata?.display_name ??
          coachUser.user?.email?.split('@')[0] ??
          'your coach'

        const timeZone = session.schedule_timezone ?? 'America/New_York'
        const pushTitle = `Training at ${formatStartsAt(session.starts_at, timeZone)} with ${coachName}`
        const pushBody = 'Are you still able to make it?'

        await admin.from('coach_notifications').insert({
          recipient_id: session.athlete_id,
          actor_id: session.coach_id,
          scheduled_session_id: session.id,
          type: 'session-reminder',
          title: pushTitle,
          body: pushBody,
          action: 'open-session-rsvp',
          payload: {
            scheduledSessionId: session.id,
            startsAt: session.starts_at,
            scheduleTimezone: timeZone,
            coachName,
          },
        })

        const { data: subscriptions, error: subscriptionError } = await admin
          .from('push_subscriptions')
          .select('*')
          .eq('user_id', session.athlete_id)
          .eq('active', true)

        if (subscriptionError) {
          await admin.rpc('release_session_reminder_claim', {
            p_session_id: session.id,
          })
          released += 1
          throw subscriptionError
        }

        const payload = JSON.stringify({
          title: pushTitle,
          body: pushBody,
          sessionId: session.id,
          url: `/?session=${encodeURIComponent(session.id)}&open=session-rsvp`,
          tag: `session-reminder-${session.id}`,
          actions: [
            { action: 'confirm', title: 'Confirm' },
            { action: 'decline', title: "Can't make it" },
          ],
        })

        let sessionDelivered = 0

        for (const subscription of subscriptions ?? []) {
          try {
            await webpush.sendNotification(
              {
                endpoint: subscription.endpoint,
                keys: {
                  p256dh: subscription.p256dh,
                  auth: subscription.auth,
                },
              },
              payload,
            )
            sessionDelivered += 1
            delivered += 1
          } catch (error) {
            const statusCode = Number(
              (error as { statusCode?: number }).statusCode ?? 0,
            )

            if (statusCode === 404 || statusCode === 410) {
              await admin
                .from('push_subscriptions')
                .update({ active: false })
                .eq('id', subscription.id)
            } else {
              console.error('Session reminder push failed', error)
            }
          }
        }

        const shouldComplete =
          sessionDelivered > 0 || (subscriptions ?? []).length === 0

        if (shouldComplete) {
          const { data: didComplete } = await admin.rpc(
            'complete_session_reminder',
            { p_session_id: session.id },
          )
          if (didComplete) completed += 1
        } else {
          const { data: didRelease } = await admin.rpc(
            'release_session_reminder_claim',
            { p_session_id: session.id },
          )
          if (didRelease) released += 1
        }
      }

      return json({ processed, delivered, completed, released })
    } catch (error) {
      console.error(error)
      return json(
        {
          error:
            error instanceof Error
              ? error.message
              : 'Unknown reminder error',
        },
        500,
      )
    }
  },
}
