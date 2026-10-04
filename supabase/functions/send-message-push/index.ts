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

      const userClient = createClient(supabaseUrl, anonKey, {
        global: { headers: { Authorization: authHeader } },
      })
      const admin = createClient(supabaseUrl, serviceKey)

      const {
        data: { user },
        error: userError,
      } = await userClient.auth.getUser()

      if (userError || !user) return json({ error: 'Unauthorized' }, 401)

      const { messageId } = await req.json()
      if (!messageId) return json({ error: 'message_id_required' }, 400)

      const { data: message, error: messageError } = await admin
        .from('coach_messages')
        .select(
          'id, sender_id, conversation_id, coach_conversations!inner(coach_id, athlete_id)',
        )
        .eq('id', messageId)
        .single()

      if (messageError) throw messageError
      if (message.sender_id !== user.id) {
        return json({ error: 'Forbidden' }, 403)
      }

      const conversation = Array.isArray(message.coach_conversations)
        ? message.coach_conversations[0]
        : message.coach_conversations
      const recipientId =
        conversation.coach_id === user.id
          ? conversation.athlete_id
          : conversation.coach_id

      const { data: subscriptions, error } = await admin
        .from('push_subscriptions')
        .select('id, endpoint, p256dh, auth')
        .eq('user_id', recipientId)
        .eq('active', true)

      if (error) throw error
      if (!subscriptions?.length) {
        return json({ delivered: 0, skipped: 'no_active_push_subscription' })
      }

      webpush.setVapidDetails(
        vapidSubject,
        vapidPublicKey,
        vapidPrivateKey,
      )

      const payload = JSON.stringify({
        title: 'AVAREN message',
        body: 'You have a new coaching message.',
        tag: `avaren-message-${message.conversation_id}`,
        url: '/',
      })

      let delivered = 0
      const invalidIds: string[] = []

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
            payload,
          )
          delivered += 1
        } catch (sendError) {
          const statusCode = Number(
            (sendError as { statusCode?: number }).statusCode ?? 0,
          )
          if (statusCode === 404 || statusCode === 410) {
            invalidIds.push(subscription.id)
          }
        }
      }

      if (invalidIds.length) {
        await admin
          .from('push_subscriptions')
          .update({ active: false })
          .in('id', invalidIds)
      }

      return json({ delivered })
    } catch (error) {
      console.error(error)
      return json(
        {
          error:
            error instanceof Error
              ? error.message
              : 'Unknown message push error',
        },
        500,
      )
    }
  },
}
