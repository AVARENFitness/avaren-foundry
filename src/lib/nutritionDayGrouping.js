// Display-only grouping. A logging time is not proof of when a food was eaten.
const WINDOW_MS = 15 * 60 * 1000

export function groupLoggedFoods(foods = []) {
  const groups = []
  for (const food of foods) {
    const timestamp = Date.parse(food.loggedAt ?? '')
    const valid = Number.isFinite(timestamp)
    const previous = groups[groups.length - 1]
    const adjacent = previous && valid && previous.lastTimestamp != null &&
      Math.abs(timestamp - previous.lastTimestamp) <= WINDOW_MS
    if (adjacent) {
      previous.foods.push(food)
      previous.lastTimestamp = timestamp
    } else {
      groups.push({
        key: food.id,
        foods: [food],
        lastTimestamp: valid ? timestamp : null,
      })
    }
  }
  return groups
}
