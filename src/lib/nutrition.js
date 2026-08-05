export const DEFAULT_NUTRITION_GOALS = {
  calories: 2200,
  protein: 170,
  carbs: 230,
  fat: 70,
  fiber: 30,
  waterOz: 100,
  weightGoal: '',
  timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC',
  coachAccess: false,
  bottleOz: 33.8,
}

export const createNutritionState = () => ({
  goals: DEFAULT_NUTRITION_GOALS,
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
  calories: Number(goals.calories || 0) + Number(day?.workoutCalories || 0) - totals.calories,
  protein: Number(goals.protein || 0) - totals.protein,
  carbs: Number(goals.carbs || 0) - totals.carbs,
  fat: Number(goals.fat || 0) - totals.fat,
  fiber: Number(goals.fiber || 0) - totals.fiber,
  waterOz: Number(goals.waterOz || 0) - Number(day?.waterOz || 0),
})
