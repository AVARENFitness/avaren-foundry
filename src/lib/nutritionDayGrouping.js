// Display-only grouping. A logging time is not proof of when a food was eaten.
const WINDOW_MS = 15 * 60 * 1000

export function groupLoggedFoods(foods = []) {
  const groups = []
  for (const food of foods) {
    const timestamp = Date.parse(food.loggedAt ?? '')
    const valid = Number.isFinite(timestamp)
    const previous = groups[groups.length - 1]
    const adjacent = previous && valid && previous.lastTimestamp != null &&
      timestamp >= previous.lastTimestamp &&
      timestamp - previous.firstTimestamp <= WINDOW_MS
    if (adjacent) {
      previous.foods.push(food)
      previous.lastTimestamp = timestamp
    } else {
      groups.push({
        key: food.id,
        foods: [food],
        firstTimestamp: valid ? timestamp : null,
        lastTimestamp: valid ? timestamp : null,
      })
    }
  }
  return groups
}
