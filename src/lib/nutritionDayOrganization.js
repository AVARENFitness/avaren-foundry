export const NUTRITION_EATING_MOMENT_GAP_MINUTES = 45
export const NUTRITION_DAY_GROUP_MIN_ITEMS = 4

const timeValue = (food) => {
  if (!food?.loggedAt) return null
  const value = new Date(food.loggedAt).getTime()
  return Number.isFinite(value) && value > 0 ? value : null
}

export function groupNutritionFoodsByLoggedTime(
  foods = [],
  gapMinutes = NUTRITION_EATING_MOMENT_GAP_MINUTES,
) {
  const thresholdMs = Math.max(1, Number(gapMinutes || 45)) * 60 * 1000
  const known = foods
    .filter((food) => timeValue(food) != null)
    .sort((a, b) => timeValue(a) - timeValue(b))
  const unknown = foods.filter((food) => timeValue(food) == null)
  const groups = []

  known.forEach((food) => {
    const currentTime = timeValue(food)
    const last = groups[groups.length - 1]
    const lastFood = last?.foods?.[last.foods.length - 1]
    const lastTime = timeValue(lastFood)
    const shouldStartNew =
      !last ||
      lastTime == null ||
      currentTime - lastTime > thresholdMs

    if (shouldStartNew) {
      groups.push({
        id: `nutrition-moment-${food.id ?? groups.length}`,
        startedAt: food.loggedAt || '',
        foods: [food],
      })
      return
    }

    last.foods.push(food)
  })

  if (unknown.length) {
    groups.push({
      id: 'nutrition-moment-unplaced',
      startedAt: '',
      foods: unknown,
    })
  }

  return groups
}

export function shouldGroupNutritionDay(
  foods = [],
  groups = groupNutritionFoodsByLoggedTime(foods),
) {
  return foods.length >= NUTRITION_DAY_GROUP_MIN_ITEMS && groups.length > 1
}

export function nutritionFoodGroupTotals(group = {}) {
  return (group.foods ?? []).reduce(
    (totals, food) => ({
      calories: totals.calories + Number(food.calories || 0),
      protein: totals.protein + Number(food.protein || 0),
      carbs: totals.carbs + Number(food.carbs || 0),
      fat: totals.fat + Number(food.fat || 0),
    }),
    { calories: 0, protein: 0, carbs: 0, fat: 0 },
  )
}

export function nutritionFoodGroupTimeLabel(group = {}) {
  if (!group.startedAt) return 'Earlier log'
  const date = new Date(group.startedAt)
  if (!Number.isFinite(date.getTime())) return 'Earlier log'
  return date.toLocaleTimeString([], {
    hour: 'numeric',
    minute: '2-digit',
  })
}

export function nutritionFoodLoggedTimeLabel(food = {}) {
  if (!food.loggedAt) return ''
  const date = new Date(food.loggedAt)
  if (!Number.isFinite(date.getTime())) return ''
  return date.toLocaleTimeString([], {
    hour: 'numeric',
    minute: '2-digit',
  })
}
