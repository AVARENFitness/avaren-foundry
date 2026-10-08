export const NUTRITION_EATING_MOMENT_GAP_MINUTES = 45

const timeValue = (food) => {
  const value = new Date(food?.loggedAt || 0).getTime()
  return Number.isFinite(value) ? value : 0
}

export function groupNutritionFoodsByLoggedTime(
  foods = [],
  gapMinutes = NUTRITION_EATING_MOMENT_GAP_MINUTES,
) {
  const thresholdMs = Math.max(1, Number(gapMinutes || 45)) * 60 * 1000
  const ordered = [...foods].sort((a, b) => timeValue(a) - timeValue(b))
  const groups = []

  ordered.forEach((food) => {
    const currentTime = timeValue(food)
    const last = groups[groups.length - 1]
    const lastFood = last?.foods?.[last.foods.length - 1]
    const lastTime = timeValue(lastFood)
    const shouldStartNew =
      !last ||
      !currentTime ||
      !lastTime ||
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

  return groups
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
  if (!group.startedAt) return 'Logged foods'
  const date = new Date(group.startedAt)
  if (!Number.isFinite(date.getTime())) return 'Logged foods'
  return date.toLocaleTimeString([], {
    hour: 'numeric',
    minute: '2-digit',
  })
}
