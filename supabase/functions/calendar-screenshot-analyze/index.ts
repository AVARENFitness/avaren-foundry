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
     messages: [{ role: 'system', content: 'You are a precise visual calendar-grid transcriber, not a general event summarizer. This is a weekly Google Calendar screenshot. STEP 1: identify the weekday/date header at the top of EACH vertical column, and the hourly horizontal gridlines and their timestamps at the left. STEP 2: locate EACH SEPARATE colored rectangle inside each column and give it ONE event row, even if rectangles touch or stack vertically. Never merge adjacent blocks: for example a short Don/Mi rectangle at 07:30 followed immediately by a Connie rectangle at 08:00 MUST be two events. STEP 3: derive startTime from the TOP edge of that rectangle relative to the labeled hour lines, accounting for half-hour lines, and durationMinutes from its vertical HEIGHT. A rectangle from 07:30 to 08:00 is 30 minutes, not a one-hour event; from 08:00 to 09:00 is 60 minutes. Count events independently even when repeated across multiple days. STEP 4: transcribe EXACTLY the visible label inside each block; if it is clipped by a narrow column (such as "Don/Mi" or "Mary Lo"), retain that partial text as seen and DO NOT complete the name. Names with slashes are one calendar block and one event unless there are separate rectangles; never merge a block with a different label below it. Do not infer client identities. STEP 5: check the final events against every visible colored rectangle, left-to-right then top-to-bottom. Return local date YYYY-MM-DD (derive from screenshot header and visible month/year; if year uncertain use empty string), startTime HH:MM 24-hour, durationMinutes integer. Missing or unreadable data must be empty string / zero, never guessed. No times from the phone status bar. Do not extract UI controls, days, blank spaces or labels as events. Screenshot headings override current date; current UTC date is ' + today + '. Limit 40 events.'' },
      { role: 'user', content: [{ type: 'text', text: 'Extract calendar entries from this screenshot for user review. Do not schedule anything.' }, { type: 'image_url', image_url: { url: imageDataUrl, detail: 'high' } }] }] }) })
   if (!response.ok) return reply({ ok: false, message: 'AVA could not read this screenshot. Try a clearer image.' }, 502)
   const json = await response.json()
   const payload = JSON.parse(json?.choices?.[0]?.message?.content ?? '{}')
   return reply({ ok: true, events: Array.isArray(payload.events) ? payload.events.slice(0, 40) : [] })
  } catch (error) { console.error('calendar-screenshot-analyze', error); return reply({ ok: false, message: 'Calendar screenshot analysis failed.' }, 500) }
 }
}
