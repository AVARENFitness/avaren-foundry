const FATSECRET_API_URL = 'https://platform.fatsecret.com/rest/server.api'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
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
    const match = description.match(new RegExp(`${label}:\\s*([0-9.]+)`, 'i'))
    return match ? numberOrNull(match[1]) : null
  }

  return {
    calories: capture('Calories'),
    fat: capture('Fat'),
    carbs: capture('Carbs'),
    protein: capture('Protein'),
  }
}

const percentEncode = (value: string) =>
  encodeURIComponent(value)
    .replace(/[!'()*]/g, (char) =>
      '%' + char.charCodeAt(0).toString(16).toUpperCase(),
    )

const base64FromBytes = (bytes: Uint8Array) => {
  let binary = ''
  for (const byte of bytes) binary += String.fromCharCode(byte)
  return btoa(binary)
}

const makeNonce = () => {
  const bytes = crypto.getRandomValues(new Uint8Array(18))
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('')
}

const signOAuth1 = async (
  params: Record<string, string>,
  consumerSecret: string,
) => {
  const normalized = Object.entries(params)
    .map(([key, value]) => [percentEncode(key), percentEncode(value)] as const)
    .sort(([aKey, aValue], [bKey, bValue]) =>
      aKey === bKey ? aValue.localeCompare(bValue) : aKey.localeCompare(bKey),
    )
    .map(([key, value]) => `${key}=${value}`)
    .join('&')

  const baseString = [
    'POST',
    percentEncode(FATSECRET_API_URL),
    percentEncode(normalized),
  ].join('&')

  const signingKey = `${percentEncode(consumerSecret)}&`
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(signingKey),
    { name: 'HMAC', hash: 'SHA-1' },
    false,
    ['sign'],
  )
  const signature = await crypto.subtle.sign(
    'HMAC',
    key,
    new TextEncoder().encode(baseString),
  )

  return base64FromBytes(new Uint8Array(signature))
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
  const consumerKey = Deno.env.get('FATSECRET_CONSUMER_KEY')
  const consumerSecret = Deno.env.get('FATSECRET_CONSUMER_SECRET')

  if (!consumerKey || !consumerSecret) {
    throw new Error('fatsecret_not_configured')
  }

  const params: Record<string, string> = {
    method: 'foods.search',
    search_expression: query,
    page_number: String(Math.max(0, pageNumber)),
    max_results: String(Math.min(50, Math.max(1, maxResults))),
    format: 'json',
    oauth_consumer_key: consumerKey,
    oauth_signature_method: 'HMAC-SHA1',
    oauth_timestamp: String(Math.floor(Date.now() / 1000)),
    oauth_nonce: makeNonce(),
    oauth_version: '1.0',
  }

  params.oauth_signature = await signOAuth1(params, consumerSecret)

  const response = await fetch(FATSECRET_API_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams(params),
  })

  const payload = await response.json().catch(() => null)

  if (!response.ok || payload?.error) {
    console.error(
      'FatSecret food search failed',
      response.status,
      payload?.error?.code ?? '',
      payload?.error?.message ?? '',
    )
    throw new Error(
      payload?.error?.message
        ? `fatsecret_search_failed:${payload.error.message}`
        : 'fatsecret_search_failed',
    )
  }

  const foodsNode = payload?.foods ?? {}
  const foods = asArray(foodsNode?.food)
    .map((food: Record<string, unknown>) => {
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
    })
    .filter((food) => food.foodId && food.name)

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
    const status = message === 'fatsecret_not_configured' ? 503 : 502
    return json({ error: message }, status)
  }
})
