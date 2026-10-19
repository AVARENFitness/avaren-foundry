import { createClient } from 'jsr:@supabase/supabase-js@2'
const headers = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type' }
const reply = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...headers, 'Content-Type': 'application/json' } })
const schema = { name: 'calendar_screenshot', strict: true, schema: { type: 'object', additionalProperties: false,
 required: ['events'], properties: { events: { type: 'array', items: { type: 'object', additionalProperties: false,
 required: ['title','date','startTime','durationMinutes'], properties: {
 title: { type: 'string' }, date: { type: 'string' }, startTime: { type: 'string' }, durationMinutes: { type: 'integer' }
 } } } } } }
export default {
 async fetch(req: Request) {
  if (req.method === 'OPTIONS') return new Response('ok', { headers })
  if (req.method !== 'POST') return reply({ ok: false }, 405)
  try {
   const auth = req.headers.get('Authorization')
   if (!auth) return reply({ ok: false, message: 'Sign in to import calendar events.' }, 401)
   const userClient = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!, { global: { headers: { Authorization: auth } } })
   const { data: { user } } = await userClient.auth.getUser()
   if (!user) return reply({ ok: false }, 401)
   const { imageDataUrl } = await req.json()
   if (typeof imageDataUrl !== 'string' || !imageDataUrl.startsWith('data:image/') || imageDataUrl.length > 8_000_000) return reply({ ok: false, message: 'Invalid or oversized screenshot.' }, 400)
   const key = Deno.env.get('OPENAI_API_KEY')
   if (!key) return reply({ ok: false, message: 'Image analysis is not configured.' }, 503)
   const today = new Date().toISOString().slice(0, 10)
   const response = await fetch('https://api.openai.com/v1/chat/completions', { method: 'POST', headers: { Authorization: 'Bearer ' + key, 'Content-Type': 'application/json' },
    body: JSON.stringify({ model: Deno.env.get('AVA_VISION_MODEL') || 'gpt-4o-mini', temperature: 0, max_tokens: 1800,
     response_format: { type: 'json_schema', json_schema: schema },
     messages: [{ role: 'system', content: 'Extract visible Google Calendar screenshot events only. Return event title, local date YYYY-MM-DD, start time HH:MM in 24h, duration in minutes. Do not invent a missing title, date, time or duration. Use empty strings for unknown dates/times; zero for unknown duration. Calendar screenshots may include multi-day or multi-column layouts; read headings carefully. Do not treat the app UI or calendar headings as events. Limit to 40 events. No guesses, no inferred client associations. Today in UTC is ' + today + '. If year is not shown, prefer current year only if unambiguous; otherwise leave the date empty.' },
      { role: 'user', content: [{ type: 'text', text: 'Extract calendar entries from this screenshot for user review. Do not schedule anything.' }, { type: 'image_url', image_url: { url: imageDataUrl, detail: 'high' } }] }] }) })
   if (!response.ok) return reply({ ok: false, message: 'AVA could not read this screenshot. Try a clearer image.' }, 502)
   const json = await response.json()
   const payload = JSON.parse(json?.choices?.[0]?.message?.content ?? '{}')
   return reply({ ok: true, events: Array.isArray(payload.events) ? payload.events.slice(0, 40) : [] })
  } catch (error) { console.error('calendar-screenshot-analyze', error); return reply({ ok: false, message: 'Calendar screenshot analysis failed.' }, 500) }
 }
}
