import { AVA_SESSION_MAX_TURNS } from './avaConversation'

const MAX_MESSAGE_LENGTH = 12
const MAX_CONSTRAINT_LENGTH = 4

/**
 * Client-side session payload for AVA chat (Patch 7.7.4).
 * Authoritative facts are resolved server-side — not sent from the browser.
 */
export const buildAvaModelConversation = (session = null) => {
  if (!session) {
    return {
      recentMessages: [],
      temporaryConstraints: [],
      userStatements: [],
      topic: null,
      lastRecommendation: null,
    }
  }

  const snapshot = typeof session.toJSON === 'function' ? session.toJSON() : session

  return {
    recentMessages: (snapshot.messages ?? [])
      .slice(-MAX_MESSAGE_LENGTH)
      .map((message) => ({
        role: message.role === 'user' ? 'user' : 'ava',
        text: String(message.text ?? '').slice(0, 1200),
      })),
    temporaryConstraints: (snapshot.userConstraints ?? [])
      .slice(-MAX_CONSTRAINT_LENGTH)
      .map((item) => String(item ?? '').slice(0, 400)),
    userStatements: (snapshot.userStatements ?? snapshot.userConstraints ?? [])
      .slice(-MAX_CONSTRAINT_LENGTH)
      .map((item) => String(item ?? '').slice(0, 400)),
    topic: snapshot.topic ?? null,
    lastRecommendation: snapshot.lastRecommendation
      ? String(snapshot.lastRecommendation).slice(0, 1200)
      : null,
  }
}

const daypart = (now = new Date()) => {
  const hour = now.getHours()
  if (hour < 12) return 'morning'
  if (hour < 17) return 'afternoon'
  return 'evening'
}

/**
 * Compact client request body — session + hints only.
 * Server builds trusted facts from Supabase under authenticated user RLS.
 */
export const buildAvaChatRequestBody = ({
  message = '',
  session = null,
  now = new Date(),
  packet = null,
}) => {
  const body = {
    message: String(message ?? '').trim().slice(0, 2000),
    sessionContext: buildAvaModelConversation(session),
    clientHints: {
      daypart: daypart(now),
      timezoneOffset: now.getTimezoneOffset(),
    },
    limits: {
      maxTurns: AVA_SESSION_MAX_TURNS,
    },
  }

  if (packet?.athlete?.firstName) {
    body.clientHints.displayFirstName = String(packet.athlete.firstName).slice(0, 40)
  }

  return body
}

/**
 * @deprecated Server resolves model context. Kept for deterministic fallback/tests.
 */
export const buildAvaModelContext = (packet = {}) => {
  if (!packet || typeof packet !== 'object') return null

  const exercises = (packet.workout?.exercises ?? [])
    .slice(0, 8)
    .map((item) => ({
      name: item.name ?? null,
      sets: item.sets ?? null,
      muscle: item.muscle ?? null,
    }))

  return {
    athlete: {
      firstName: packet.athlete?.firstName ?? null,
    },
    today: {
      canonicalWorkout: packet.facts?.canonicalWorkout ?? null,
      canonicalWorkoutFormatted:
        packet.facts?.canonicalWorkoutFormatted ??
        packet.workout?.formattedName ??
        null,
      workoutSource: packet.workout?.source ?? null,
      coachAssigned: Boolean(packet.workout?.coachAssigned),
      isRestDay: Boolean(packet.workout?.isRestDay),
      isActiveWorkout: Boolean(packet.workout?.isActive),
      activeWorkoutName: packet.workout?.activeName ?? null,
      exercises,
      readiness: packet.readiness?.completed
        ? {
            score: packet.readiness.score,
            status: packet.readiness.status,
            factors: packet.readiness.factors ?? [],
          }
        : { completed: false },
      recovery: {
        score: packet.recovery?.score ?? null,
        status: packet.recovery?.status ?? null,
        insight: packet.recovery?.insight ?? null,
        mobilityResetDone: Boolean(packet.recovery?.mobilityResetDone),
        recoveryFlowDone: Boolean(packet.recovery?.recoveryFlowDone),
      },
      briefing: {
        dailyState: packet.briefing?.dailyState ?? null,
        headline: packet.briefing?.headline ?? null,
        summary: packet.briefing?.summary ?? null,
        primaryAction: packet.briefing?.primaryAction?.label ?? null,
        watchItem: packet.briefing?.watchItem?.label ?? null,
        confidence: packet.briefing?.confidence ?? null,
        isLowData: Boolean(packet.briefing?.isLowData),
      },
      coachAssignment: packet.assignment
        ? {
            title: packet.assignment.title,
            workoutName: packet.assignment.workoutName,
            athleteNotes: packet.assignment.athleteNotes ?? null,
          }
        : null,
    },
    recentTraining: {
      recentSessionCount: packet.training?.recentSessionCount ?? 0,
      currentStreak: packet.training?.currentStreak ?? 0,
      daysSinceLastWorkout: packet.training?.daysSinceLastWorkout ?? null,
      lastSessionName: packet.training?.lastSessionName ?? null,
      lastSessionDate: packet.training?.lastSessionDate ?? null,
    },
    nutrition: {
      hasLoggedFood: Boolean(packet.nutrition?.hasLoggedFood),
      calories: packet.nutrition?.hasLoggedFood
        ? packet.nutrition?.calories ?? null
        : null,
      calorieGoal: packet.nutrition?.calorieGoal ?? null,
      protein: packet.nutrition?.hasLoggedFood
        ? packet.nutrition?.protein ?? null
        : null,
      proteinGoal: packet.nutrition?.proteinGoal ?? null,
      proteinProgress: packet.nutrition?.proteinProgress ?? null,
    },
    performance: packet.performance ?? null,
    daypart: packet.daypart ?? null,
  }
}
