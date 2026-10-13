import { resolveFoodServingBasis, resolveFoodServingCountBasis } from './nutritionMeasurement'

/**
 * Validate AI-extracted label data before it is presented as measured nutrition.
 * Do not treat a blurry/partial label as a trustworthy zero-calorie food.
 */
export const validateNutritionLabelResult = (result = {}) => {
  if (result?.kind !== 'nutrition_label' && result?.sourceType !== 'label_read') {
    return { ok: true }
  }

  const numbers = ['calories', 'protein', 'carbs', 'fat', 'fiber']
    .map((key) => result[key])
  if (numbers.some((value) => typeof value !== 'number' || !Number.isFinite(value) || value < 0)) {
    return { ok: false, message: 'The nutrition numbers were incomplete. Take a clearer photo of the full Nutrition Facts panel.' }
  }

  // A genuinely zero-calorie label is possible; it must be clearly identified.
  const hasNutrition = numbers.some((value) => value > 0)
  const explicitlyZero = result.confidence === 'high' && /(?:zero|0)\s*calories?/i.test(result.notes ?? '')
  if (!hasNutrition && !explicitlyZero) {
    return { ok: false, message: 'The nutrition numbers were not readable. Take a clear photo of the full Nutrition Facts panel.' }
  }

  const weightBasis = resolveFoodServingBasis(result)
  const countBasis = resolveFoodServingCountBasis(result)
  const servingAmount = Number(result.servingAmount)
  const servingUnit = result.servingUnit
  const hasServingBasis = Boolean(weightBasis || countBasis ||
    (servingUnit === 'serving' && Number.isFinite(servingAmount) && servingAmount > 0))
  if (!hasServingBasis) {
    return { ok: false, message: 'The serving size was not readable. Include the serving-size line in your photo so the macros can be scaled accurately.' }
  }

  return { ok: true }
}
