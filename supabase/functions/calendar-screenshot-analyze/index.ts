import { createClient } from 'jsr:@supabase/supabase-js@2'
const headers = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type' }
const reply = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...headers, 'Content-Type': 'application/json' } })
const schema = { name: 'calendar_screenshot', strict: true, schema: { type: 'object', additionalProperties: false,
 required: ['events','hourAnchor','hourAnchorY','nextHourY'], properties: { hourAnchor: { type: 'integer' }, hourAnchorY: { type: 'integer' }, nextHourY: { type: 'integer' }, events: { type: 'array', items: { type: 'object', additionalProperties: false,
 required: ['title','date','startTime','durationMinutes','weekday','columnIndex','topY','bottomY'], properties: {
 title: { type: 'string' }, date: { type: 'string' }, startTime: { type: 'string' }, durationMinutes: { type: 'integer' }, weekday: { type: 'integer' }, columnIndex: { type: 'integer' }, topY: { type: 'integer' }, bottomY: { type: 'integer' }
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
    body: JSON.stringify({ model: Deno.env.get('AVA_CALENDAR_VISION_MODEL') || 'gpt-4o', temperature: 0, max_tokens: 1800,
     response_format: { type: 'json_schema', json_schema: schema },
     messages: [{ role: 'system', content: 'You are a precise visual calendar-grid transcriber, not a general event summarizer. This is a weekly Google Calendar screenshot. STEP 1: Use the screenshot weekday/date headers as authoritative. Assign each event only to its own visible column, never to a neighboring day. Read the actual month and year shown in the screenshot, not the current date or a memorized example. Identify the weekday/date header at the top of EACH vertical column, and the hourly horizontal gridlines and their timestamps at the left. STEP 2: locate EACH SEPARATE colored rectangle inside each column and give it ONE event row, even if rectangles touch or stack vertically. Never merge adjacent blocks: for example a short Don/Mi rectangle at 07:30 followed immediately by a Connie rectangle at 08:00 MUST be two events. STEP 3: derive startTime from the TOP edge of that rectangle relative to the labeled hour lines, accounting for half-hour lines, and durationMinutes from its vertical HEIGHT. A rectangle from 07:30 to 08:00 is 30 minutes, not a one-hour event; from 08:00 to 09:00 is 60 minutes. Count events independently even when repeated across multiple days. STEP 4: transcribe EXACTLY the visible label inside each block; if it is clipped by a narrow column (such as "Don/Mi" or "Mary Lo"), retain that partial text as seen and DO NOT complete the name. Names with slashes are one calendar block and one event unless there are separate rectangles; never merge a block with a different label below it. Do not infer client identities. STEP 5: check the final events against every visible colored rectangle, left-to-right then top-to-bottom. First return hourAnchor as the hour number of the first readable hourly horizontal grid line (typically 5), hourAnchorY as its vertical image position on a 0..1000 scale, and nextHourY as the corresponding next-hour line position; do not use the status-bar phone clock. Return columnIndex as integer 0 to 6, from leftmost Sunday column to rightmost Saturday column, and topY and bottomY as approximate vertical coordinates in image pixels normalized to 0..1000. The event must visibly exist IN that column; never replicate an event on neighboring empty days. A header column mismatch is an error, not another event. Return weekday as integer Sunday=0 Monday=1 Tuesday=2 Wednesday=3 Thursday=4 Friday=5 Saturday=6 for each colored event block, and ensure the ISO calendar date agrees with that weekday and its header. Return local date YYYY-MM-DD (derive from screenshot header and visible month/year; if year uncertain use empty string), startTime HH:MM 24-hour, durationMinutes integer. Missing or unreadable data must be empty string / zero, never guessed. No times from the phone status bar. Do not extract UI controls, days, blank spaces or labels as events. Screenshot headings override current date; current UTC date is ' + today + '. Limit 40 events.' },
      { role: 'user', content: [{ type: 'text', text: 'Extract calendar entries from this screenshot for user review. Do not schedule anything.' }, { type: 'image_url', image_url: { url: imageDataUrl, detail: 'high' } }] }] }) })
   if (!response.ok) return reply({ ok: false, message: 'AVA could not read this screenshot. Try a clearer image.' }, 502)
   const json = await response.json()
   const payload = JSON.parse(json?.choices?.[0]?.message?.content ?? '{}')
   const anchorHour = Number(payload.hourAnchor)
   const anchorY = Number(payload.hourAnchorY)
   const nextY = Number(payload.nextHourY)
   const gridValid = Number.isInteger(anchorHour) && anchorHour >= 0 && anchorHour <= 22 &&
     Number.isFinite(anchorY) && Number.isFinite(nextY) && nextY - anchorY >= 10
   const events = (Array.isArray(payload.events) ? payload.events.slice(0, 40) : []).map((entry: Record<string, unknown>) => {
     const column = Number(entry.columnIndex)
     const weekday = Number(entry.weekday)
     const top = Number(entry.topY)
     const bottom = Number(entry.bottomY)
     const validGeometry = Number.isInteger(column) && column >= 0 && column <= 6 &&
       weekday === column && Number.isFinite(top) && Number.isFinite(bottom) &&
       top >= 0 && bottom <= 1000 && bottom > top + 1
     const rawMinutes = gridValid && validGeometry
       ? anchorHour * 60 + (top - anchorY) * 60 / (nextY - anchorY)
       : NaN
     const rawDuration = gridValid && validGeometry
       ? (bottom - top) * 60 / (nextY - anchorY)
       : NaN
     const snap15 = (value: number) => Math.round(value / 15) * 15
     const gridStartMinutes = snap15(rawMinutes)
     const gridDurationMinutes = snap15(rawDuration)
     const rawTime = String(entry.startTime ?? '')
     const match = /^([01]\\d|2[0-3]):([0-5]\\d)$/.exec(rawTime)
     const declaredMinutes = match ? Number(match[1]) * 60 + Number(match[2]) : NaN
     const consistent = Number.isFinite(rawMinutes) && Number.isFinite(declaredMinutes) &&
       Math.abs(rawMinutes - declaredMinutes) <= 12 &&
       Math.abs(rawDuration - Number(entry.durationMinutes)) <= 15 &&
       gridStartMinutes >= 0 && gridStartMinutes < 1440 && gridDurationMinutes > 0
     const time = Number.isFinite(gridStartMinutes) && gridStartMinutes >= 0 && gridStartMinutes < 1440
       ? String(Math.floor(gridStartMinutes / 60)).padStart(2,'0') + ':' + String(gridStartMinutes % 60).padStart(2,'0')
       : rawTime
     return { ...entry, startTime: consistent ? time : rawTime,
       durationMinutes: consistent ? gridDurationMinutes : entry.durationMinutes,
       geometryValid: validGeometry && gridValid && consistent }
   })
   return reply({ ok: true, events })
  } catch (error) { console.error('calendar-screenshot-analyze', error); return reply({ ok: false, message: 'Calendar screenshot analysis failed.' }, 500) }
 }
}
