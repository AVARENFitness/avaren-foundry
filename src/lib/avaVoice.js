const DAILY_STATE = {
  READY: 'ready',
  READY_WITH_ADJUSTMENT: 'ready-with-adjustment',
  MANAGE_LOAD: 'manage-load',
  RECOVERY_PRIORITY: 'recovery-priority',
  REST: 'rest',
  INSUFFICIENT_DATA: 'insufficient-data',
}

const ROBOTIC_PATTERNS = [
  /readiness\s+\d+/i,
  /metrics indicate/i,
  /optimal performance/i,
  /insufficient data/i,
  /execute\s/i,
  /\d+\s*vs\s*\d+/,
  /current context/i,
  /current data suggests/i,
  /training status detected/i,
  /based on your metrics/i,
  /\boptimal\b/i,
]

const HYPE_PATTERNS = [
  /crush your goals/i,
  /let's go!/i,
  /you've got this/i,
  /great job!/i,
]

export const extractFirstName = (userName = '') => {
  const trimmed = String(userName).trim()
  if (!trimmed) return null
  return trimmed.split(/\s+/)[0] || null
}

export const buildAvaGreeting = ({ firstName, now = new Date() } = {}) => {
  const hour = now.getHours()
  const period =
    hour < 12 ? 'Morning' : hour < 17 ? 'Good afternoon' : 'Good evening'

  if (firstName) return `${period}, ${firstName}.`
  return `${period}.`
}

const formatWorkoutName = (name) => {
  if (!name) return null
  return String(name).replace(/\s*\+\s*/g, ' & ')
}

export const phraseAvaHeadline = (dailyState, briefing = {}) => {
  switch (dailyState) {
    case DAILY_STATE.READY:
      return `You're in a good spot today.`
    case DAILY_STATE.READY_WITH_ADJUSTMENT:
      return `Train today — with a small adjustment.`
    case DAILY_STATE.MANAGE_LOAD:
      return `Keep today measured.`
    case DAILY_STATE.RECOVERY_PRIORITY:
      return `Recovery comes first today.`
    case DAILY_STATE.REST:
      return `Nothing you need to force today.`
    case DAILY_STATE.INSUFFICIENT_DATA:
      return `I'm still learning your patterns.`
    default:
      return `Here's where things stand today.`
  }
}

export const phraseAvaSummary = (briefing, { now = new Date() } = {}) => {
  const { dailyState, workout, recommendation } = briefing
  const workoutName = formatWorkoutName(workout?.displayName)
  const coachAssigned = workout?.coachAssigned
  const daysSinceLast =
    briefing.daysSinceLastWorkout ??
    briefing.focusFacts?.daysSinceLastWorkout ??
    null
  const primaryType = briefing.primaryAction?.type

  if (dailyState === DAILY_STATE.INSUFFICIENT_DATA) {
    return `A few more check-ins and workouts will give me a better read on what you need day to day.`
  }

  if (dailyState === DAILY_STATE.REST) {
    return `Recover, move lightly if it helps, and come back ready.`
  }

  if (dailyState === DAILY_STATE.RECOVERY_PRIORITY) {
    return `Mobility and lighter movement will serve you better today.`
  }

  if (primaryType === 'morning-movement') {
    return `Give yourself a few minutes to loosen up first.`
  }

  if (primaryType === 'recovery-flow' && dailyState !== DAILY_STATE.RECOVERY_PRIORITY) {
    return `A short recovery flow can help you prepare for today's training.`
  }

  if (primaryType === 'check-readiness' || primaryType === 'build-baseline') {
    return `Give AVA a little more context before today's session.`
  }

  if (primaryType === 'continue-workout') {
    return `Pick up where you left off.`
  }

  if (primaryType === 'start-workout' && workoutName) {
    if (coachAssigned) {
      return `Your coach has ${workoutName} lined up for today.`
    }
    if (dailyState === DAILY_STATE.MANAGE_LOAD) {
      return `Let's ease into this one today.`
    }
    if (dailyState === DAILY_STATE.READY_WITH_ADJUSTMENT) {
      return `A small tweak may feel better than pushing straight through.`
    }
    if (daysSinceLast !== null && daysSinceLast >= 4) {
      return `It's been a few days — good time to get momentum back.`
    }
    return `Start when you're ready.`
  }

  if (coachAssigned && workoutName) {
    return `Your coach has ${workoutName} lined up for today.`
  }

  if (daysSinceLast !== null && daysSinceLast >= 4) {
    return `It's been a few days. Let's get some momentum back${workoutName ? ` with ${workoutName}` : ''}.`
  }

  return recommendation?.summary
    ? String(recommendation.summary)
    : `I'll keep this simple until your next session is clear.`
}

export const phraseAvaWatchItem = (item = {}) => {
  switch (item.kind) {
    case 'readiness-trend':
      return {
        title: 'Energy looks a little lower',
        detail: 'Today feels softer than your recent baseline — worth respecting as you train.',
      }
    case 'training-gap':
      return {
        title: 'Momentum faded a bit',
        detail: `It's been a few days since your last session. A clean return today helps.`,
      }
    case 'recovery-flow':
      return {
        title: 'Recovery work is behind',
        detail: 'Give yourself a few minutes to loosen up before you train.',
      }
    case 'protein':
      return {
        title: 'Protein is lagging today',
        detail: item.detail || 'A solid protein meal would help close the gap.',
      }
    case 'frequency':
      return {
        title: 'Training has been frequent',
        detail: 'You have stacked several sessions lately — quality still matters more than volume.',
      }
    case 'concern-factor':
      return {
        title: item.title?.replace(/ needs attention/i, '') || 'Something to note',
        detail: 'Your check-in flagged this today — train with that in mind.',
      }
    default:
      return {
        title: item.title || 'Worth a look',
        detail: item.detail || '',
      }
  }
}

export const phraseAvaPrimaryAction = (action = {}, briefing = {}) => {
  if (!action?.type) return action

  const workoutName = formatWorkoutName(
    action.meta?.workoutName ?? briefing.workout?.displayName,
  )

  return {
    ...action,
    label:
      action.label ||
      (action.type === 'start-workout' && workoutName
        ? `Start ${workoutName}`
        : action.label),
    detail: null,
  }
}

export const phraseAvaSecondaryAction = (action = {}) => {
  if (!action?.type) return null
  return { ...action, detail: null }
}

export const containsRoboticVoice = (text = '') =>
  ROBOTIC_PATTERNS.some((pattern) => pattern.test(text))

export const containsHypeVoice = (text = '') =>
  HYPE_PATTERNS.some((pattern) => pattern.test(text))

export const collectAvaHomeCopy = (briefing = {}) =>
  [
    briefing.greeting,
    briefing.headline,
    briefing.summary,
    briefing.primaryAction?.detail,
    briefing.primaryAction?.label,
  ]
    .filter(Boolean)
    .join(' ')

export const phraseAvaCardMessage = (briefing, { now = new Date() } = {}) => {
  const workoutName = formatWorkoutName(briefing.workout?.displayName)
  const primaryType = briefing.primaryAction?.type
  const dailyState = briefing.dailyState
  const coachAssigned = briefing.workout?.coachAssigned
  const daysSinceLast =
    briefing.daysSinceLastWorkout ??
    briefing.focusFacts?.daysSinceLastWorkout ??
    null

  if (primaryType === 'start-workout' && workoutName) {
    return {
      headline: `${workoutName} is up.`,
      summary: phraseAvaSummary(briefing, { now }),
    }
  }

  if (primaryType === 'continue-workout' && workoutName) {
    return {
      headline: `${workoutName} is in progress.`,
      summary: `Pick up where you left off.`,
    }
  }

  if (primaryType === 'morning-movement') {
    return {
      headline: `Get your body moving.`,
      summary: phraseAvaSummary(briefing, { now }),
    }
  }

  if (primaryType === 'recovery-flow') {
    return {
      headline:
        dailyState === DAILY_STATE.RECOVERY_PRIORITY
          ? `Recovery comes first.`
          : `Loosen up before you train.`,
      summary: phraseAvaSummary(briefing, { now }),
    }
  }

  if (primaryType === 'check-readiness') {
    return {
      headline: `Complete today's readiness.`,
      summary: phraseAvaSummary(briefing, { now }),
    }
  }

  if (primaryType === 'open-weekly-checkin') {
    return {
      headline: `Complete your weekly check-in.`,
      summary: `Give your coach a quick read on how the week went.`,
    }
  }

  if (primaryType === 'build-baseline') {
    return {
      headline: `Let's build your baseline.`,
      summary: phraseAvaSummary(briefing, { now }),
    }
  }

  if (primaryType === 'rest') {
    return {
      headline: phraseAvaHeadline(dailyState, briefing),
      summary: phraseAvaSummary(briefing, { now }),
    }
  }

  if (coachAssigned && workoutName) {
    return {
      headline: `${workoutName} is on the plan today.`,
      summary: `Your coach has it lined up for today.`,
    }
  }

  return {
    headline: phraseAvaHeadline(dailyState, briefing),
    summary: phraseAvaSummary(briefing, { now }),
  }
}

export const applyAvaVoice = (briefing, { userName, now = new Date() } = {}) => {
  if (!briefing) return briefing

  const firstName = extractFirstName(userName)
  const voicedWatchItem = briefing.watchItem
    ? phraseAvaWatchItem(briefing.watchItem)
    : null

  const cardMessage = phraseAvaCardMessage(briefing, { now })

  return {
    ...briefing,
    greeting: buildAvaGreeting({ firstName, now }),
    headline: cardMessage.headline,
    summary: cardMessage.summary,
    primaryAction: phraseAvaPrimaryAction(briefing.primaryAction, briefing),
    secondaryAction: briefing.secondaryAction
      ? phraseAvaSecondaryAction(briefing.secondaryAction)
      : null,
    watchItem: voicedWatchItem,
    watch: voicedWatchItem ? [voicedWatchItem] : [],
    confidenceNote: briefing.confidenceNote
      ? `I'm still learning your patterns.`
      : null,
  }
}
