import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  withNutritionAnalysisTimeout,
} from './nutritionImageAnalysis'

afterEach(() => {
  vi.useRealTimers()
})

describe('nutrition image analysis timeout', () => {
  it('returns a completed scan request normally', async () => {
    await expect(
      withNutritionAnalysisTimeout(
        Promise.resolve({ data: { ok: true }, error: null }),
        1000,
      ),
    ).resolves.toEqual({ data: { ok: true }, error: null })
  })

  it('rejects a stalled scan instead of leaving the UI loading forever', async () => {
    vi.useFakeTimers()
    const pendingRequest = new Promise(() => {})
    const result = withNutritionAnalysisTimeout(pendingRequest, 1000)

    await vi.advanceTimersByTimeAsync(1000)

    await expect(result).rejects.toThrow(
      'Food scan took too long. Check your connection and try the photo again.',
    )
  })
})
