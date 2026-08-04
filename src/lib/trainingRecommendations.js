import {
  calculateReadiness,
  readinessTrendSnapshot,
} from './readiness'
import { calculateRecoveryIntelligence } from '../data/mobility'

export const TRAINING_RECOMMENDATIONS = {
  TRAIN_NORMAL: 'train-normal',
  REDUCE_INTENSITY: 'reduce-intensity',
  REDUCE_VOLUME: 'reduce-volume',
  CHANGE_FOCUS: 'change-focus',
  RECOVERY_DAY: 'recovery-day',
  CHECK_IN: 'check-in',
}

const DAY_MS = 86400000

const workoutFocus = (name = '') => {
  const value = name.toLowerCase()

  if (value.includes('leg') || value.includes('core')) {
    return 'lower'
  }

  if (
    value.includes('chest') ||
    value.includes('back') ||
    value.includes('arm') ||
    value.includes('shoulder')
  ) {
    return 'upper'
  }

  return 'full'
}

const recentSessions = (history = [], days = 3) =>
  history.filter((session) => {
    const value =
      session?.finishedAt ??
      (session?.date
        ? `${session.date}T12:00:00`
        : null)
    const time = new Date(value).getTime()

    return (
      Number.isFinite(time) &&
      Date.now() - time <= days * DAY_MS
    )
  })

const trainedFocusRecently = (history, focus) =>
  recentSessions(history, 2).some((session) => {
    const muscles = (session.sets ?? [])
      .map((set) => String(set.muscle ?? '').toLowerCase())
      .join(' ')

    if (focus === 'upper') {
      return /chest|back|lat|shoulder|delt|trap|bicep|tricep|forearm/.test(
        muscles,
      )
    }

    if (focus === 'lower') {
      return /quad|hamstring|glute|calf|leg/.test(muscles)
    }

    return false
  })

const chooseAlternateWorkout = (
  rotation = [],
  scheduledWorkout,
) => {
  const scheduledFocus = workoutFocus(scheduledWorkout)
  const preferredFocus =
    scheduledFocus === 'upper' ? 'lower' : 'upper'

  return (
    rotation.find(
      (workout) =>
        workout !== scheduledWorkout &&
        workoutFocus(workout) === preferredFocus,
    ) ??
    rotation.find((workout) => workout !== scheduledWorkout) ??
    scheduledWorkout
  )
}

const confidenceFromEvidence = (
  readiness,
  sevenDay,
  recovery,
  evidence,
) => {
  let confidence = 58

  if (readiness.completed) confidence += 14
  if (sevenDay.count >= 3) confidence += 10
  if (recovery.workoutsThisWeek > 0) confidence += 7
  confidence += Math.min(10, evidence.length * 2)

  return Math.min(96, confidence)
}

export const buildTrainingRecommendation = (
  state = {},
  scheduledWorkout,
) => {
  const readiness = calculateReadiness(state)
  const sevenDay = readinessTrendSnapshot(state, 7)
  const recovery = calculateRecoveryIntelligence(state)
  const workout =
    scheduledWorkout ||
    state.selectedWorkout ||
    state.program?.nextWorkout

  if (!readiness.completed) {
    return {
      id: TRAINING_RECOMMENDATIONS.CHECK_IN,
      tone: 'unknown',
      title: 'Complete readiness first',
      summary:
        'A quick check-in gives AVAREN enough context to recommend today’s training approach.',
      workout,
      alternateWorkout: null,
      confidence: 72,
      evidence: ['No readiness entry for today'],
      plan: [
        'Rate sleep, energy, soreness, and stress',
        'Review the updated recommendation',
      ],
      primaryAction: 'check-in',
      primaryLabel: 'Complete Check-In',
    }
  }

  const evidence = []
  const concerns = readiness.factors.filter(
    (factor) => factor.concern,
  )
  const supportive = readiness.factors.filter(
    (factor) => factor.supportive,
  )
  const scheduledFocus = workoutFocus(workout)
  const repeatedFocus = trainedFocusRecently(
    state.history ?? [],
    scheduledFocus,
  )

  concerns.forEach((factor) =>
    evidence.push(`${factor.label} ${factor.value}/5`),
  )

  if (sevenDay.average !== null) {
    evidence.push(`7-day readiness ${sevenDay.average}`)
  }

  if (repeatedFocus && scheduledFocus !== 'full') {
    evidence.push(
      `${scheduledFocus === 'upper' ? 'Upper' : 'Lower'} body trained recently`,
    )
  }

  if (recovery.recoveryFlowsThisWeek === 0 &&
      recovery.workoutsThisWeek >= 2) {
    evidence.push('Recovery Flow is behind training')
  }

  if (readiness.score < 45) {
    const recommendation = {
      id: TRAINING_RECOMMENDATIONS.RECOVERY_DAY,
      tone: 'low',
      title: 'Take a recovery-focused day',
      summary:
        'Today’s readiness supports mobility and recovery more than another demanding session.',
      workout,
      alternateWorkout: null,
      evidence,
      plan: [
        'Complete an equipment-free Recovery Flow',
        'Reschedule the planned workout',
        'Prioritize sleep, hydration, and normal meals',
      ],
      primaryAction: 'recovery',
      primaryLabel: 'Start Recovery Flow',
    }

    return {
      ...recommendation,
      confidence: confidenceFromEvidence(
        readiness,
        sevenDay,
        recovery,
        evidence,
      ),
    }
  }

  if (
    readiness.score < 58 ||
    concerns.some(
      (factor) =>
        factor.id === 'sleep' || factor.id === 'energy',
    )
  ) {
    const recommendation = {
      id: TRAINING_RECOMMENDATIONS.REDUCE_VOLUME,
      tone: 'moderate',
      title: 'Reduce today’s volume',
      summary:
        'Keep the planned movement patterns but perform less total work.',
      workout,
      alternateWorkout: null,
      evidence,
      plan: [
        'Remove one working set from each exercise',
        'Keep technique-focused compound work',
        'Stop 2–3 reps before failure',
        'Finish with a short Recovery Flow',
      ],
      primaryAction: 'apply',
      primaryLabel: 'Apply Reduced Volume',
    }

    return {
      ...recommendation,
      confidence: confidenceFromEvidence(
        readiness,
        sevenDay,
        recovery,
        evidence,
      ),
    }
  }

  if (
    repeatedFocus &&
    readiness.entry?.soreness >= 4
  ) {
    const alternateWorkout = chooseAlternateWorkout(
      state.program?.rotation ?? [],
      workout,
    )

    const recommendation = {
      id: TRAINING_RECOMMENDATIONS.CHANGE_FOCUS,
      tone: 'moderate',
      title: 'Change today’s training focus',
      summary:
        'Your scheduled muscle group was trained recently and soreness is elevated.',
      workout,
      alternateWorkout,
      evidence,
      plan: [
        `Consider ${alternateWorkout} instead`,
        'Keep the original workout available',
        'Use the warm-up to confirm the choice',
      ],
      primaryAction: 'alternate',
      primaryLabel: `Use ${alternateWorkout}`,
    }

    return {
      ...recommendation,
      confidence: confidenceFromEvidence(
        readiness,
        sevenDay,
        recovery,
        evidence,
      ),
    }
  }

  if (
    readiness.score < 72 ||
    readiness.entry?.stress >= 4
  ) {
    const recommendation = {
      id: TRAINING_RECOMMENDATIONS.REDUCE_INTENSITY,
      tone: 'medium',
      title: 'Train with controlled intensity',
      summary:
        'Follow the scheduled workout while keeping effort below maximal.',
      workout,
      alternateWorkout: null,
      evidence,
      plan: [
        'Use roughly 90% of normal working weight',
        'Stop 2–3 reps before failure',
        'Avoid forced reps and grinders',
      ],
      primaryAction: 'apply',
      primaryLabel: 'Use Controlled Intensity',
    }

    return {
      ...recommendation,
      confidence: confidenceFromEvidence(
        readiness,
        sevenDay,
        recovery,
        evidence,
      ),
    }
  }

  supportive.forEach((factor) =>
    evidence.push(`${factor.label} ${factor.value}/5`),
  )

  const recommendation = {
    id: TRAINING_RECOMMENDATIONS.TRAIN_NORMAL,
    tone: 'high',
    title:
      readiness.score >= 85
        ? 'Train normally — push if technique is sharp'
        : 'Train as planned',
    summary:
      'Readiness and recent recovery support the scheduled workout.',
    workout,
    alternateWorkout: null,
    evidence,
    plan: [
      'Follow the planned sets and exercises',
      'Progress load only when warm-ups feel strong',
      'Keep normal technique standards',
    ],
    primaryAction: 'apply',
    primaryLabel: 'Start Recommended Workout',
  }

  return {
    ...recommendation,
    confidence: confidenceFromEvidence(
      readiness,
      sevenDay,
      recovery,
      evidence,
    ),
  }
}

export const applyRecommendationToWorkout = (
  activeWorkout,
  recommendation,
) => {
  if (!activeWorkout || !recommendation) {
    return activeWorkout
  }

  const workout = structuredClone(activeWorkout)

  workout.recommendation = {
    id: recommendation.id,
    title: recommendation.title,
    summary: recommendation.summary,
    plan: recommendation.plan,
    appliedAt: new Date().toISOString(),
  }

  if (
    recommendation.id ===
    TRAINING_RECOMMENDATIONS.REDUCE_VOLUME
  ) {
    workout.exercises = workout.exercises.map((exercise) => {
      if ((exercise.sets ?? []).length <= 1) return exercise

      return {
        ...exercise,
        sets: exercise.sets
          .slice(0, -1)
          .map((set, index) => ({
            ...set,
            number: index + 1,
          })),
      }
    })
  }

  return workout
}
