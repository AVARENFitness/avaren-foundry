import { createClient } from 'jsr:@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })

const MAX_IMAGE_CHARS = 8_000_000
const MAX_CONTEXT_CHARS = 600

const schema = {
  name: 'nutrition_scan',
  strict: true,
  schema: {
    type: 'object',
    additionalProperties: false,
    required: [
      'kind','title','brand','servingDescription','servingAmount','servingUnit','calories','protein','carbs','fat','fiber',
      'confidence','sourceType','searchQuery','barcode','components','followUpQuestion','notes'
    ],
    properties: {
      kind: { type: 'string', enum: ['nutrition_label','packaged_product','meal'] },
      title: { type: 'string' },
      brand: { type: 'string' },
      servingDescription: { type: 'string' },
      servingAmount: { type: 'number' },
      servingUnit: { type: 'string', enum: ['g','oz','ml','serving','unknown'] },
      calories: { type: 'number' },
      protein: { type: 'number' },
      carbs: { type: 'number' },
      fat: { type: 'number' },
      fiber: { type: 'number' },
      confidence: { type: 'string', enum: ['high','moderate','low'] },
      sourceType: { type: 'string', enum: ['label_read','product_identification','visual_estimate','barcode_read'] },
      searchQuery: { type: 'string' },
      barcode: { type: 'string' },
      components: {
        type: 'array',
        items: {
          type: 'object',
          additionalProperties: false,
          required: ['name','amount','calories','protein','carbs','fat','basis'],
          properties: {
            name: { type: 'string' },
            amount: { type: 'string' },
            calories: { type: 'number' },
            protein: { type: 'number' },
            carbs: { type: 'number' },
            fat: { type: 'number' },
            basis: { type: 'string', enum: ['user_provided','label','recognized_product','visual_estimate'] },
          },
        },
      },
      followUpQuestion: { type: 'string' },
      notes: { type: 'string' },
    },
  },
}

const SYSTEM_PROMPT = `You are AVA's food-image analysis engine inside AVAREN.

Analyze one food photo plus optional user context and return structured nutrition data.

PRIORITY OF EVIDENCE
1. Clearly readable Nutrition Facts or package text when a Nutrition Facts label is visible.
2. Exact amounts or ingredients explicitly supplied by the user for what they actually consumed.
3. Recognizable branded packaged-food identity.
4. Visual portion estimates.

IMPORTANT NUTRITION-LABEL CONTRACT
- When a readable Nutrition Facts label is visible, ALWAYS return calories, protein, carbs, fat, and fiber exactly for the PRINTED serving on the label.
- servingAmount + servingUnit must describe that same printed serving basis whenever measurable.
- User context such as "I ate 16 g" or "I used 1.2 oz" describes the consumed amount. DO NOT scale the returned label macros to that consumed amount.
- The AVAREN client deterministically scales the printed per-serving macros to the user's measured consumed amount.
- Example: label says 59 g = 200 calories and context says "I ate 16 g". Return servingAmount 59, servingUnit "g", calories 200 (plus the printed macros), not the already-scaled 16 g macros.

BARCODE MODE
- If the request explicitly says BARCODE MODE, focus on the barcode area and the human-readable digits beneath it.
- Return the barcode as digits only in the barcode field.
- Normalize UPC-A or EAN-8 to a 13-digit GTIN by left-padding zeros when needed.
- Do not guess missing digits. If the digits are not readable enough, return an empty barcode, low confidence, and explain briefly in notes.
- In BARCODE MODE use sourceType barcode_read. Other nutrition fields may be zero because the barcode will be resolved against a verified database.

CLASSIFICATION
- nutrition_label: a readable Nutrition Facts panel is visible. Read the printed serving and macros directly. Do not invent missing numbers.
- For nutrition labels, split the measurable serving basis into servingAmount + servingUnit whenever possible. Example: "2/3 cup (150g)" => servingAmount 150 and servingUnit "g". If the only usable basis is "1 container", use servingAmount 1 and servingUnit "serving". If no numeric basis is readable, use 0 + "unknown".
- packaged_product: a branded food/package is recognizable but no readable Nutrition Facts panel is available. Identify the most likely exact product/variant and create a concise searchQuery for a nutrition database. Macros may be a provisional estimate, but searchQuery is important.
- meal: prepared food/plate. Estimate components and portions.

MEAL BEHAVIOR
- If the user supplied exact ingredients or amounts, treat those details as authoritative even if the image visually suggests a different portion. Mark those components user_provided.
- Preserve each explicit component separately when practical. Example: "6 oz chicken, 150 g rice, 40 g avocado" should produce separate chicken, rice, and avocado components using those stated amounts.
- Estimate only ingredients, cooking fats, sauces, or quantities that the user did not specify.
- Use the photo to identify/estimate the unspecified remainder of the meal, not to override explicit user measurements.
- If no context was supplied, DO NOT ask a follow-up. Make the best reasonable estimate immediately.
- If context was supplied, you may return at most ONE short followUpQuestion only when one missing fact could materially change the estimate. Otherwise leave followUpQuestion empty.
- Never return multiple questions.
- Keep the interaction fast.

CONFIDENCE
- high: clear label or highly recognizable exact product with strong visible evidence.
- moderate: meal with useful context or recognizable food with some uncertainty.
- low: substantial visual ambiguity.

For meals, totals must approximately equal the sum of components.
For labels, servingDescription must reflect the serving shown.
For meals or packaged products without a readable measurement basis, set servingAmount to 0 and servingUnit to "unknown".
Return JSON only.`

export default {
  async fetch(req: Request) {
    if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
    if (req.method !== 'POST') return json({ ok: false, reason: 'method-not-allowed' }, 405)

    try {
      const authHeader = req.headers.get('Authorization')
      if (!authHeader) return json({ ok: false, reason: 'unauthorized' }, 401)

      const supabaseUrl = Deno.env.get('SUPABASE_URL')!
      const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!
      const userClient = createClient(supabaseUrl, anonKey, {
        global: { headers: { Authorization: authHeader } },
      })

      const { data: { user }, error } = await userClient.auth.getUser()
      if (error || !user) return json({ ok: false, reason: 'unauthorized' }, 401)

      const body = await req.json()
      const imageDataUrl = String(body?.imageDataUrl ?? '')
      const context = String(body?.context ?? '').trim().slice(0, MAX_CONTEXT_CHARS)
      const mode = body?.mode === 'barcode' ? 'barcode' : 'food'

      if (!imageDataUrl.startsWith('data:image/')) {
        return json({ ok: false, reason: 'image-required' }, 400)
      }
      if (imageDataUrl.length > MAX_IMAGE_CHARS) {
        return json({ ok: false, reason: 'image-too-large' }, 413)
      }

      const apiKey = Deno.env.get('OPENAI_API_KEY')
      if (!apiKey) return json({ ok: false, reason: 'model-not-configured' }, 503)

      const model = Deno.env.get('AVA_VISION_MODEL') || Deno.env.get('AVA_CHAT_MODEL') || 'gpt-4o-mini'
      const userText = mode === 'barcode'
        ? 'BARCODE MODE. Read the UPC/EAN barcode digits from this close-up. Do not ask a follow-up question.'
        : context
          ? `Analyze this food photo. User context: ${context}`
          : 'Analyze this food photo. No extra context was provided, so do not ask a follow-up question.'

      const response = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model,
          temperature: 0.2,
          max_tokens: 900,
          response_format: { type: 'json_schema', json_schema: schema },
          messages: [
            { role: 'system', content: SYSTEM_PROMPT },
            {
              role: 'user',
              content: [
                { type: 'text', text: userText },
                {
                  type: 'image_url',
                  image_url: { url: imageDataUrl, detail: 'high' },
                },
              ],
            },
          ],
        }),
      })

      if (!response.ok) {
        const errorText = (await response.text()).slice(0, 500)
        console.error('nutrition-image-analyze model error', response.status, errorText)
        return json({ ok: false, reason: 'model-error' }, 503)
      }

      const payload = await response.json()
      const content = payload?.choices?.[0]?.message?.content
      if (!content) return json({ ok: false, reason: 'empty-model-response' }, 503)

      let result
      try {
        result = JSON.parse(content)
      } catch {
        return json({ ok: false, reason: 'invalid-model-response' }, 503)
      }

      return json({ ok: true, result })
    } catch (error) {
      console.error('nutrition-image-analyze failed', error)
      return json({ ok: false, reason: 'server-error' }, 500)
    }
  },
}
