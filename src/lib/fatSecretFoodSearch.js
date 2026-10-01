import { supabase } from './supabase'

export async function searchFatSecretFoods(
  query,
  { pageNumber = 0, maxResults = 20 } = {},
) {
  const searchQuery = String(query ?? '').trim()

  if (searchQuery.length < 2) {
    return {
      provider: 'fatsecret',
      query: searchQuery,
      pageNumber: 0,
      maxResults,
      totalResults: 0,
      foods: [],
    }
  }

  if (!supabase) {
    throw new Error('AVAREN food search is unavailable right now.')
  }

  const { data, error } = await supabase.functions.invoke(
    'fatsecret-food-search',
    {
      body: {
        query: searchQuery,
        pageNumber,
        maxResults,
      },
    },
  )

  if (error) {
    throw new Error(error.message || 'FatSecret food search failed.')
  }

  if (data?.error) {
    if (data.error === 'fatsecret_not_configured') {
      throw new Error('FatSecret is not configured yet.')
    }
    throw new Error('FatSecret food search failed.')
  }

  return {
    provider: 'fatsecret',
    query: data?.query ?? searchQuery,
    pageNumber: Number(data?.pageNumber ?? pageNumber),
    maxResults: Number(data?.maxResults ?? maxResults),
    totalResults: Number(data?.totalResults ?? 0),
    foods: Array.isArray(data?.foods) ? data.foods : [],
  }
}
