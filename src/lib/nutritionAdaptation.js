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

const sessionDate = (session = {}) =>
  String(
    session.date ??
      session.completedAt ??
      session.finishedAt ??
      session.startedAt ??
      '',
  ).slice(0, 10)

const sessionEffortUnits = (session = {}) => {
  const sets = Array.isArray(session.sets) ? session.sets : []
  return sets.filter((set) => {
    if (set?.done === false) return false
    const reps = Number(set?.reps ?? 0)
    const weight = Number(set?.weight ?? 0)
    return reps > 0 || weight > 0
  }).length
}

export function analyzeTrainingDemandStabilization({
  history = [],
  now = new Date(),
} = {}) {
  const end = new Date(now)
  const recentStart = new Date(end)
  recentStart.setDate(recentStart.getDate() - 13)
  const baselineEnd = new Date(recentStart)
  baselineEnd.setDate(baselineEnd.getDate() - 1)
  const baselineStart = new Date(baselineEnd)
  baselineStart.setDate(baselineStart.getDate() - 27)

  const dated = (Array.isArray(history) ? history : [])
    .map((session) => ({
      session,
      date: sessionDate(session),
    }))
    .filter((item) => item.date)

  const inRange = (date, start, finish) => {
    const time = new Date(`${date}T12:00:00`).getTime()
    return (
      Number.isFinite(time) &&
      time >= start.getTime() &&
      time <= finish.getTime()
    )
  }

  const recent = dated.filter((item) =>
    inRange(item.date, recentStart, end),
  )
  const baseline = dated.filter((item) =>
    inRange(item.date, baselineStart, baselineEnd),
  )

  if (baseline.length < 8) {
    return {
      status: 'learning',
      reason:
        'AVAREN needs more workout history before training demand can influence nutrition.',
      baselineSessionsPerWeek: null,
      recentSessionsPerWeek: recent.length / 2,
      demandRatio: 1,
      calorieBias: 0,
    }
  }

  const baselineSessionsPerWeek = baseline.length / 4
  const recentSessionsPerWeek = recent.length / 2
  const frequencyRatio =
    baselineSessionsPerWeek > 0
      ? recentSessionsPerWeek / baselineSessionsPerWeek
      : 1

  const baselineEffort = average(
    baseline.map((item) => sessionEffortUnits(item.session)),
  )
  const recentEffort = average(
    recent.map((item) => sessionEffortUnits(item.session)),
  )
  const effortRatio =
    baselineEffort > 0 && recent.length > 0
      ? recentEffort / baselineEffort
      : 1

  // Frequency is intentionally dominant. Exercise/set effort is a secondary
  // stabilizer so one unusually hard or easy workout cannot swing nutrition.
  const demandRatio =
    clamp(frequencyRatio, 0.4, 1.6) * 0.8 +
    clamp(effortRatio, 0.6, 1.4) * 0.2

  let direction = 'stable'
  let calorieBias = 0

  if (demandRatio <= 0.68) {
    direction = 'substantially_lower'
    calorieBias = -100
  } else if (demandRatio <= 0.82) {
    direction = 'lower'
    calorieBias = -50
  } else if (demandRatio >= 1.32) {
    direction = 'substantially_higher'
    calorieBias = 100
  } else if (demandRatio >= 1.18) {
    direction = 'higher'
    calorieBias = 50
  }

  return {
    status: 'ready',
    direction,
    baselineSessionsPerWeek,
    recentSessionsPerWeek,
    frequencyRatio,
    baselineEffortPerSession: baselineEffort,
    recentEffortPerSession: recentEffort,
    effortRatio,
    demandRatio,
    calorieBias,
    baselineSessionCount: baseline.length,
    recentSessionCount: recent.length,
  }
}

export function analyzeNutritionAdaptation({
  days = [],
  goal,
  currentBaseCalories,
  lastAppliedAt = null,
  trainingHistory = [],
  now = new Date(),
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
    adjustmentCalories = goal === 'build_muscle' ? rule.slowDelta : rule.fastDelta
    direction = goal === 'build_muscle' ? 'too_slow' : 'too_fast'
  } else if (percentPerWeek > rule.maxPercentPerWeek) {
    adjustmentCalories = goal === 'build_muscle' ? rule.fastDelta : rule.slowDelta
    direction = goal === 'build_muscle' ? 'too_fast' : 'too_slow'
  }

  const trainingDemand = analyzeTrainingDemandStabilization({
    history: trainingHistory,
    now,
  })

  if (trainingDemand.status === 'ready' && trainingDemand.calorieBias !== 0) {
    const trainingBias = Number(trainingDemand.calorieBias || 0)

    // Body-weight response remains the primary signal. Training demand only
    // nudges the recommendation, and can create at most a small standalone
    // adjustment when weight trend is otherwise on target.
    if (adjustmentCalories === 0) {
      adjustmentCalories = trainingBias
      direction =
        trainingBias < 0
          ? 'training_demand_lower'
          : 'training_demand_higher'
    } else if (Math.sign(adjustmentCalories) === Math.sign(trainingBias)) {
      adjustmentCalories += Math.sign(trainingBias) * 50
    } else {
      adjustmentCalories += Math.sign(trainingBias) * 50
    }
  }

  adjustmentCalories = clamp(roundTo(adjustmentCalories, 50), -200, 200)

  const trainingOnlyAdjustment =
    direction === 'training_demand_lower' ||
    direction === 'training_demand_higher'

  const reason = trainingOnlyAdjustment
    ? `Your recent training is averaging ${trainingDemand.recentSessionsPerWeek.toFixed(1)} sessions per week versus a ${trainingDemand.baselineSessionsPerWeek.toFixed(1)}-session baseline. AVAREN is recommending only a small calorie ${adjustmentCalories < 0 ? 'reduction' : 'increase'} while keeping protein unchanged.`
    : null

  return {
    status: adjustmentCalories === 0 ? 'on_track' : 'recommend',
    reason,
    adjustmentCalories,
    direction,
    adherence,
    percentPerWeek,
    firstWeightAverage,
    secondWeightAverage,
    loggedDays: calorieDays.length,
    weighIns: weightDays.length,
    targetRange: [rule.minPercentPerWeek, rule.maxPercentPerWeek],
    trainingDemand,
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
          trainingDemand: analysis.trainingDemand
            ? {
                direction: analysis.trainingDemand.direction ?? 'stable',
                baselineSessionsPerWeek:
                  Number(analysis.trainingDemand.baselineSessionsPerWeek || 0),
                recentSessionsPerWeek:
                  Number(analysis.trainingDemand.recentSessionsPerWeek || 0),
                demandRatio:
                  Number(analysis.trainingDemand.demandRatio || 1),
              }
            : null,
        },
      ].slice(-12),
    },
  }
}
