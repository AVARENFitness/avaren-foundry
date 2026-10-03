const DAY_MS = 86400000

const goalLabels = {
  lose_fat: 'Fat loss',
  maintain: 'Maintain',
  build_muscle: 'Build muscle',
  performance: 'Performance',
  consistency: 'Training consistency',
  general_fitness: 'General fitness',
}

const sessionTime = (session = {}) => {
  const value = session.finishedAt ?? session.date ?? null
  if (!value) return null
  const parsed = new Date(
    String(value).includes('T') ? value : `${value}T12:00:00`,
  ).getTime()
  return Number.isFinite(parsed) ? parsed : null
}

const recentSessions = (history = [], days = 28, now = new Date()) => {
  const cutoff = now.getTime() - days * DAY_MS
  return (history ?? []).filter((session) => {
    const time = sessionTime(session)
    return Number.isFinite(time) && time >= cutoff && time <= now.getTime()
  })
}

const weightEntries = (nutrition = {}) =>
  Object.values(nutrition?.days ?? {})
    .map((day) => ({
      date: day?.date ?? null,
      weight: Number(day?.weight),
    }))
    .filter((entry) => entry.date && Number.isFinite(entry.weight) && entry.weight > 0)
    .sort((a, b) => String(a.date).localeCompare(String(b.date)))

const formatWeightDelta = (delta) => {
  if (!Number.isFinite(delta)) return 'Not enough weigh-ins yet'
  const rounded = Math.round(delta * 10) / 10
  if (Math.abs(rounded) < 0.1) return 'Weight is stable'
  return `${rounded > 0 ? '+' : ''}${rounded} lb over recent weigh-ins`
}

const countRecentPRs = (prs = [], days = 28, now = new Date()) => {
  const cutoff = now.getTime() - days * DAY_MS
  return (prs ?? []).filter((pr) => {
    if (!pr?.date) return false
    const time = new Date(`${pr.date}T12:00:00`).getTime()
    return Number.isFinite(time) && time >= cutoff && time <= now.getTime()
  }).length
}

export const buildGoalAwareProgress = ({
  state = {},
  prs = [],
  structuredGoal = null,
  now = new Date(),
} = {}) => {
  const goal =
    structuredGoal?.primaryGoal ??
    state?.nutrition?.goals?.inputs?.goal ??
    null
  const goalLabel = goalLabels[goal] ?? 'Training progress'
  const recent = recentSessions(state.history, 28, now)
  const previousWindowStart = now.getTime() - 56 * DAY_MS
  const previousWindowEnd = now.getTime() - 28 * DAY_MS
  const previous = (state.history ?? []).filter((session) => {
    const time = sessionTime(session)
    return (
      Number.isFinite(time) &&
      time >= previousWindowStart &&
      time < previousWindowEnd
    )
  })

  const recentPerWeek = recent.length / 4
  const previousPerWeek = previous.length / 4
  const weights = weightEntries(state.nutrition)
  const latestWeights = weights.slice(-6)
  const weightDelta =
    latestWeights.length >= 2
      ? latestWeights.at(-1).weight - latestWeights[0].weight
      : null
  const recentPrCount = countRecentPRs(prs, 28, now)

  const frequencyDetail =
    previous.length >= 4
      ? `${recentPerWeek.toFixed(1)} sessions/week recently · ${previousPerWeek.toFixed(1)} before`
      : `${recent.length} sessions in the last 4 weeks`

  const strengthDetail =
    recentPrCount > 0
      ? `${recentPrCount} personal record${recentPrCount === 1 ? '' : 's'} in the last 4 weeks`
      : 'No recent PRs — use the strength chart for exercise-level trend'

  const weightDetail = formatWeightDelta(weightDelta)

  const cardsByGoal = {
    lose_fat: [
      { label: 'Body-weight trend', value: weightDetail },
      { label: 'Training consistency', value: frequencyDetail },
      { label: 'Strength retention', value: strengthDetail },
    ],
    maintain: [
      { label: 'Weight stability', value: weightDetail },
      { label: 'Training consistency', value: frequencyDetail },
      { label: 'Strength trend', value: strengthDetail },
    ],
    build_muscle: [
      { label: 'Training consistency', value: frequencyDetail },
      { label: 'Strength trend', value: strengthDetail },
      { label: 'Body-weight trend', value: weightDetail },
    ],
    performance: [
      { label: 'Training consistency', value: frequencyDetail },
      { label: 'Strength trend', value: strengthDetail },
      {
        label: 'Recovery context',
        value: 'Use Readiness trends to review sleep, soreness, energy, and stress',
      },
    ],
    consistency: [
      { label: 'Training consistency', value: frequencyDetail },
      { label: 'Strength trend', value: strengthDetail },
      {
        label: 'Recovery support',
        value: 'Use Readiness trends to keep the routine sustainable',
      },
    ],
    general_fitness: [
      { label: 'Training consistency', value: frequencyDetail },
      { label: 'Strength trend', value: strengthDetail },
      { label: 'Body-weight trend', value: weightDetail },
    ],
  }

  const descriptions = {
    lose_fat:
      'Track whether body weight is moving while training quality stays supported.',
    maintain:
      'Look for stable body weight with consistent training and preserved performance.',
    build_muscle:
      'Prioritize consistent training, improving strength, and a controlled body-weight trend.',
    performance:
      'Prioritize training consistency, performance trend, and recovery quality.',
    consistency:
      'Build a repeatable training rhythm first, then improve the quality of each session.',
    general_fitness:
      'Use consistency, strength, recovery, and body-weight context to build overall fitness.',
  }

  return {
    goal,
    goalLabel,
    description:
      descriptions[goal] ??
      'Use training consistency, strength trend, recovery, and body-weight history to judge progress.',
    cards:
      cardsByGoal[goal] ?? [
        { label: 'Training consistency', value: frequencyDetail },
        { label: 'Strength trend', value: strengthDetail },
        { label: 'Body-weight trend', value: weightDetail },
      ],
  }
}
