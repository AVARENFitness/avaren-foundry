import { describe, expect, it, vi, beforeEach } from 'vitest'

vi.mock('./supabase', () => ({
  supabase: {
    functions: {
      invoke: vi.fn(),
    },
  },
}))

import { supabase } from './supabase'
import { searchFatSecretFoods } from './fatSecretFoodSearch'

describe('searchFatSecretFoods', () => {
  beforeEach(() => vi.clearAllMocks())

  it('does not call the API for an empty or one-character query', async () => {
    const result = await searchFatSecretFoods('a')
    expect(result.available).toBe(false)
    expect(supabase.functions.invoke).not.toHaveBeenCalled()
  })

  it('returns normalized items from the edge function', async () => {
    supabase.functions.invoke.mockResolvedValue({
      data: {
        ok: true,
        items: [
          {
            id: 'fatsecret:1:2',
            foodId: '1',
            servingId: '2',
            name: 'Greek Yogurt',
            calories: 100,
          },
        ],
      },
      error: null,
    })

    const result = await searchFatSecretFoods('greek yogurt')

    expect(result.available).toBe(true)
    expect(result.items).toHaveLength(1)
    expect(result.items[0].foodId).toBe('1')
  })

  it('falls back cleanly when the provider is unavailable', async () => {
    supabase.functions.invoke.mockResolvedValue({
      data: { ok: false, reason: 'fatsecret-not-configured' },
      error: null,
    })

    const result = await searchFatSecretFoods('chicken')

    expect(result.available).toBe(false)
    expect(result.items).toEqual([])
  })
})
