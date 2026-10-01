const FATSECRET_TOKEN_URL = 'https://oauth.fatsecret.com/connect/token'
const FATSECRET_API_URL = 'https://platform.fatsecret.com/rest/server.api'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

let cachedToken: { value: string; expiresAt: number } | null = null

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: {
      ...corsHeaders,
      'Content-Type': 'application/json',
      'Cache-Control': 'no-store',
    },
  })

const asArray = <T>(value: T | T[] | null | undefined): T[] => {
  if (value == null) return []
  return Array.isArray(value) ? value : [value]
}

const numberOrNull = (value: unknown) => {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : null
}

const parseSummaryNutrition = (description = '') => {
  const capture = (label: string) => {
    const match = description.match(new RegExp(`${label}:\\s*([0-9.]+)g?`, 'i'))
    return match ? numberOrNull(match[1]) : null
  }

  return {
    calories: capture('Calories'),
    fat: capture('Fat'),
    carbs: capture('Carbs'),
    protein: capture('Protein'),
  }
}

const getAccessToken = async () => {
  const now = Date.now()
  if (cachedToken && cachedToken.expiresAt > now + 60_000) {
    return cachedToken.value
  }

  const clientId = Deno.env.get('FATSECRET_CLIENT_ID')
  const clientSecret = Deno.env.get('FATSECRET_CLIENT_SECRET')

  if (!clientId || !clientSecret) {
    throw new Error('fatsecret_not_configured')
  }

  const body = new URLSearchParams({
    grant_type: 'client_credentials',
    scope: 'basic',
  })

  const response = await fetch(FATSECRET_TOKEN_URL, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${btoa(`${clientId}:${clientSecret}`)}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body,
  })

  if (!response.ok) {
    const details = await response.text()
    console.error('FatSecret token request failed', response.status, details.slice(0, 300))
    throw new Error('fatsecret_auth_failed')
  }

  const payload = await response.json()
  const token = String(payload?.access_token ?? '')
  const expiresIn = Math.max(60, Number(payload?.expires_in ?? 3600))

  if (!token) throw new Error('fatsecret_auth_failed')

  cachedToken = {
    value: token,
    expiresAt: now + expiresIn * 1000,
  }

  return token
}

const searchFoods = async ({
  query,
  pageNumber = 0,
  maxResults = 20,
}: {
  query: string
  pageNumber?: number
  maxResults?: number
}) => {
  const token = await getAccessToken()
  const body = new URLSearchParams({
    method: 'foods.search',
    search_expression: query,
    page_number: String(Math.max(0, pageNumber)),
    max_results: String(Math.min(50, Math.max(1, maxResults))),
    format: 'json',
  })

  const response = await fetch(FATSECRET_API_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body,
  })

  if (!response.ok) {
    const details = await response.text()
    console.error('FatSecret food search failed', response.status, details.slice(0, 300))
    throw new Error('fatsecret_search_failed')
  }

  const payload = await response.json()
  const foodsNode = payload?.foods ?? {}
  const foods = asArray(foodsNode?.food).map((food: Record<string, unknown>) => {
    const description = String(food.food_description ?? '')
    return {
      provider: 'fatsecret',
      foodId: String(food.food_id ?? ''),
      name: String(food.food_name ?? ''),
      brand: String(food.brand_name ?? ''),
      foodType: String(food.food_type ?? ''),
      description,
      summaryNutrition: parseSummaryNutrition(description),
    }
  }).filter((food) => food.foodId && food.name)

  return {
    provider: 'fatsecret',
    query,
    pageNumber: Number(foodsNode?.page_number ?? pageNumber),
    maxResults: Number(foodsNode?.max_results ?? maxResults),
    totalResults: Number(foodsNode?.total_results ?? foods.length),
    foods,
  }
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  if (req.method !== 'POST') {
    return json({ error: 'method_not_allowed' }, 405)
  }

  try {
    const body = await req.json().catch(() => ({}))
    const query = String(body?.query ?? '').trim()
    const pageNumber = Number(body?.pageNumber ?? 0)
    const maxResults = Number(body?.maxResults ?? 20)

    if (query.length < 2) {
      return json({ error: 'query_too_short' }, 400)
    }

    if (query.length > 120) {
      return json({ error: 'query_too_long' }, 400)
    }

    const result = await searchFoods({
      query,
      pageNumber: Number.isFinite(pageNumber) ? pageNumber : 0,
      maxResults: Number.isFinite(maxResults) ? maxResults : 20,
    })

    return json(result)
  } catch (error) {
    const message = error instanceof Error ? error.message : 'unknown_error'
    const status =
      message === 'fatsecret_not_configured' ? 503 :
      message === 'fatsecret_auth_failed' ? 502 :
      message === 'fatsecret_search_failed' ? 502 :
      500

    return json({ error: message }, status)
  }
})
