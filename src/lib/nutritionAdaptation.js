const roundTo = (value, increment = 5) =>
  Math.round(Number(value || 0) / increment) * increment

const clamp = (value, min, max) => Math.min(max, Math.max(min, value))

const GOAL_TREND_RULES = {
  lose_fat: {
    minPercentPerWeek: -1.0,
    maxPercentPerWeek: -0.4,
    slowDelta: -150,
    fastDelta: 150,
    label: 'fat-loss',
  },
  maintain: {
    minPercentPerWeek: -0.25,
    maxPercentPerWeek: 0.25,
    slowDelta: 100,
    fastDelta: -100,
    label: 'maintenance',
  },
  build_muscle: {
    minPercentPerWeek: 0.1,
    maxPercentPerWeek: 0.35,
    slowDelta: 150,
    fastDelta: -150,
    label: 'muscle-gain',
  },
  performance: {
    minPercentPerWeek: -0.25,
    maxPercentPerWeek: 0.25,
    slowDelta: 100,
    fastDelta: -100,
    label: 'performance',
  },
}

const average = (values = []) =>
  values.length
    ? values.reduce((sum, value) => sum + Number(value || 0), 0) / values.length
    : 0

export function analyzeNutritionAdaptation({
  days = [],
  goal,
  currentBaseCalories,
  lastAppliedAt = null,
} = {}) {
  const rule = GOAL_TREND_RULES[goal]
  if (!rule) {
    return {
      status: 'unavailable',
      reason: 'Choose a supported nutrition goal first.',
      adjustmentCalories: 0,
    }
  }

  const ordered = [...days]
    .filter((day) => day?.date)
    .sort((a, b) => a.date.localeCompare(b.date))
    .slice(-14)

  if (ordered.some((day) => day.completeNutrition === false)) {
    return {
      status: 'loading',
      reason: 'Refreshing recent food details before AVAREN evaluates your trend.',
      adjustmentCalories: 0,
    }
  }

  const calorieDays = ordered.filter(
    (day) => Number(day.calories) > 0 && Number(day.budget) > 0,
  )
  const weightDays = ordered.filter((day) => Number(day.weight) > 0)

  if (calorieDays.length < 10 || weightDays.length < 4) {
    return {
      status: 'learning',
      reason: `AVAREN needs at least 10 logged nutrition days and 4 weigh-ins across 14 days. Current: ${calorieDays.length} nutrition days, ${weightDays.length} weigh-ins.`,
      adjustmentCalories: 0,
      loggedDays: calorieDays.length,
      weighIns: weightDays.length,
    }
  }

  const firstDate = new Date(`${weightDays[0].date}T12:00:00`)
  const lastDate = new Date(`${weightDays[weightDays.length - 1].date}T12:00:00`)
  const spanDays = Math.max(
    0,
    Math.round((lastDate.getTime() - firstDate.getTime()) / 86400000),
  )

  if (spanDays < 7) {
    return {
      status: 'learning',
      reason: 'AVAREN needs weigh-ins spanning at least 7 days before adjusting targets.',
      adjustmentCalories: 0,
      loggedDays: calorieDays.length,
      weighIns: weightDays.length,
    }
  }

  const midpoint = ordered.length >= 14 ? 7 : Math.ceil(ordered.length / 2)
  const firstHalfDates = new Set(ordered.slice(0, midpoint).map((day) => day.date))
  const secondHalfDates = new Set(ordered.slice(midpoint).map((day) => day.date))
  const firstWeights = weightDays
    .filter((day) => firstHalfDates.has(day.date))
    .map((day) => Number(day.weight))
  const secondWeights = weightDays
    .filter((day) => secondHalfDates.has(day.date))
    .map((day) => Number(day.weight))

  if (firstWeights.length < 2 || secondWeights.length < 2) {
    return {
      status: 'learning',
      reason: 'AVAREN needs at least 2 weigh-ins in each half of the review window to smooth normal scale noise.',
      adjustmentCalories: 0,
      loggedDays: calorieDays.length,
      weighIns: weightDays.length,
    }
  }

  const firstWeightAverage = average(firstWeights)
  const secondWeightAverage = average(secondWeights)
  const weightChange = secondWeightAverage - firstWeightAverage
  const percentChange =
    firstWeightAverage > 0 ? (weightChange / firstWeightAverage) * 100 : 0
  const daysBetweenWindows = Math.max(7, Math.round(ordered.length / 2))
  const percentPerWeek = percentChange * (7 / daysBetweenWindows)

  const adherentDays = calorieDays.filter((day) => {
    const budget = Number(day.budget)
    const intake = Number(day.calories)
    return budget > 0 && Math.abs(intake - budget) / budget <= 0.15
  }).length
  const adherence = adherentDays / calorieDays.length

  if (adherence < 0.7) {
    return {
      status: 'hold_for_adherence',
      reason: 'Your recent intake is too variable to tell whether the target itself needs changing. AVAREN will hold the plan until the data is cleaner.',
      adjustmentCalories: 0,
      adherence,
      percentPerWeek,
      firstWeightAverage,
      secondWeightAverage,
      loggedDays: calorieDays.length,
      weighIns: weightDays.length,
    }
  }

  if (lastAppliedAt) {
    const lastApplied = new Date(lastAppliedAt)
    const now = new Date()
    const daysSinceAdjustment = (now.getTime() - lastApplied.getTime()) / 86400000
    if (Number.isFinite(daysSinceAdjustment) && daysSinceAdjustment < 7) {
      return {
        status: 'cooldown',
        reason: 'AVAREN recently adjusted this plan. Hold the new target for at least 7 days before changing it again.',
        adjustmentCalories: 0,
        adherence,
        percentPerWeek,
        firstWeightAverage,
        secondWeightAverage,
        loggedDays: calorieDays.length,
        weighIns: weightDays.length,
      }
    }
  }

  let adjustmentCalories = 0
  let direction = 'hold'

  if (percentPerWeek < rule.minPercentPerWeek) {
    adjustmentCalories = rule.fastDelta
    direction = 'too_fast'
  } else if (percentPerWeek > rule.maxPercentPerWeek) {
    adjustmentCalories = rule.slowDelta
    direction = 'too_slow'
  }

  adjustmentCalories = clamp(roundTo(adjustmentCalories, 50), -200, 200)

  return {
    status: adjustmentCalories === 0 ? 'on_track' : 'recommend',
    adjustmentCalories,
    direction,
    adherence,
    percentPerWeek,
    firstWeightAverage,
    secondWeightAverage,
    loggedDays: calorieDays.length,
    weighIns: weightDays.length,
    targetRange: [rule.minPercentPerWeek, rule.maxPercentPerWeek],
    proposedBaseCalories: Math.max(
      1200,
      roundTo(Number(currentBaseCalories || 0) + adjustmentCalories, 10),
    ),
  }
}

export function applyAdaptiveNutritionAdjustment(goals = {}, analysis = {}) {
  const delta = Number(analysis.adjustmentCalories || 0)
  if (!delta) return goals

  const currentCalories = Number(goals.calories || 0)
  const calories = Math.max(1200, roundTo(currentCalories + delta, 10))
  const protein = Number(goals.protein || 0)
  const inputs = goals.inputs ?? {}
  const weightLb = Number(inputs.weightLb || 0)
  const weightKg = weightLb * 0.45359237
  const strategy = goals.macroStrategy ?? {}
  const fatShare = clamp(Number(strategy.fatShare || 0.25), 0.2, 0.3)
  const fatFloorGrams = weightKg > 0 ? weightKg * 0.65 : 0
  const fat = roundTo(Math.max(fatFloorGrams, (calories * fatShare) / 9), 5)
  const carbs = roundTo(
    Math.max(0, calories - protein * 4 - fat * 9) / 4,
    5,
  )

  const appliedAt = new Date().toISOString()
  const previousHistory = Array.isArray(goals.adaptation?.history)
    ? goals.adaptation.history
    : []

  return {
    ...goals,
    calories,
    protein,
    carbs,
    fat,
    source: 'ava_adaptive',
    adaptation: {
      enabled: true,
      lastAppliedAt: appliedAt,
      lastAdjustmentCalories: delta,
      lastObservedPercentPerWeek: Number(analysis.percentPerWeek || 0),
      history: [
        ...previousHistory,
        {
          appliedAt,
          previousCalories: currentCalories,
          nextCalories: calories,
          adjustmentCalories: delta,
          percentPerWeek: Number(analysis.percentPerWeek || 0),
          adherence: Number(analysis.adherence || 0),
        },
      ].slice(-12),
    },
  }
}
