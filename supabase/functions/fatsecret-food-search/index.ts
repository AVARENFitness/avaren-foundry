import { createClient } from '@supabase/supabase-js'

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
      'Cache-Control': 'no-store',
    },
  })

const asArray = <T>(value: T | T[] | null | undefined): T[] =>
  value == null ? [] : Array.isArray(value) ? value : [value]

const toNumber = (value: unknown) => {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : 0
}

let cachedToken: { value: string; expiresAt: number } | null = null

async function getAccessToken() {
  if (cachedToken && cachedToken.expiresAt > Date.now() + 60_000) {
    return cachedToken.value
  }

  const clientId = Deno.env.get('FATSECRET_CLIENT_ID')
  const clientSecret = Deno.env.get('FATSECRET_CLIENT_SECRET')

  if (!clientId || !clientSecret) {
    throw new Error('fatsecret-not-configured')
  }

  const authorization = btoa(`${clientId}:${clientSecret}`)
  const response = await fetch('https://oauth.fatsecret.com/connect/token', {
    method: 'POST',
    headers: {
      Authorization: `Basic ${authorization}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({
      grant_type: 'client_credentials',
      scope: 'basic',
    }),
  })

  if (!response.ok) {
    throw new Error(`fatsecret-token-${response.status}`)
  }

  const payload = await response.json()
  const expiresIn = Math.max(60, Number(payload?.expires_in ?? 3600))

  cachedToken = {
    value: payload.access_token,
    expiresAt: Date.now() + expiresIn * 1000,
  }

  return cachedToken.value
}

function normalizeFood(food: any) {
  const servings = asArray(food?.servings?.serving)
  if (!servings.length) return null

  const defaultServing =
    servings.find((serving: any) => Number(serving?.is_default) === 1) ??
    servings[0]

  const normalizeServing = (serving: any) => ({
    servingId: String(serving?.serving_id ?? ''),
    label: String(serving?.serving_description ?? '1 serving'),
    metricAmount: serving?.metric_serving_amount
      ? toNumber(serving.metric_serving_amount)
      : null,
    metricUnit: serving?.metric_serving_unit ?? null,
    numberOfUnits: serving?.number_of_units
      ? toNumber(serving.number_of_units)
      : 1,
    calories: toNumber(serving?.calories),
    protein: toNumber(serving?.protein),
    carbs: toNumber(serving?.carbohydrate),
    fat: toNumber(serving?.fat),
    fiber: toNumber(serving?.fiber),
  })

  const normalizedServings = servings.map(normalizeServing)
  const selected = normalizeServing(defaultServing)

  return {
    id: `fatsecret:${food.food_id}:${selected.servingId}`,
    foodId: String(food.food_id),
    servingId: selected.servingId,
    name: String(food?.food_name ?? 'Food'),
    brand:
      food?.food_type === 'Brand'
        ? String(food?.brand_name ?? 'Brand')
        : 'Generic',
    foodType: String(food?.food_type ?? ''),
    serving: selected.label,
    calories: selected.calories,
    protein: selected.protein,
    carbs: selected.carbs,
    fat: selected.fat,
    fiber: selected.fiber,
    source: 'fatsecret',
    sourceLabel: 'FatSecret',
    servingOptions: normalizedServings.map((serving) => ({
      ...serving,
      multiplier: 1,
    })),
  }
}

export default {
  async fetch(req: Request) {
    if (req.method === 'OPTIONS') {
      return new Response('ok', { headers: corsHeaders })
    }

    if (req.method !== 'POST') {
      return json({ ok: false, reason: 'method-not-allowed' }, 405)
    }

    try {
      const authHeader = req.headers.get('Authorization')
      if (!authHeader) return json({ ok: false, reason: 'unauthorized' }, 401)

      const supabaseUrl = Deno.env.get('SUPABASE_URL')!
      const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!
      const userClient = createClient(supabaseUrl, anonKey, {
        global: { headers: { Authorization: authHeader } },
      })

      const {
        data: { user },
        error,
      } = await userClient.auth.getUser()

      if (error || !user) {
        return json({ ok: false, reason: 'unauthorized' }, 401)
      }

      const body = await req.json()
      const query = String(body?.query ?? '').trim().slice(0, 160)
      const limit = Math.min(30, Math.max(1, Number(body?.limit ?? 20)))

      if (query.length < 2) {
        return json({ ok: true, items: [] })
      }

      const token = await getAccessToken()
      const url = new URL(
        'https://platform.fatsecret.com/rest/foods/search/v5',
      )
      url.searchParams.set('search_expression', query)
      url.searchParams.set('max_results', String(limit))
      url.searchParams.set('page_number', '0')
      url.searchParams.set('format', 'json')

      const response = await fetch(url, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      })

      if (!response.ok) {
        return json(
          { ok: false, reason: 'fatsecret-request-failed' },
          response.status >= 500 ? 503 : 502,
        )
      }

      const payload = await response.json()
      const foods = asArray(payload?.foods_search?.results?.food)
      const items = foods.map(normalizeFood).filter(Boolean)

      return json({ ok: true, items })
    } catch (error) {
      const message = error instanceof Error ? error.message : 'server-error'
      if (message === 'fatsecret-not-configured') {
        return json({ ok: false, reason: message }, 503)
      }
      console.error(error)
      return json({ ok: false, reason: 'server-error' }, 500)
    }
  },
}
