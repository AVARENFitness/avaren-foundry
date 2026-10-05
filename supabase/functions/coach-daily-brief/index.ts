import { createClient } from '@supabase/supabase-js'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type',
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })

const trim = (value: unknown, max = 4000) =>
  String(value ?? '').trim().slice(0, max)

const ACTION_TYPES = new Set([
  'open_client',
  'open_training',
  'open_sessions',
])

const sanitizePacket = (packet: any, allowedIds: Set<string>) => {
  const filter = (items: any[] = []) =>
    items
      .filter((item) => allowedIds.has(String(item?.businessClientId ?? '')))
      .map((item) => ({
        ...item,
        businessClientId: String(item.businessClientId),
        clientName: trim(item.clientName, 120),
      }))

  return {
    date: trim(packet?.date, 20),
    attention: filter(packet?.attention).slice(0, 6),
    today: filter(packet?.today).slice(0, 8),
    wins: filter(packet?.wins).slice(0, 5),
  }
}

const systemPrompt = `You are AVA, the coach-intelligence layer inside AVAREN.
Your audience is a professional personal trainer running their business in AVAREN.

You receive a compact packet of already-filtered AVAREN facts. These facts are authoritative.
Your job is to compress and prioritize them, not invent new information.

Rules:
- Never invent symptoms, adherence, injuries, missed sessions, goals, nutrition data, or progress.
- Never make a medical diagnosis.
- Never imply a problem if the packet does not support it.
- Needs-attention items should be selective and short.
- "Before you train" cues should help the coach prepare in seconds.
- Wins should only repeat or clearly summarize supplied wins.
- Use calm, concise language.
- Keep each client to one main action.
- Allowed actionType values: open_client, open_training, open_sessions.
- Use only businessClientId values supplied in the packet.
- Return strict JSON only.

Return:
{
  "headline":"short coach-facing headline",
  "summary":"1 concise sentence",
  "attention":[
    {
      "businessClientId":"uuid",
      "clientName":"name",
      "title":"short issue",
      "why":"one grounded sentence",
      "actionLabel":"short action label",
      "actionType":"open_client|open_training|open_sessions"
    }
  ],
  "todayPrep":[
    {
      "sessionId":"session id or null",
      "businessClientId":"uuid",
      "clientName":"name",
      "cue":"one grounded pre-session cue",
      "actionLabel":"Open client",
      "actionType":"open_client"
    }
  ],
  "wins":[
    {
      "businessClientId":"uuid",
      "clientName":"name",
      "line":"one grounded positive line"
    }
  ]
}`

const sanitizeBrief = (raw: any, allowedIds: Set<string>) => {
  if (!raw || typeof raw !== 'object') return null

  const normalizeAction = (item: any) => {
    const businessClientId = String(item?.businessClientId ?? '')
    if (!allowedIds.has(businessClientId)) return null
    const actionType = ACTION_TYPES.has(String(item?.actionType))
      ? String(item.actionType)
      : 'open_client'
    return {
      businessClientId,
      clientName: trim(item?.clientName, 120),
      title: trim(item?.title, 180),
      why: trim(item?.why, 320),
      cue: trim(item?.cue, 320),
      actionLabel: trim(item?.actionLabel || 'Open client', 80),
      actionType,
      sessionId: item?.sessionId ? trim(item.sessionId, 120) : null,
    }
  }

  return {
    headline: trim(raw.headline, 180),
    summary: trim(raw.summary, 420),
    attention: Array.isArray(raw.attention)
      ? raw.attention.map(normalizeAction).filter(Boolean).slice(0, 3)
      : [],
    todayPrep: Array.isArray(raw.todayPrep)
      ? raw.todayPrep.map(normalizeAction).filter(Boolean).slice(0, 4)
      : [],
    wins: Array.isArray(raw.wins)
      ? raw.wins
          .map((item: any) => {
            const businessClientId = String(item?.businessClientId ?? '')
            if (!allowedIds.has(businessClientId)) return null
            return {
              businessClientId,
              clientName: trim(item?.clientName, 120),
              line: trim(item?.line, 320),
            }
          })
          .filter(Boolean)
          .slice(0, 3)
      : [],
  }
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (req.method !== 'POST') return json({ ok: false, reason: 'method-not-allowed' }, 405)

  try {
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) return json({ ok: false, reason: 'unauthorized' }, 401)

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!
    const apiKey = Deno.env.get('OPENAI_API_KEY')
    const model = Deno.env.get('AVA_CHAT_MODEL') || 'gpt-4o-mini'

    if (!apiKey) return json({ ok: false, reason: 'model-not-configured' }, 503)

    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    })

    const {
      data: { user },
      error: userError,
    } = await userClient.auth.getUser()

    if (userError || !user) return json({ ok: false, reason: 'unauthorized' }, 401)

    const body = await req.json()
    const packet = body?.packet
    if (!packet || typeof packet !== 'object') {
      return json({ ok: false, reason: 'invalid-request' }, 400)
    }

    const requestedIds = [
      ...(Array.isArray(packet.attention) ? packet.attention : []),
      ...(Array.isArray(packet.today) ? packet.today : []),
      ...(Array.isArray(packet.wins) ? packet.wins : []),
    ]
      .map((item: any) => String(item?.businessClientId ?? ''))
      .filter(Boolean)

    const uniqueIds = [...new Set(requestedIds)].slice(0, 30)
    if (!uniqueIds.length) {
      return json({
        ok: true,
        brief: {
          headline: 'No urgent coaching issues surfaced',
          summary: 'AVAREN has no client-specific coaching items to prioritize right now.',
          attention: [],
          todayPrep: [],
          wins: [],
        },
      })
    }

    const { data: ownedClients, error: clientError } = await userClient
      .from('coach_business_clients')
      .select('id')
      .eq('coach_id', user.id)
      .in('id', uniqueIds)

    if (clientError) {
      return json({ ok: false, reason: 'client-authorization-failed' }, 403)
    }

    const allowedIds = new Set((ownedClients ?? []).map((row: any) => String(row.id)))
    const sanitizedPacket = sanitizePacket(packet, allowedIds)

    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 25000)

    try {
      const response = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        signal: controller.signal,
        body: JSON.stringify({
          model,
          temperature: 0.2,
          max_tokens: 700,
          response_format: { type: 'json_object' },
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: JSON.stringify(sanitizedPacket) },
          ],
        }),
      })

      if (!response.ok) {
        console.error('coach_daily_brief_openai_error', response.status)
        return json({ ok: false, reason: 'model-error' }, 502)
      }

      const responseBody = await response.json()
      const textContent = responseBody?.choices?.[0]?.message?.content
      if (!textContent) {
        return json({ ok: false, reason: 'empty-model-response' }, 502)
      }

      let parsed
      try {
        parsed = JSON.parse(textContent)
      } catch {
        return json({ ok: false, reason: 'invalid-model-json' }, 502)
      }

      const brief = sanitizeBrief(parsed, allowedIds)
      if (!brief) {
        return json({ ok: false, reason: 'invalid-model-response' }, 502)
      }

      return json({ ok: true, brief })
    } finally {
      clearTimeout(timeout)
    }
  } catch (error) {
    console.error(
      'coach_daily_brief_failed',
      error instanceof Error ? error.name : 'error',
    )
    return json({ ok: false, reason: 'brief-failed' }, 500)
  }
})
