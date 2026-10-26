export const changedNutritionDays = (previousNutrition, nextNutrition) => {
  const previousDays = previousNutrition?.days ?? {}
  const nextDays = nextNutrition?.days ?? {}

  return Object.entries(nextDays)
    .filter(([date, day]) => previousDays[date] !== day)
    .map(([, day]) => day)
    .filter((day) => day?.date)
}
