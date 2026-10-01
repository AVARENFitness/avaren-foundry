import { supabase } from './supabase'

export const searchFatSecretFoods = async (
  query,
  { limit = 20 } = {},
) => {
  const term = String(query ?? '').trim()
  if (!supabase || term.length < 2) {
    return { items: [], available: false }
  }

  const { data, error } = await supabase.functions.invoke(
    'fatsecret-food-search',
    {
      body: { query: term, limit },
    },
  )

  if (error || !data?.ok) {
    return {
      items: [],
      available: false,
      reason: data?.reason ?? error?.message ?? 'unavailable',
    }
  }

  return {
    items: Array.isArray(data.items) ? data.items : [],
    available: true,
  }
}
