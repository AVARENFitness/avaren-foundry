export const DEFAULT_NUTRITION_GOALS = {
  calories: null,
  protein: null,
  carbs: null,
  fat: null,
  fiber: null,
  waterOz: 100,
  weightGoal: '',
  timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC',
  coachAccess: false,
  bottleOz: 33.8,
  configured: false,
  source: 'not_configured',
  calculationVersion: null,
  estimatedMaintenanceCalories: null,
  inputs: null,
  calculatedAt: null,
}

export const hasConfiguredNutritionTargets = (goals = {}) =>
  Boolean(
    goals?.configured ||
      (Number(goals?.calories) > 0 &&
        Number(goals?.protein) > 0 &&
        Number(goals?.carbs) >= 0 &&
        Number(goals?.fat) > 0),
  )

export const createNutritionState = () => ({
  schemaVersion: 3,
  goals: { ...DEFAULT_NUTRITION_GOALS },
  days: {},
  savedFoods: [],
  recipes: [],
  recentFoodIds: [],
  favoriteFoodIds: [],
})

export const nutritionDateKey = (date = new Date()) => {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

export const emptyNutritionDay = (date = nutritionDateKey()) => ({
  date,
  foods: [],
  waterOz: 0,
  weight: '',
  workoutCalories: 0,
  notes: '',
})

export const ensureNutritionDay = (nutrition, date = nutritionDateKey()) => ({
  ...nutrition,
  days: {
    ...(nutrition?.days ?? {}),
    [date]: nutrition?.days?.[date] ?? emptyNutritionDay(date),
  },
})

export const nutritionTotals = (day) =>
  (day?.foods ?? []).reduce(
    (totals, food) => ({
      calories: totals.calories + Number(food.calories || 0),
      protein: totals.protein + Number(food.protein || 0),
      carbs: totals.carbs + Number(food.carbs || 0),
      fat: totals.fat + Number(food.fat || 0),
      fiber: totals.fiber + Number(food.fiber || 0),
    }),
    { calories: 0, protein: 0, carbs: 0, fat: 0, fiber: 0 },
  )

export const remainingNutrition = (goals, totals, day) => ({
  calories:
    goals?.calories == null
      ? null
      : Number(goals.calories) +
        Number(day?.workoutCalories || 0) -
        totals.calories,
  protein:
    goals?.protein == null ? null : Number(goals.protein) - totals.protein,
  carbs:
    goals?.carbs == null ? null : Number(goals.carbs) - totals.carbs,
  fat: goals?.fat == null ? null : Number(goals.fat) - totals.fat,
  fiber:
    goals?.fiber == null ? null : Number(goals.fiber) - totals.fiber,
  waterOz:
    goals?.waterOz == null
      ? null
      : Number(goals.waterOz) - Number(day?.waterOz || 0),
})
