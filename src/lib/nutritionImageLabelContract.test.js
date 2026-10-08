import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { normalizeNutritionImageResult } from './nutritionImageAnalysis'

describe('nutrition-image-analyze label contract', () => {
  const source = readFileSync(
    resolve(process.cwd(), 'supabase/functions/nutrition-image-analyze/index.ts'),
    'utf8',
  )

  it('returns printed label macros without scaling them to consumed context', () => {
    expect(source).toContain('IMPORTANT NUTRITION-LABEL CONTRACT')
    expect(source).toContain('ALWAYS return calories, protein, carbs, fat, and fiber exactly for the PRINTED serving')
    expect(source).toContain('DO NOT scale the returned label macros to that consumed amount')
    expect(source).toContain('label says 59 g = 200 calories')
  })

  it('recovers meal totals from component nutrition instead of showing zeros', () => {
    const result = normalizeNutritionImageResult({
      kind: 'meal',
      calories: 0,
      protein: 0,
      carbs: 0,
      fat: 0,
      fiber: 0,
      components: [
        {
          name: 'Chicken breast',
          calories: 230,
          protein: 44,
          carbs: 0,
          fat: 5,
        },
        {
          name: 'Cooked white rice',
          calories: 310,
          protein: 6,
          carbs: 68,
          fat: 1,
        },
      ],
    })

    expect(result.calories).toBe(540)
    expect(result.protein).toBe(50)
    expect(result.carbs).toBe(68)
    expect(result.fat).toBe(6)
  })

  it('retries exact-context meals instead of accepting all-zero nutrition', () => {
    expect(source).toContain('previous analysis identified the meal but returned zero nutrition')
    expect(source).toContain('meal-nutrition-unresolved')
    expect(source).toContain('Never return all-zero calories/macros for an ordinary meal')
  })
})
