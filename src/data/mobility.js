const MOVEMENTS = {
  'neck-cars': {
    id: 'neck-cars',
    name: 'Neck CARs',
    type: 'reps',
    target: 5,
    side: 'each direction',
    tags: ['neck', 'shoulders', 'general'],
    instruction:
      'Move slowly through a comfortable circle. Keep the shoulders relaxed.',
  },
  'cat-cow': {
    id: 'cat-cow',
    name: 'Cat-Cow',
    type: 'reps',
    target: 8,
    tags: ['spine', 'core', 'general'],
    instruction:
      'Move gently between rounded and extended positions with your breathing.',
  },
  'worlds-greatest-stretch': {
    id: 'worlds-greatest-stretch',
    name: "World's Greatest Stretch",
    type: 'timed',
    seconds: 30,
    side: 'each side',
    tags: ['hips', 'thoracic', 'hamstrings', 'general'],
    instruction:
      'Step into a long lunge, place one hand down, and rotate the other arm upward.',
  },
  'hip-flexor': {
    id: 'hip-flexor',
    name: 'Half-Kneeling Hip Flexor',
    type: 'timed',
    seconds: 30,
    side: 'each side',
    tags: ['hips', 'quads', 'glutes'],
    instruction:
      'Tuck the pelvis slightly and shift forward without arching the lower back.',
  },
  'thoracic-rotation': {
    id: 'thoracic-rotation',
    name: 'Open-Book Rotation',
    type: 'reps',
    target: 6,
    side: 'each side',
    tags: ['thoracic', 'back', 'shoulders'],
    instruction:
      'Keep the knees stacked and rotate through the upper back.',
  },
  'squat-pry': {
    id: 'squat-pry',
    name: 'Bodyweight Squat Pry',
    type: 'timed',
    seconds: 30,
    tags: ['hips', 'ankles', 'quads', 'glutes'],
    instruction:
      'Sit into a comfortable squat and gently shift side to side.',
  },
  'ankle-rocks': {
    id: 'ankle-rocks',
    name: 'Knee-to-Wall Ankle Rocks',
    type: 'reps',
    target: 8,
    side: 'each side',
    tags: ['ankles', 'calves', 'quads'],
    instruction:
      'Drive the knee forward over the toes while keeping the heel down.',
  },
  'wall-pec': {
    id: 'wall-pec',
    name: 'Wall Pec Stretch',
    type: 'timed',
    seconds: 30,
    side: 'each side',
    tags: ['chest', 'shoulders', 'arms'],
    instruction:
      'Place the forearm against a wall and gently turn away.',
  },
  'thread-needle': {
    id: 'thread-needle',
    name: 'Thread the Needle',
    type: 'reps',
    target: 6,
    side: 'each side',
    tags: ['thoracic', 'back', 'shoulders'],
    instruction:
      'Reach under the body, then rotate open through the upper back.',
  },
  'child-pose-lat': {
    id: 'child-pose-lat',
    name: "Child's Pose Lat Reach",
    type: 'timed',
    seconds: 30,
    side: 'each side',
    tags: ['back', 'lats', 'shoulders'],
    instruction:
      'Sit the hips back and walk both hands toward one side.',
  },
  'cross-body': {
    id: 'cross-body',
    name: 'Cross-Body Shoulder Stretch',
    type: 'timed',
    seconds: 30,
    side: 'each side',
    tags: ['shoulders', 'arms'],
    instruction:
      'Bring one arm across the chest without shrugging.',
  },
  'wall-angels': {
    id: 'wall-angels',
    name: 'Floor or Wall Angels',
    type: 'reps',
    target: 8,
    tags: ['shoulders', 'thoracic', 'back'],
    instruction:
      'Move slowly while keeping the ribs controlled.',
  },
  'triceps': {
    id: 'triceps',
    name: 'Overhead Triceps Stretch',
    type: 'timed',
    seconds: 30,
    side: 'each side',
    tags: ['arms', 'shoulders'],
    instruction:
      'Reach one hand down the upper back and guide the elbow gently.',
  },
  'wrist-flexor': {
    id: 'wrist-flexor',
    name: 'Wrist Flexor Stretch',
    type: 'timed',
    seconds: 25,
    side: 'each side',
    tags: ['arms', 'wrists'],
    instruction:
      'Straighten the elbow and gently extend the wrist.',
  },
  'wrist-extensor': {
    id: 'wrist-extensor',
    name: 'Wrist Extensor Stretch',
    type: 'timed',
    seconds: 25,
    side: 'each side',
    tags: ['arms', 'wrists'],
    instruction:
      'Straighten the elbow and gently flex the wrist.',
  },
  'standing-quad': {
    id: 'standing-quad',
    name: 'Standing Quad Stretch',
    type: 'timed',
    seconds: 30,
    side: 'each side',
    tags: ['quads', 'hips'],
    instruction:
      'Keep the knees close and gently tuck the pelvis.',
  },
  'hamstring-fold': {
    id: 'hamstring-fold',
    name: 'Supported Hamstring Fold',
    type: 'timed',
    seconds: 30,
    side: 'each side',
    tags: ['hamstrings', 'hips'],
    instruction:
      'Extend one leg and hinge forward with a long spine.',
  },
  'figure-four': {
    id: 'figure-four',
    name: 'Figure-Four Glute Stretch',
    type: 'timed',
    seconds: 30,
    side: 'each side',
    tags: ['glutes', 'hips'],
    instruction:
      'Cross one ankle over the opposite thigh and sit back gently.',
  },
  'ninety-ninety': {
    id: 'ninety-ninety',
    name: '90/90 Hip Switches',
    type: 'reps',
    target: 8,
    tags: ['hips', 'glutes'],
    instruction:
      'Rotate both knees side to side under control.',
  },
  'calf-wall': {
    id: 'calf-wall',
    name: 'Wall Calf Stretch',
    type: 'timed',
    seconds: 30,
    side: 'each side',
    tags: ['calves', 'ankles'],
    instruction:
      'Keep the back heel down and the back knee straight.',
  },
  'cobra': {
    id: 'cobra',
    name: 'Gentle Prone Press-Up',
    type: 'reps',
    target: 6,
    tags: ['core', 'spine'],
    instruction:
      'Press up only as far as feels comfortable.',
  },
  'child-pose': {
    id: 'child-pose',
    name: "Child's Pose",
    type: 'timed',
    seconds: 30,
    tags: ['core', 'back', 'general'],
    instruction:
      'Sit the hips back and breathe into the back of the rib cage.',
  },
}

const cloneMovement = (id, durationPreferences = {}) => {
  const movement = MOVEMENTS[id]
  if (!movement) return null

  return {
    ...movement,
    ...(movement.type === 'timed' && durationPreferences[id]
      ? { seconds: durationPreferences[id] }
      : {}),
  }
}

const unique = (items) => [...new Set(items.filter(Boolean))]

const normalizeMuscle = (muscle = '') => {
  const value = muscle.toLowerCase()
  if (value.includes('chest')) return 'chest'
  if (value.includes('back') || value.includes('lat')) return 'back'
  if (
    value.includes('shoulder') ||
    value.includes('delt') ||
    value.includes('trap')
  ) return 'shoulders'
  if (
    value.includes('bicep') ||
    value.includes('tricep') ||
    value.includes('forearm')
  ) return 'arms'
  if (value.includes('quad')) return 'quads'
  if (value.includes('hamstring')) return 'hamstrings'
  if (value.includes('glute')) return 'glutes'
  if (value.includes('calf')) return 'calves'
  if (value.includes('core') || value.includes('ab')) return 'core'
  return null
}

const workoutFocus = (workoutName = '') => {
  const value = workoutName.toLowerCase()

  if (value.includes('chest') || value.includes('back')) {
    return ['chest', 'back', 'shoulders', 'thoracic']
  }

  if (value.includes('arm')) {
    return ['arms', 'shoulders', 'wrists', 'thoracic']
  }

  if (value.includes('leg') || value.includes('core')) {
    return ['hips', 'quads', 'hamstrings', 'glutes', 'ankles', 'core']
  }

  return ['general', 'spine', 'hips', 'shoulders']
}

const movementIdsForFocus = {
  chest: ['wall-pec', 'thread-needle'],
  back: ['child-pose-lat', 'thoracic-rotation'],
  shoulders: ['cross-body', 'wall-angels'],
  thoracic: ['thoracic-rotation', 'thread-needle'],
  arms: ['triceps', 'wrist-flexor', 'wrist-extensor'],
  wrists: ['wrist-flexor', 'wrist-extensor'],
  hips: ['hip-flexor', 'ninety-ninety', 'worlds-greatest-stretch'],
  quads: ['standing-quad', 'hip-flexor'],
  hamstrings: ['hamstring-fold', 'worlds-greatest-stretch'],
  glutes: ['figure-four', 'ninety-ninety'],
  ankles: ['ankle-rocks', 'calf-wall'],
  calves: ['calf-wall', 'ankle-rocks'],
  core: ['cat-cow', 'cobra', 'child-pose'],
  spine: ['cat-cow', 'thoracic-rotation'],
  general: ['neck-cars', 'cat-cow', 'worlds-greatest-stretch'],
}

const latestWorkout = (history = []) =>
  [...history].sort((first, second) =>
    String(first?.date).localeCompare(String(second?.date)),
  ).at(-1) ?? null

const musclesFromSession = (session) =>
  unique(
    (session?.sets ?? [])
      .map((set) => normalizeMuscle(set?.muscle))
      .filter(Boolean),
  )

const addMovementIds = (target, focusKeys, limit = 6) => {
  focusKeys.forEach((key) => {
    ;(movementIdsForFocus[key] ?? []).forEach((id) => {
      if (!target.includes(id) && target.length < limit) target.push(id)
    })
  })
}

export const DAILY_RESET = {
  id: 'daily-reset',
  title: 'Daily Reset',
  subtitle: 'Wake up the body',
  reason: 'A balanced, equipment-free reset for the whole body.',
  focusAreas: ['Spine', 'Hips', 'Shoulders'],
  movements: [
    cloneMovement('neck-cars'),
    cloneMovement('cat-cow'),
    cloneMovement('worlds-greatest-stretch'),
    cloneMovement('hip-flexor'),
    cloneMovement('thoracic-rotation'),
    cloneMovement('squat-pry'),
  ],
}

export function buildAdaptiveDailyReset({
  history = [],
  plannedWorkout,
  durationPreferences = {},
}) {
  const lastWorkout = latestWorkout(history)
  const previousMuscles = musclesFromSession(lastWorkout)
  const plannedFocus = workoutFocus(plannedWorkout)

  const movementIds = ['neck-cars', 'cat-cow']

  addMovementIds(movementIds, previousMuscles, 4)
  addMovementIds(movementIds, plannedFocus, 6)

  if (movementIds.length < 6) {
    addMovementIds(
      movementIds,
      ['general', 'hips', 'thoracic', 'ankles'],
      6,
    )
  }

  const reasonParts = []

  if (lastWorkout?.name) {
    reasonParts.push(
      `Your last workout was ${lastWorkout.name}, so recovery work is included.`,
    )
  }

  if (plannedWorkout && plannedWorkout !== 'Rest') {
    reasonParts.push(
      `Today’s reset also prepares you for ${plannedWorkout}.`,
    )
  } else {
    reasonParts.push(
      'Today is set up as a recovery-focused day.',
    )
  }

  const focusAreas = unique([
    ...previousMuscles,
    ...plannedFocus,
  ])
    .slice(0, 4)
    .map((value) =>
      value
        .replace('thoracic', 'upper back')
        .replace('arms', 'arms & wrists')
        .replace(/\b\w/g, (character) => character.toUpperCase()),
    )

  return {
    id: `daily-reset-${new Date().toISOString().slice(0, 10)}`,
    title: 'Today’s Reset',
    subtitle: 'Adaptive morning movement',
    reason: reasonParts.join(' '),
    focusAreas,
    movements: movementIds
      .map((id) => cloneMovement(id, durationPreferences))
      .filter(Boolean),
  }
}

export function buildRecoveryFlow(
  session,
  durationPreferences = {},
) {
  const muscleKeys = musclesFromSession(session)
  const fallback = ['shoulders', 'back']
  const selected = muscleKeys.length ? muscleKeys : fallback
  const movementIds = []

  addMovementIds(movementIds, selected, 6)

  if (movementIds.length < 5) {
    addMovementIds(
      movementIds,
      ['thoracic', 'hips', 'general'],
      6,
    )
  }

  return {
    id: `recovery-${session?.id ?? 'current'}`,
    title: 'Recovery Flow',
    subtitle: session?.name
      ? `After ${session.name}`
      : 'Post-workout recovery',
    reason: session?.name
      ? `Built from the muscles you trained during ${session.name}.`
      : 'A balanced equipment-free recovery flow.',
    focusAreas: selected.map((value) =>
      value
        .replace('arms', 'arms & wrists')
        .replace(/\b\w/g, (character) => character.toUpperCase()),
    ),
    movements: movementIds
      .map((id) => cloneMovement(id, durationPreferences))
      .filter(Boolean),
  }
}

const withinDays = (value, days) => {
  const time = new Date(value).getTime()
  if (!Number.isFinite(time)) return false
  return Date.now() - time <= days * 86400000
}

export function calculateRecoveryIntelligence(state = {}) {
  const history = state.history ?? []
  const mobility = state.mobility?.completed ?? []

  const recentWorkouts = history.filter((session) =>
    withinDays(
      session.finishedAt ?? `${session.date}T12:00:00`,
      7,
    ),
  )

  const recentRecovery = mobility.filter(
    (entry) =>
      entry.title === 'Recovery Flow' &&
      withinDays(entry.completedAt, 7),
  )

  const recentResets = mobility.filter(
    (entry) =>
      entry.title === 'Daily Reset' &&
      withinDays(entry.completedAt, 7),
  )

  const recoveryOpportunity = Math.max(1, recentWorkouts.length)
  const recoveryRatio = Math.min(
    1,
    recentRecovery.length / recoveryOpportunity,
  )
  const resetContribution = Math.min(1, recentResets.length / 4)

  const score = Math.round(
    Math.min(
      100,
      35 +
        recoveryRatio * 45 +
        resetContribution * 20,
    ),
  )

  let status = 'Recovery needs attention'
  let tone = 'low'

  if (score >= 80) {
    status = 'Excellent training balance'
    tone = 'high'
  } else if (score >= 60) {
    status = 'Recovery is keeping pace'
    tone = 'medium'
  }

  const insight =
    recentWorkouts.length === 0
      ? 'Complete a workout to begin building your recovery profile.'
      : recentRecovery.length === 0
      ? `You trained ${recentWorkouts.length} time${
          recentWorkouts.length === 1 ? '' : 's'
        } this week without completing a Recovery Flow.`
      : `You completed ${recentRecovery.length} Recovery Flow${
          recentRecovery.length === 1 ? '' : 's'
        } after ${recentWorkouts.length} workout${
          recentWorkouts.length === 1 ? '' : 's'
        } this week.`

  return {
    score,
    status,
    tone,
    insight,
    workoutsThisWeek: recentWorkouts.length,
    recoveryFlowsThisWeek: recentRecovery.length,
    dailyResetsThisWeek: recentResets.length,
  }
}
