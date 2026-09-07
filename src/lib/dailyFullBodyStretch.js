import { localCalendarDateKey } from './localCalendarDay'
import { cloneMovement } from '../data/mobility'

/**
 * Deterministic full-body stretch pools (curated from mobility library).
 * One pick per category per local day; session stays full-body.
 */
export const FULL_BODY_STRETCH_CATEGORIES = [
  {
    id: 'shoulders_chest',
    label: 'Shoulders / chest',
    movementIds: ['wall-pec', 'cross-body', 'wall-angels'],
  },
  {
    id: 'upper_back',
    label: 'Upper back',
    movementIds: ['thread-needle', 'thoracic-rotation', 'child-pose-lat'],
  },
  {
    id: 'hips_glutes',
    label: 'Hips / glutes',
    movementIds: ['figure-four', 'ninety-ninety', 'hip-flexor'],
  },
  {
    id: 'hamstrings',
    label: 'Hamstrings',
    movementIds: ['hamstring-fold', 'worlds-greatest-stretch'],
  },
  {
    id: 'quads_hip_flexors',
    label: 'Quads / hip flexors',
    movementIds: ['standing-quad', 'hip-flexor', 'squat-pry'],
  },
  {
    id: 'calves_ankles',
    label: 'Calves / ankles',
    movementIds: ['calf-wall', 'ankle-rocks'],
  },
  {
    id: 'finish',
    label: 'Calm finish',
    movementIds: ['child-pose', 'cobra', 'cat-cow'],
  },
]

const LOWER_BIAS_CATEGORIES = new Set([
  'hips_glutes',
  'hamstrings',
  'quads_hip_flexors',
  'calves_ankles',
])

const UPPER_BIAS_CATEGORIES = new Set(['shoulders_chest', 'upper_back'])

export const hashDailySeed = (input = '') => {
  let hash = 2166136261
  const text = String(input)
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index)
    hash = Math.imul(hash, 16777619)
  }
  return hash >>> 0
}

export const pickIndexFromSeed = (seed, length, salt = 0) => {
  if (!length) return 0
  const value = (seed + Math.imul(salt + 1, 2654435761)) >>> 0
  return value % length
}

export const inferSessionBias = (session = null) => {
  const names = []
  for (const exercise of session?.exercises ?? session?.sets ?? []) {
    names.push(
      String(exercise?.muscle ?? ''),
      String(exercise?.name ?? ''),
    )
  }
  names.push(String(session?.name ?? ''))
  const blob = names.join(' ').toLowerCase()

  const lower =
    /leg|squat|dead|hinge|glute|hamstring|quad|hip|calf|ankle|knee/.test(blob)
  const upper =
    /chest|bench|press|back|row|shoulder|pull|push|arm|bicep|tricep/.test(blob)

  if (lower && !upper) return 'lower'
  if (upper && !lower) return 'upper'
  return 'balanced'
}

const orderPoolsForBias = (bias = 'balanced') => {
  if (bias === 'lower') {
    return [...FULL_BODY_STRETCH_CATEGORIES].sort((a, b) => {
      const aLower = LOWER_BIAS_CATEGORIES.has(a.id) ? 0 : 1
      const bLower = LOWER_BIAS_CATEGORIES.has(b.id) ? 0 : 1
      return aLower - bLower
    })
  }
  if (bias === 'upper') {
    return [...FULL_BODY_STRETCH_CATEGORIES].sort((a, b) => {
      const aUpper = UPPER_BIAS_CATEGORIES.has(a.id) ? 0 : 1
      const bUpper = UPPER_BIAS_CATEGORIES.has(b.id) ? 0 : 1
      return aUpper - bUpper
    })
  }
  return [...FULL_BODY_STRETCH_CATEGORIES]
}

const categoryMetaForMovement = (movementId) => {
  const category = FULL_BODY_STRETCH_CATEGORIES.find((entry) =>
    (entry.movementIds ?? []).includes(movementId),
  )
  return category
    ? { stretchCategory: category.id, stretchCategoryLabel: category.label }
    : {}
}

export const rebuildFullBodyStretchFlowFromSnapshot = (
  snapshot = {},
  durationPreferences = {},
) => {
  const dayKey = snapshot.dateKey
  const movementIds = snapshot.movementIds ?? []
  const movements = movementIds
    .map((id) => {
      const movement = cloneMovement(id, durationPreferences)
      if (!movement) return null
      return {
        ...movement,
        ...categoryMetaForMovement(id),
      }
    })
    .filter(Boolean)

  const bias = snapshot.bias ?? 'balanced'
  return {
    id: `full-body-stretch-${dayKey}`,
    title: 'Full-Body Stretch',
    subtitle: 'Optional calm mobility · ~10–15 min',
    reason:
      bias === 'balanced'
        ? 'A full-body stretch for the rest of your day.'
        : `Full-body stretch with a light ${bias}-body emphasis from today's training.`,
    focusAreas: FULL_BODY_STRETCH_CATEGORIES.map((item) => item.label),
    kind: 'full_body_stretch',
    seedKey: snapshot.seedKey ?? '',
    bias,
    movements,
  }
}

/**
 * Build today's Full-Body Stretch. Stable for athleteId + local date + fixed bias.
 * Workout bias may reorder category preference for pool picks but never drops a region.
 */
export const buildFullBodyStretchFlow = ({
  athleteId = 'athlete',
  now = new Date(),
  session = null,
  durationPreferences = {},
  bias: biasOverride = null,
} = {}) => {
  const dayKey = localCalendarDateKey(now)
  const seed = hashDailySeed(`${athleteId}:${dayKey}`)
  const bias = biasOverride ?? inferSessionBias(session)
  const categories = orderPoolsForBias(bias)
  const used = new Set()
  const movements = []

  categories.forEach((category, index) => {
    const pool = (category.movementIds ?? []).filter((id) => !used.has(id))
    const source = pool.length ? pool : category.movementIds
    const pick = source[pickIndexFromSeed(seed, source.length, index)]
    if (!pick || used.has(pick)) return
    used.add(pick)
    const movement = cloneMovement(pick, durationPreferences)
    if (movement) {
      movements.push({
        ...movement,
        stretchCategory: category.id,
        stretchCategoryLabel: category.label,
      })
    }
  })

  return {
    id: `full-body-stretch-${dayKey}`,
    title: 'Full-Body Stretch',
    subtitle: 'Optional calm mobility · ~10–15 min',
    reason:
      bias === 'balanced'
        ? 'A full-body stretch for the rest of your day.'
        : `Full-body stretch with a light ${bias}-body emphasis from today's training.`,
    focusAreas: FULL_BODY_STRETCH_CATEGORIES.map((item) => item.label),
    kind: 'full_body_stretch',
    seedKey: `${athleteId}:${dayKey}`,
    bias,
    movements,
  }
}

/**
 * Canonical first-open lock for the local day.
 * Once resolved (Home or Train), later workout context cannot reshuffle it.
 */
export const resolveCanonicalDailyFullBodyStretch = ({
  athleteId = 'athlete',
  now = new Date(),
  session = null,
  durationPreferences = {},
  mobilityDaily = {},
} = {}) => {
  const dayKey = localCalendarDateKey(now)
  const existing = mobilityDaily?.fullBodyStretch ?? null

  if (
    existing &&
    existing.dateKey === dayKey &&
    Array.isArray(existing.movementIds) &&
    existing.movementIds.length > 0
  ) {
    return {
      flow: rebuildFullBodyStretchFlowFromSnapshot(
        existing,
        durationPreferences,
      ),
      snapshot: existing,
      created: false,
    }
  }

  const flow = buildFullBodyStretchFlow({
    athleteId,
    now,
    session,
    durationPreferences,
  })
  const snapshot = {
    dateKey: dayKey,
    seedKey: flow.seedKey,
    bias: flow.bias ?? 'balanced',
    movementIds: flow.movements.map((movement) => movement.id),
    resolvedAt: new Date(now).toISOString(),
  }

  return {
    flow: {
      ...flow,
      // Ensure rebuild path and live path share identical movement order.
      movements: rebuildFullBodyStretchFlowFromSnapshot(
        snapshot,
        durationPreferences,
      ).movements,
    },
    snapshot,
    created: true,
  }
}

export const withCanonicalDailyFullBodyStretch = (
  state = {},
  {
    athleteId = 'athlete',
    now = new Date(),
    session = null,
  } = {},
) => {
  const mobility = state.mobility ?? {}
  const resolved = resolveCanonicalDailyFullBodyStretch({
    athleteId,
    now,
    session,
    durationPreferences: mobility.durationPreferences ?? {},
    mobilityDaily: mobility.daily ?? {},
  })

  if (!resolved.created) {
    return { state, flow: resolved.flow, created: false }
  }

  return {
    state: {
      ...state,
      mobility: {
        ...mobility,
        durationPreferences: mobility.durationPreferences ?? {},
        completed: mobility.completed ?? [],
        daily: {
          ...(mobility.daily ?? {}),
          fullBodyStretch: resolved.snapshot,
        },
      },
    },
    flow: resolved.flow,
    created: true,
  }
}

export const estimateStretchMinutes = (flow = {}) => {
  const movements = flow?.movements ?? []
  let seconds = 0
  for (const movement of movements) {
    if (movement?.type === 'timed') {
      seconds += Number(movement.target ?? 45)
      if (movement.side && /each/i.test(String(movement.side))) {
        seconds += Number(movement.target ?? 45)
      }
    } else {
      seconds += 40
    }
  }
  return Math.max(8, Math.round(seconds / 60))
}
