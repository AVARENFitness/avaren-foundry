const KG_PER_LB = 0.45359237
const CM_PER_IN = 2.54

export const NUTRITION_GOAL_OPTIONS = [
  { value: 'lose_fat', label: 'Lose body fat' },
  { value: 'maintain', label: 'Maintain' },
  { value: 'build_muscle', label: 'Build muscle' },
  { value: 'performance', label: 'Improve performance' },
]

export const ACTIVITY_OPTIONS = [
  { value: 'sedentary', label: 'Mostly sedentary', factor: 1.2 },
  { value: 'lightly_active', label: 'Lightly active', factor: 1.375 },
  { value: 'moderately_active', label: 'Moderately active', factor: 1.55 },
  { value: 'very_active', label: 'Very active', factor: 1.725 },
  { value: 'highly_active', label: 'Highly active', factor: 1.9 },
]

const ACTIVITY_FACTORS = Object.fromEntries(
  ACTIVITY_OPTIONS.map((option) => [option.value, option.factor]),
)

const GOAL_ADJUSTMENTS = {
  lose_fat: -0.15,
  maintain: 0,
  build_muscle: 0.08,
  performance: 0.05,
}

const PROTEIN_PER_LB = {
  lose_fat: 0.9,
  maintain: 0.8,
  build_muscle: 0.9,
  performance: 0.85,
}

const roundTo = (value, increment = 5) =>
  Math.round(Number(value || 0) / increment) * increment

export function calculateNutritionTargets(inputs = {}) {
  const age = Number(inputs.age)
  const heightIn = Number(inputs.heightIn)
  const weightLb = Number(inputs.weightLb)
  const sex = String(inputs.sexForEnergyEstimation ?? '')
  const goal = String(inputs.goal ?? '')
  const activityLevel = String(inputs.activityLevel ?? '')

  if (!Number.isFinite(age) || age < 14 || age > 100) {
    throw new Error('Enter a valid age.')
  }
  if (!Number.isFinite(heightIn) || heightIn < 48 || heightIn > 90) {
    throw new Error('Enter a valid height.')
  }
  if (!Number.isFinite(weightLb) || weightLb < 70 || weightLb > 700) {
    throw new Error('Enter a valid weight.')
  }
  if (!['male', 'female'].includes(sex)) {
    throw new Error('Choose the sex used for the energy estimate.')
  }
  if (!(goal in GOAL_ADJUSTMENTS)) {
    throw new Error('Choose a nutrition goal.')
  }
  if (!(activityLevel in ACTIVITY_FACTORS)) {
    throw new Error('Choose an activity level.')
  }

  const weightKg = weightLb * KG_PER_LB
  const heightCm = heightIn * CM_PER_IN
  const sexConstant = sex === 'male' ? 5 : -161
  const restingCalories =
    10 * weightKg + 6.25 * heightCm - 5 * age + sexConstant
  const maintenanceCalories = restingCalories * ACTIVITY_FACTORS[activityLevel]
  const targetCalories = roundTo(
    maintenanceCalories * (1 + GOAL_ADJUSTMENTS[goal]),
    10,
  )

  const protein = roundTo(weightLb * PROTEIN_PER_LB[goal], 5)
  const fatFloor = weightLb * 0.3
  const fatFromCalories = (targetCalories * 0.25) / 9
  const fat = roundTo(Math.max(fatFloor, fatFromCalories), 5)
  const remainingCalories = Math.max(
    0,
    targetCalories - protein * 4 - fat * 9,
  )
  const carbs = roundTo(remainingCalories / 4, 5)
  const fiber = Math.max(20, roundTo((targetCalories / 1000) * 14, 5))
  const waterOz = Math.min(160, Math.max(64, roundTo(weightLb * 0.5, 5)))

  return {
    calories: targetCalories,
    protein,
    carbs,
    fat,
    fiber,
    waterOz,
    source: 'ava_estimated',
    configured: true,
    calculationVersion: 'mifflin-st-jeor-v1',
    estimatedMaintenanceCalories: roundTo(maintenanceCalories, 10),
    inputs: {
      goal,
      age,
      sexForEnergyEstimation: sex,
      heightIn,
      weightLb,
      activityLevel,
      strengthSessionsPerWeek: Math.max(
        0,
        Math.min(14, Number(inputs.strengthSessionsPerWeek || 0)),
      ),
      cardioSessionsPerWeek: Math.max(
        0,
        Math.min(14, Number(inputs.cardioSessionsPerWeek || 0)),
      ),
    },
    calculatedAt: new Date().toISOString(),
  }
}
