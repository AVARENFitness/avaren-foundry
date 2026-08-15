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

export default {
  async fetch(req: Request) {
    if (req.method === 'OPTIONS') {
      return new Response('ok', { headers: corsHeaders })
    }

    try {
      const authHeader = req.headers.get('Authorization')
      if (!authHeader) return json({ error: 'Unauthorized' }, 401)

      const supabaseUrl = Deno.env.get('SUPABASE_URL')!
      const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!
      const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
      const vapidPublicKey = Deno.env.get('VAPID_PUBLIC_KEY')!
      const vapidPrivateKey = Deno.env.get('VAPID_PRIVATE_KEY')!
      const vapidSubject =
        Deno.env.get('VAPID_SUBJECT') ??
        'mailto:hello@avarenfitness.com'

      if (!vapidPublicKey || !vapidPrivateKey) {
        return json({ error: 'VAPID secrets are missing' }, 500)
      }

      const userClient = createClient(supabaseUrl, anonKey, {
        global: { headers: { Authorization: authHeader } },
      })
      const admin = createClient(supabaseUrl, serviceKey)

      const {
        data: { user },
        error: userError,
      } = await userClient.auth.getUser()

      if (userError || !user) return json({ error: 'Unauthorized' }, 401)

      const { assignmentId, eventType = 'assigned', title: requestedTitle, body: requestedBody } = await req.json()
      if (!assignmentId) {
        return json({ error: 'assignmentId is required' }, 400)
      }

      const { data: assignment, error: assignmentError } =
        await admin
          .from('coach_assignments')
          .select('*')
          .eq('id', assignmentId)
          .eq('coach_id', user.id)
          .single()

      if (assignmentError || !assignment) {
        return json({ error: 'Assignment not found' }, 404)
      }

      const { data: subscriptions, error: subscriptionError } =
        await admin
          .from('push_subscriptions')
          .select('*')
          .eq('user_id', assignment.athlete_id)
          .eq('active', true)

      if (subscriptionError) throw subscriptionError

      webpush.setVapidDetails(
        vapidSubject,
        vapidPublicKey,
        vapidPrivateKey,
      )

      const dueText = assignment.due_date
        ? ` · Due ${new Date(`${assignment.due_date}T12:00:00Z`).toLocaleDateString('en-US', {
            month: 'short',
            day: 'numeric',
            timeZone: 'UTC',
          })}`
        : ''

      const pushTitle = requestedTitle ?? (eventType === 'rescheduled' ? 'Workout rescheduled' : 'New workout assigned')
      const pushBody = requestedBody ?? `${assignment.title}${dueText}`

      const payload = JSON.stringify({
        title: pushTitle,
        body: pushBody,
        assignmentId: assignment.id,
        url: `/?assignment=${encodeURIComponent(assignment.id)}`,
        tag: `assignment-${assignment.id}`,
      })

      let delivered = 0

      const deliverable = (subscriptions ?? []).filter(
        (subscription) =>
          subscription.user_id === assignment.athlete_id && subscription.active,
      )

      const seenEndpoints = new Set<string>()

      for (const subscription of deliverable) {
        if (seenEndpoints.has(subscription.endpoint)) continue
        seenEndpoints.add(subscription.endpoint)

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
            console.error('Push delivery failed', error)
          }
        }
      }

      await admin
        .from('coach_notifications')
        .update({
          push_sent_at: new Date().toISOString(),
          push_delivery_count: delivered,
        })
        .eq('assignment_id', assignment.id)
        .eq('type', 'assignment-created')

      return json({ delivered })
    } catch (error) {
      console.error(error)
      return json(
        {
          error:
            error instanceof Error
              ? error.message
              : 'Unknown push error',
        },
        500,
      )
    }
  },
}
