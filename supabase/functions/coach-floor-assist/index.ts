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

const ALLOWED_MODES = new Set(['pre_session', 'organize_note', 'recap'])

const systemPrompt = (mode: string) => {
  const shared = `You are AVA inside AVAREN, assisting a professional personal trainer during an in-person coaching session.
Use only the supplied session facts. Never diagnose an injury. Never invent loads, reps, symptoms, goals, or prior performance. Be concise, useful, premium, and coach-facing unless producing the athlete recap. Return strict JSON only.`

  if (mode === 'pre_session') {
    return shared + `
Return:
{"brief":"2-3 concise sentences","watchFor":["up to 3 grounded items"],"openingCue":"one short coaching cue"}
Focus on what matters before the first working set. If context is sparse, say so briefly rather than inventing anything.`
  }

  if (mode === 'organize_note') {
    return shared + `
Return:
{"cleanedNote":"cleaned version of the coach's note without changing meaning","observations":["up to 5 factual observations explicitly present in the note"]}
Do not turn the note into medical advice or add facts.`
  }

  return shared + `
Return:
{"recap":"2-4 sentence athlete-facing session recap"}
The recap should sound like a good coach: specific, encouraging without hype, and grounded in completed sets plus the coach note. Do not expose anything labeled private beyond the exact coachNote supplied for this recap request. Do not invent progress claims unless the supplied previousSession supports them.`
}

const sanitize = (mode: string, raw: any) => {
  if (!raw || typeof raw !== 'object') return null

  if (mode === 'pre_session') {
    const brief = trim(raw.brief, 900)
    if (!brief) return null
    return {
      brief,
      watchFor: Array.isArray(raw.watchFor)
        ? raw.watchFor.map((item: unknown) => trim(item, 180)).filter(Boolean).slice(0, 3)
        : [],
      openingCue: trim(raw.openingCue, 180),
    }
  }

  if (mode === 'organize_note') {
    const cleanedNote = trim(raw.cleanedNote, 2400)
    if (!cleanedNote) return null
    return {
      cleanedNote,
      observations: Array.isArray(raw.observations)
        ? raw.observations
            .map((item: unknown) => trim(item, 180))
            .filter(Boolean)
            .slice(0, 5)
        : [],
    }
  }

  const recap = trim(raw.recap, 1600)
  return recap ? { recap } : null
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
    const scheduledSessionId = trim(body?.scheduledSessionId, 100)
    const floorSessionId = trim(body?.floorSessionId, 100)
    const mode = trim(body?.mode, 40)

    if ((!scheduledSessionId && !floorSessionId) || !ALLOWED_MODES.has(mode)) {
      return json({ ok: false, reason: 'invalid-request' }, 400)
    }

    let session: any = null
    let floorSession: any = null

    if (scheduledSessionId) {
      const result = await userClient
        .from('coach_scheduled_sessions')
        .select('id, coach_id, athlete_id, business_client_id, assignment_id, coach_note, session_date, start_time')
        .eq('id', scheduledSessionId)
        .eq('coach_id', user.id)
        .maybeSingle()

      if (result.error || !result.data) {
        return json({ ok: false, reason: 'session-not-authorized' }, 403)
      }
      session = result.data
    } else {
      const result = await userClient
        .from('coach_floor_sessions')
        .select('id, coach_id, athlete_id, business_client_id, started_at, workout_name')
        .eq('id', floorSessionId)
        .eq('coach_id', user.id)
        .maybeSingle()

      if (result.error || !result.data) {
        return json({ ok: false, reason: 'floor-session-not-authorized' }, 403)
      }
      floorSession = result.data
    }

    const payload = {
      clientName: trim(body?.clientName, 160),
      appointment: session
        ? {
            sessionDate: session.session_date,
            startTime: session.start_time,
            hasLinkedAthlete: Boolean(session.athlete_id),
            hasAssignment: Boolean(session.assignment_id),
            appointmentCoachNote: trim(session.coach_note, 800),
          }
        : {
            sessionDate: floorSession?.started_at
              ? String(floorSession.started_at).slice(0, 10)
              : null,
            startTime: floorSession?.started_at ?? null,
            hasLinkedAthlete: Boolean(floorSession?.athlete_id),
            hasAssignment: false,
            appointmentCoachNote: '',
            adHoc: true,
          },
      workout: body?.workout ?? {},
      coachNote: trim(body?.coachNote, 3000),
      previousSession: body?.previousSession ?? null,
    }

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
          temperature: 0.35,
          max_tokens: mode === 'recap' ? 320 : 260,
          response_format: { type: 'json_object' },
          messages: [
            { role: 'system', content: systemPrompt(mode) },
            { role: 'user', content: JSON.stringify(payload) },
          ],
        }),
      })

      if (!response.ok) {
        console.error('coach_floor_openai_error', response.status)
        return json({ ok: false, reason: 'model-error' }, 502)
      }

      const responseBody = await response.json()
      const content = responseBody?.choices?.[0]?.message?.content
      if (!content) return json({ ok: false, reason: 'empty-model-response' }, 502)

      let parsed
      try {
        parsed = JSON.parse(content)
      } catch {
        return json({ ok: false, reason: 'invalid-model-json' }, 502)
      }

      const result = sanitize(mode, parsed)
      if (!result) return json({ ok: false, reason: 'invalid-model-response' }, 502)

      return json({ ok: true, mode, ...result })
    } finally {
      clearTimeout(timeout)
    }
  } catch (error) {
    console.error('coach_floor_assist_failed', error instanceof Error ? error.name : 'error')
    return json({ ok: false, reason: 'assist-failed' }, 500)
  }
})
