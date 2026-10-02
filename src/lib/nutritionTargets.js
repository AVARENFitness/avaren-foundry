const KG_PER_LB = 0.45359237
const CM_PER_IN = 2.54

export const NUTRITION_GOAL_OPTIONS = [
  { value: 'lose_fat', label: 'Lose body fat' },
  { value: 'maintain', label: 'Maintain' },
  { value: 'build_muscle', label: 'Build muscle' },
  { value: 'performance', label: 'Improve performance' },
]

export const ACTIVITY_OPTIONS = [
  { value: 'sedentary', label: 'Mostly seated', factor: 1.2 },
  { value: 'lightly_active', label: 'Light daily movement', factor: 1.3 },
  { value: 'moderately_active', label: 'Moderate daily movement', factor: 1.4 },
  { value: 'very_active', label: 'On your feet most of the day', factor: 1.5 },
  { value: 'highly_active', label: 'Very physical day-to-day work', factor: 1.6 },
]

const ACTIVITY_FACTORS = Object.fromEntries(
  ACTIVITY_OPTIONS.map((option) => [option.value, option.factor]),
)

const GOAL_PROFILES = {
  lose_fat: {
    calorieAdjustment: -0.15,
    proteinGPerKg: 2.2,
    baseFatShare: 0.27,
    label: 'Fat loss',
  },
  maintain: {
    calorieAdjustment: 0,
    proteinGPerKg: 1.8,
    baseFatShare: 0.28,
    label: 'Maintenance',
  },
  build_muscle: {
    calorieAdjustment: 0.05,
    proteinGPerKg: 1.8,
    baseFatShare: 0.25,
    label: 'Muscle gain',
  },
  performance: {
    calorieAdjustment: 0,
    proteinGPerKg: 1.7,
    baseFatShare: 0.23,
    label: 'Performance',
  },
}

const clamp = (value, min, max) => Math.min(max, Math.max(min, value))

const trainingDemandScore = (strengthSessionsPerWeek, cardioSessionsPerWeek) =>
  clamp(
    Number(strengthSessionsPerWeek || 0) +
      Number(cardioSessionsPerWeek || 0) * 1.25,
    0,
    8,
  )

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
  if (!(goal in GOAL_PROFILES)) {
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
  const strengthSessionsPerWeek = clamp(
    Number(inputs.strengthSessionsPerWeek || 0),
    0,
    14,
  )
  const cardioSessionsPerWeek = clamp(
    Number(inputs.cardioSessionsPerWeek || 0),
    0,
    14,
  )
  const profile = GOAL_PROFILES[goal]
  const trainingDemand = trainingDemandScore(
    strengthSessionsPerWeek,
    cardioSessionsPerWeek,
  )

  const maintenanceCalories = restingCalories * ACTIVITY_FACTORS[activityLevel]
  const targetCalories = roundTo(
    maintenanceCalories * (1 + profile.calorieAdjustment),
    10,
  )

  // Protein is goal-led and bodyweight anchored. Training demand then shifts
  // the non-protein calorie split toward carbohydrate without changing base
  // calories; intentional workout energy is handled separately by the day log.
  const protein = roundTo(weightKg * profile.proteinGPerKg, 5)
  const trainingCarbBias = trainingDemand * 0.006
  const fatShare = clamp(profile.baseFatShare - trainingCarbBias, 0.2, 0.3)
  const fatFloorGrams = weightKg * 0.65
  const fat = roundTo(
    Math.max(fatFloorGrams, (targetCalories * fatShare) / 9),
    5,
  )
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
    calculationVersion: 'mifflin-st-jeor-v3-goal-training-aware',
    estimatedMaintenanceCalories: roundTo(maintenanceCalories, 10),
    inputs: {
      goal,
      age,
      sexForEnergyEstimation: sex,
      heightIn,
      weightLb,
      activityLevel,
      strengthSessionsPerWeek,
      cardioSessionsPerWeek,
    },
    macroStrategy: {
      goalLabel: profile.label,
      proteinGPerKg: profile.proteinGPerKg,
      fatShare: Number(fatShare.toFixed(3)),
      trainingDemand: Number(trainingDemand.toFixed(2)),
      workoutCaloriesHandledSeparately: true,
    },
    calculatedAt: new Date().toISOString(),
  }
}
