import { AVA_DAILY_STATES } from './avaIntelligence'
import { formatWorkoutName, lastSessionForMuscle } from './avaContext'
import {
  isSessionConstraintStatement,
  isStateStatement,
} from './avaConversationalRouter'

export const AVA_SESSION_MAX_TURNS = 8

export const AVA_CONVERSATION_ACTIONS = {
  START_WORKOUT: 'start-workout',
  CONTINUE_WORKOUT: 'continue-workout',
  OPEN_READINESS: 'open-readiness',
  START_RECOVERY: 'start-recovery',
  OPEN_NUTRITION: 'open-nutrition',
  OPEN_PROGRESS: 'open-progress',
  VIEW_ASSIGNMENT: 'view-assignment',
}

const normalize = (value = '') =>
  String(value).trim().toLowerCase().replace(/\s+/g, ' ')

const referentWorkout = (packet, session) => {
  const fromSession = session?.topic?.workoutName
  if (fromSession) return formatWorkoutName(fromSession)

  return (
    packet.workout?.formattedName ??
    formatWorkoutName(packet.workout?.displayName) ??
    null
  )
}

const isAffirmativeTrainingPush = (text) =>
  /another hard|one more workout|train again|push through|max out|go hard again|hard session tonight|second workout/.test(
    text,
  )

const isLightenRequest = (text) =>
  /lighter|light day|half|ease up|take it easy|dial back|reduce volume|less volume|not full/.test(
    text,
  )

const isReferentFollowUp = (text) =>
  /^(why|why\?)$/.test(text) ||
  /\b(it|this|that)\b/.test(text) ||
  /should i still|still do|do the full|keep it|can i/.test(text)

const buildAction = (id, label, meta = {}) => ({
  id,
  label,
  meta,
})

export class AvaSessionMemory {
  constructor(maxTurns = AVA_SESSION_MAX_TURNS) {
    this.maxTurns = maxTurns
    this.messages = []
    this.topic = null
    this.lastRecommendation = null
    this.userConstraints = []
    this.pendingAction = null
    this.lastReversibleAction = null
  }

  add(role, text, meta = {}) {
    this.messages.push({
      id: `${Date.now()}-${this.messages.length}`,
      role,
      text: String(text ?? '').trim(),
      at: new Date().toISOString(),
      meta,
    })

    const maxMessages = this.maxTurns * 2
    if (this.messages.length > maxMessages) {
      this.messages = this.messages.slice(-maxMessages)
    }
  }

  setTopic(topic) {
    this.topic = topic
  }

  setRecommendation(text) {
    this.lastRecommendation = String(text ?? '').trim() || null
  }

  addConstraint(text) {
    const value = String(text ?? '').trim()
    if (!value) return
    this.userConstraints = [...this.userConstraints, value].slice(-4)
  }

  getRecentUserMessages(limit = 3) {
    return this.messages
      .filter((message) => message.role === 'user')
      .slice(-limit)
      .map((message) => message.text)
  }

  toJSON() {
    return {
      messages: this.messages,
      topic: this.topic,
      lastRecommendation: this.lastRecommendation,
      userConstraints: this.userConstraints,
      pendingAction: this.pendingAction,
      lastReversibleAction: this.lastReversibleAction,
    }
  }
}

export const createAvaSession = () => new AvaSessionMemory()

export const buildAvaOpeningMessage = (packet = {}) => {
  const workout =
    packet.workout?.formattedName ??
    formatWorkoutName(packet.workout?.displayName)

  if (packet.briefing?.isLowData) {
    return "You're still building your baseline. I can help you decide what to do next."
  }

  if (packet.workout?.isActive && packet.workout?.activeName) {
    return `${formatWorkoutName(packet.workout.activeName)} is in progress. What are you thinking?`
  }

  if (packet.briefing?.dailyState === AVA_DAILY_STATES.REST) {
    return "It's a rest day on your plan. What do you want to figure out?"
  }

  if (packet.briefing?.dailyState === AVA_DAILY_STATES.RECOVERY_PRIORITY) {
    return 'Recovery looks like the better move today. What are you weighing?'
  }

  if (workout) {
    const daypartPhrase =
      packet.daypart === 'evening'
        ? ' tonight'
        : packet.daypart === 'morning'
          ? ' this morning'
          : ''
    return `${workout} is up${daypartPhrase}. What are you thinking?`
  }

  return 'What do you want to sort out today?'
}

export const buildAvaSuggestedPrompts = (packet = {}) => {
  const workout =
    packet.workout?.formattedName ??
    formatWorkoutName(packet.workout?.displayName)

  if (packet.briefing?.isLowData) {
    return [
      'What should I do first?',
      'How do I build my baseline?',
      'What does AVA need from me?',
    ]
  }

  if (packet.workout?.coachAssigned && workout) {
    return [
      'What did my coach assign?',
      'Should I change anything today?',
      `Why ${workout}?`,
    ]
  }

  if (packet.briefing?.dailyState === AVA_DAILY_STATES.RECOVERY_PRIORITY) {
    return [
      'Should I take it easier today?',
      'What recovery should I do?',
      'Why is my readiness lower?',
    ]
  }

  if (workout) {
    return [
      'Should I train as planned?',
      'What should I focus on today?',
      workout ? `Why ${workout}?` : 'Why this workout?',
    ]
  }

  return [
    'What should I focus on today?',
    'How am I looking today?',
    'What should I do next?',
  ]
}

const buildWhyAnswer = (packet) => {
  const workout = referentWorkout(packet)
  const lines = []

  if (packet.briefing?.summary) {
    lines.push(packet.briefing.summary)
  }

  if (packet.readiness?.completed && packet.readiness.score !== null) {
    lines.push(
      `Your readiness check-in today is ${packet.readiness.score} — ${packet.readiness.status?.toLowerCase() ?? 'logged'}.`,
    )
  } else {
    lines.push("I don't have today's readiness check-in yet.")
  }

  if (packet.workout?.coachAssigned && workout) {
    lines.push(`Your coach assigned ${workout} for today.`)
  } else if (workout) {
    lines.push(`${workout} is today's canonical workout on your plan.`)
  }

  if (packet.briefing?.watchItem?.detail) {
    lines.push(packet.briefing.watchItem.detail)
  }

  return lines.join(' ')
}

const buildWorkoutAnswer = (packet, session, text) => {
  const workout = referentWorkout(packet, session)
  const exercises = packet.workout?.exercises ?? []

  if (/what am i training|training today|workout today|what's today|whats today/.test(text)) {
    if (!workout) {
      return {
        summary:
          "Nothing is queued as today's workout right now. You can review your schedule and pick the next session that fits.",
        actions: [buildAction(AVA_CONVERSATION_ACTIONS.OPEN_PROGRESS, 'View schedule')],
      }
    }

    return {
      summary: packet.workout?.coachAssigned
        ? `You're on ${workout} today — that's the session your coach assigned.`
        : `${workout} is today's workout.`,
      actions: workout
        ? [
            buildAction(AVA_CONVERSATION_ACTIONS.START_WORKOUT, `Start ${workout}`, {
              workoutName: packet.workout.displayName,
            }),
          ]
        : [],
    }
  }

  if (/coach assign|my coach|did my coach/.test(text)) {
    if (packet.workout?.coachAssigned && workout) {
      return {
        summary: `Yes — ${workout} is coach-assigned for today. I'd follow the plan and adjust effort if needed, not rewrite the session on your own.`,
        actions: [
          buildAction(AVA_CONVERSATION_ACTIONS.VIEW_ASSIGNMENT, 'View assignment'),
          buildAction(AVA_CONVERSATION_ACTIONS.START_WORKOUT, `Start ${workout}`, {
            workoutName: packet.workout.displayName,
          }),
        ],
      }
    }

    return {
      summary:
        "Today's workout isn't coming from an active coach assignment in what I can see.",
    }
  }

  if (/what('s| is) first|first exercise|what comes first/.test(text)) {
    if (!exercises.length) {
      return {
        summary: workout
          ? `I have ${workout} as today's workout, but I don't have the exercise list loaded yet.`
          : "I don't have a workout exercise list to reference right now.",
      }
    }

    const first = exercises[0]?.name ?? 'the first movement'
    return {
      summary: `${first} is first in ${workout ?? 'today\'s session'}. Start there and let the first couple sets tell you how the day is going.`,
    }
  }

  if (isReferentFollowUp(text) || /should i still|still do|do the full workout/.test(text)) {
    if (!workout) {
      return {
        summary:
          "I'm not sure which session you mean yet. Tell me the workout name if you want a specific call.",
      }
    }

    if (packet.briefing?.dailyState === AVA_DAILY_STATES.RECOVERY_PRIORITY) {
      return {
        summary: `I wouldn't push ${workout} hard today. Keep it lighter or shift toward recovery instead.`,
        actions: [
          buildAction(AVA_CONVERSATION_ACTIONS.START_RECOVERY, 'Start Recovery Flow'),
        ],
      }
    }

    if (packet.briefing?.dailyState === AVA_DAILY_STATES.MANAGE_LOAD) {
      return {
        summary: `You can still do ${workout}, but I'd keep the first couple working sets conservative and see how you settle in.`,
        actions: [
          buildAction(AVA_CONVERSATION_ACTIONS.START_WORKOUT, `Start ${workout}`, {
            workoutName: packet.workout.displayName,
          }),
        ],
      }
    }

    if (isLightenRequest(text) || /half|lighter/.test(text)) {
      return {
        summary: `Yes — you can keep ${workout} but trim volume or effort. Stay with the plan's intent without forcing the full push.`,
        actions: [
          buildAction(AVA_CONVERSATION_ACTIONS.START_WORKOUT, `Start ${workout}`, {
            workoutName: packet.workout.displayName,
          }),
        ],
      }
    }

    return {
      summary: `Yes — ${workout} is still the session I'd use today. Start when you're ready and adjust if something feels off early.`,
      actions: [
        buildAction(AVA_CONVERSATION_ACTIONS.START_WORKOUT, `Start ${workout}`, {
          workoutName: packet.workout.displayName,
        }),
      ],
    }
  }

  if (/why/.test(text) && workout) {
    return { summary: buildWhyAnswer(packet) }
  }

  return null
}

const buildReadinessAnswer = (packet, text) => {
  if (/recovery instead|recovery flow|mobility instead/.test(text)) {
    if (packet.briefing?.dailyState === AVA_DAILY_STATES.RECOVERY_PRIORITY) {
      return {
        summary:
          'Recovery is the better call today. A Recovery Flow or lighter movement will serve you better than forcing training volume.',
        actions: [
          buildAction(AVA_CONVERSATION_ACTIONS.START_RECOVERY, 'Start Recovery Flow'),
        ],
      }
    }

    return {
      summary:
        "Recovery work could help, but I don't see a strong reason to skip today's workout entirely. A short flow before training may be enough.",
      actions: [
        buildAction(AVA_CONVERSATION_ACTIONS.START_RECOVERY, 'Start Recovery Flow'),
      ],
    }
  }

  if (/before training|before i train|before workout/.test(text)) {
    if (!packet.readiness?.completed) {
      return {
        summary:
          "Start with a readiness check-in if you haven't logged one yet. After that, a short mobility or recovery flow can help if you feel tight.",
        actions: [
          buildAction(AVA_CONVERSATION_ACTIONS.OPEN_READINESS, 'Check Readiness'),
        ],
      }
    }

    if (!packet.recovery?.recoveryFlowDone) {
      return {
        summary:
          'A short recovery flow before training is reasonable today — especially if you feel stiff or the week has stacked up.',
        actions: [
          buildAction(AVA_CONVERSATION_ACTIONS.START_RECOVERY, 'Start Recovery Flow'),
        ],
      }
    }

    return {
      summary:
        "You're already in decent shape on prep work today. Warm up well and let the first working sets guide effort.",
    }
  }

  if (/how am i looking|how am i today|ready today|readiness/.test(text)) {
    if (!packet.readiness?.completed) {
      return {
        summary:
          "I don't have enough from today's check-in to call that confidently. Log readiness first and I can give you a sharper read.",
        actions: [
          buildAction(AVA_CONVERSATION_ACTIONS.OPEN_READINESS, 'Check Readiness'),
        ],
      }
    }

    const concern = packet.readiness.factors?.find((factor) => factor.concern)
    if (packet.briefing?.dailyState === AVA_DAILY_STATES.RECOVERY_PRIORITY) {
      return {
        summary: concern
          ? `You're not fully ready for a hard push today — ${concern.label.toLowerCase()} stood out in your check-in. I'd favor recovery.`
          : "You're not in a great spot for a hard push today. I'd favor recovery over forcing volume.",
        actions: [
          buildAction(AVA_CONVERSATION_ACTIONS.START_RECOVERY, 'Start Recovery Flow'),
        ],
      }
    }

    return {
      summary: concern
        ? `You're workable today, but ${concern.label.toLowerCase()} is worth respecting as you train.`
        : `You're in a workable spot today. ${packet.briefing?.summary ?? 'Train with intention and adjust if needed.'}`,
    }
  }

  if (/take it easy|go easy|should i rest/.test(text)) {
    if (
      packet.briefing?.dailyState === AVA_DAILY_STATES.RECOVERY_PRIORITY ||
      packet.briefing?.dailyState === AVA_DAILY_STATES.MANAGE_LOAD
    ) {
      return {
        summary:
          "Yes — I'd keep today controlled. You can still move, but this isn't the day to chase a big push.",
      }
    }

    return {
      summary:
        "You don't need to sandbag the whole session, but there's no reason to force extra intensity today.",
    }
  }

  return null
}

const buildTrainingHistoryAnswer = (packet, text, history = []) => {
  if (/consistent|getting back on track|back on track/.test(text)) {
    if (packet.training?.recentSessionCount >= 3) {
      return {
        summary: `You've logged ${packet.training.recentSessionCount} sessions in the last week — that's a solid rhythm.`,
      }
    }

    if (packet.training?.daysSinceLastWorkout >= 4) {
      return {
        summary:
          "It's been a few days since your last session. One clean workout today would help momentum more than overthinking it.",
        actions: packet.workout?.displayName
          ? [
              buildAction(
                AVA_CONVERSATION_ACTIONS.START_WORKOUT,
                `Start ${referentWorkout(packet)}`,
                { workoutName: packet.workout.displayName },
              ),
            ]
          : [],
      }
    }

    return {
      summary:
        'You have some recent training logged, but the pattern is still taking shape. One consistent week will tell us more.',
    }
  }

  if (/how many.*train|trained recently|sessions this week/.test(text)) {
    return {
      summary: `You have ${packet.training?.recentSessionCount ?? 0} logged session${packet.training?.recentSessionCount === 1 ? '' : 's'} in the last 7 days.`,
    }
  }

  const muscleMatch = text.match(/last train(?:ed)?\s+(chest|back|legs|shoulders|arms|quads|hamstrings|glutes|upper|lower)/)
  if (muscleMatch) {
    const session = lastSessionForMuscle(history, muscleMatch[1])
    if (!session) {
      return {
        summary: `I don't see a recent logged session with clear ${muscleMatch[1]} work in your history.`,
      }
    }

    return {
      summary: `Your last logged ${muscleMatch[1]}-related session was ${session.name} on ${String(session.date ?? session.finishedAt ?? '').slice(0, 10)}.`,
    }
  }

  return null
}

const buildProgressAnswer = (packet, text) => {
  if (
    !/\b(stronger|progress|personal record|1rm|one rep max|pr)\b/.test(text)
  ) {
    return null
  }

  const exerciseMatch = text.match(/\b(squat|bench|deadlift|press|row|curl)\b/)
  if (exerciseMatch) {
    return {
      summary:
        "I don't have a clean recent trend loaded for that lift in this quick read. Open Progress for the full history.",
      actions: [buildAction(AVA_CONVERSATION_ACTIONS.OPEN_PROGRESS, 'View Progress')],
    }
  }

  if (packet.performance?.exercise) {
    return {
      summary: `Recent progress worth noting: ${packet.performance.exercise} — ${packet.performance.type} at ${packet.performance.value}.`,
      actions: [buildAction(AVA_CONVERSATION_ACTIONS.OPEN_PROGRESS, 'View Progress')],
    }
  }

  return {
    summary:
      "I don't have a strong recent performance signal to point to right now. Keep logging quality sessions and PRs will show up in Progress.",
    actions: [buildAction(AVA_CONVERSATION_ACTIONS.OPEN_PROGRESS, 'View Progress')],
  }
}

const buildNutritionAnswer = (packet, text) => {
  if (!/protein|nutrition|eat more|calorie|food/.test(text)) {
    return null
  }

  if (!packet.nutrition?.hasLoggedFood) {
    return {
      summary:
        "I don't have enough logged today to give you a useful nutrition read.",
      actions: [
        buildAction(AVA_CONVERSATION_ACTIONS.OPEN_NUTRITION, 'Open Nutrition'),
      ],
    }
  }

  if (/protein/.test(text)) {
    const { protein, proteinGoal, proteinProgress } = packet.nutrition
    if (proteinGoal > 0 && protein < proteinGoal * 0.6) {
      return {
        summary: `You're at ${protein}g of ${proteinGoal}g protein today — still room to close the gap.`,
        actions: [
          buildAction(AVA_CONVERSATION_ACTIONS.OPEN_NUTRITION, 'Open Nutrition'),
        ],
      }
    }

    return {
      summary: `You're at ${protein}g protein today${proteinGoal ? ` against a ${proteinGoal}g target` : ''}.`,
      actions: [
        buildAction(AVA_CONVERSATION_ACTIONS.OPEN_NUTRITION, 'Open Nutrition'),
      ],
    }
  }

  return {
    summary: `You've logged ${packet.nutrition.calories} calories today${packet.nutrition.calorieGoal ? ` against a ${packet.nutrition.calorieGoal} target` : ''}.`,
    actions: [
      buildAction(AVA_CONVERSATION_ACTIONS.OPEN_NUTRITION, 'Open Nutrition'),
    ],
  }
}

const buildStateStatementAnswer = (packet, session, text) => {
  if (!isStateStatement(text)) return null

  session.addConstraint(text)

  const workout = referentWorkout(packet, session)
  const tired =
    /tired|exhausted|run down|flat|low energy|drained|beat up|worn out|not feeling it|no energy/.test(
      text,
    )
  const sore = /sore|heavy legs|legs feel heavy/.test(text)
  const hungry = /hungry/.test(text)
  const positive = /pretty good|feeling good|feeling great|\bgood\b|\bgreat\b/.test(
    text,
  )

  if (packet.workout?.displayName) {
    session.setTopic({
      type: 'workout',
      workoutName: packet.workout.displayName,
      athleteState: text,
    })
  }

  if (positive && !tired && !sore) {
    return {
      summary: workout
        ? `Good to hear. ${workout} is still the plan — train with intent and adjust if the first sets feel off.`
        : 'Good to hear. Train with intent today and adjust if the first sets tell you to.',
      actions: workout
        ? [
            buildAction(AVA_CONVERSATION_ACTIONS.START_WORKOUT, `Start ${workout}`, {
              workoutName: packet.workout.displayName,
            }),
          ]
        : [],
    }
  }

  if (hungry && tired && !isExplicitFoodRequest(text)) {
    return {
      summary:
        "Got you — tired and hungry is a real combo. I'd eat first and keep training conservative if you still want to move.",
      actions: [
        buildAction(AVA_CONVERSATION_ACTIONS.OPEN_NUTRITION, 'Open Nutrition'),
        ...(workout
          ? [
              buildAction(
                AVA_CONVERSATION_ACTIONS.START_WORKOUT,
                `Start ${workout} lighter`,
                { workoutName: packet.workout.displayName },
              ),
            ]
          : []),
      ],
    }
  }

  if (hungry && !isExplicitFoodRequest(text)) {
    return {
      summary: workout
        ? `Got you. If you're hungry before ${workout}, eat something light with protein first and see how you feel — I won't log food unless you tell me what you had.`
        : "Got you. If you're hungry, I'd eat something with protein first. Tell me what you had if you want it logged.",
      actions: [
        buildAction(AVA_CONVERSATION_ACTIONS.OPEN_NUTRITION, 'Open Nutrition'),
      ],
    }
  }

  if (
    packet.briefing?.dailyState === AVA_DAILY_STATES.RECOVERY_PRIORITY ||
    packet.briefing?.dailyState === AVA_DAILY_STATES.MANAGE_LOAD
  ) {
    return {
      summary: workout
        ? `Got you. I'd leave ${workout} alone tonight unless you truly want easy movement — recovery is the better move.`
        : "Got you. I'd leave the hard session alone tonight — recovery is the better move.",
      actions: [
        buildAction(AVA_CONVERSATION_ACTIONS.START_RECOVERY, 'Start Recovery Flow'),
      ],
    }
  }

  if (tired || sore) {
    if (!packet.readiness?.completed) {
      return {
        summary:
          "Got you. I don't have enough from today's check-in to call it confidently. Want to do a quick readiness check first?",
        actions: [
          buildAction(AVA_CONVERSATION_ACTIONS.OPEN_READINESS, 'Open Readiness'),
        ],
      }
    }

    return {
      summary: workout
        ? `Got you. You can still train, but I wouldn't force the pace on ${workout}. Want to keep it lighter?`
        : "Got you. You can still move today, but I'd keep effort conservative and see how you settle in.",
      actions: workout
        ? [
            buildAction(AVA_CONVERSATION_ACTIONS.START_WORKOUT, `Start ${workout}`, {
              workoutName: packet.workout.displayName,
            }),
            buildAction(AVA_CONVERSATION_ACTIONS.OPEN_READINESS, 'Open Readiness'),
          ]
        : [
            buildAction(AVA_CONVERSATION_ACTIONS.OPEN_READINESS, 'Open Readiness'),
          ],
    }
  }

  return {
    summary:
      "Got you. Tell me what you're weighing and I'll help you sort out the next move.",
  }
}

const isExplicitFoodRequest = (text) =>
  /^(i|we)\s+(had|ate|eat|eaten)\b|^(log|add|track)\b/.test(text)

const buildTimeConstraintAnswer = (packet, session, text) => {
  const match = text.match(/\bonly have (\d+) minutes\b/)
  if (!match) return null

  session.addConstraint(text)
  const workout = referentWorkout(packet, session)
  const minutes = match[1]
  const exercises = packet.workout?.exercises ?? []

  if (packet.workout?.displayName) {
    session.setTopic({
      type: 'workout',
      workoutName: packet.workout.displayName,
      timeConstraintMinutes: Number(minutes),
    })
  }

  if (workout && exercises.length) {
    const mainNames = exercises
      .slice(0, 3)
      .map((item) => item.name)
      .filter(Boolean)
      .join(', ')
    return {
      summary: `That's enough to get useful work in. I'd keep ${workout} focused on ${mainNames} and trim the lower-priority work.`,
      actions: [
        buildAction(AVA_CONVERSATION_ACTIONS.START_WORKOUT, `Start ${workout}`, {
          workoutName: packet.workout.displayName,
        }),
      ],
    }
  }

  if (workout) {
    return {
      summary: `That's enough to get useful work in. I'd keep ${workout} focused on the main movements and trim the lower-priority work.`,
      actions: [
        buildAction(AVA_CONVERSATION_ACTIONS.START_WORKOUT, `Start ${workout}`, {
          workoutName: packet.workout.displayName,
        }),
      ],
    }
  }

  return {
    summary:
      "I can help you shorten the session, but I don't have the full exercise list here.",
  }
}

const buildSorenessAnswer = (packet, session, text) => {
  if (
    !/soreness|sore in|sore.*delt|front delt|shoulder.*sore|my .* feels sore|having some soreness|hurting|hurt|pain|discomfort|aches?/.test(
      text,
    )
  ) {
    return null
  }

  if (/^(log|add|track)\b/.test(text)) return null

  session.addConstraint(text)
  const workout = referentWorkout(packet, session)

  if (packet.workout?.displayName) {
    session.setTopic({
      type: 'workout',
      workoutName: packet.workout.displayName,
      sorenessNote: text,
    })
  }

  if (workout) {
    return {
      summary: `Got you. If that discomfort is showing up during ${workout}, I wouldn't ignore it. Pay attention during your warm-up and don't force movements that aggravate it.`,
      actions: [
        buildAction(AVA_CONVERSATION_ACTIONS.OPEN_READINESS, 'Open Readiness'),
        buildAction(AVA_CONVERSATION_ACTIONS.START_RECOVERY, 'Start Recovery Flow'),
      ],
    }
  }

  return {
    summary:
      "Got you. I'd keep training conservative today and stop if anything sharp or worsening shows up.",
    actions: [
      buildAction(AVA_CONVERSATION_ACTIONS.START_RECOVERY, 'Start Recovery Flow'),
    ],
  }
}

const buildConstraintFollowUp = (packet, session) => {
  const recent = session.getRecentUserMessages(3)
  const latest = normalize(recent.at(-1) ?? '')
  const previous = normalize(recent.at(-2) ?? '')
  const earlier = normalize(recent.at(-3) ?? '')
  const constraints = session.userConstraints.join(' ').toLowerCase()

  if (
    /tired|exhausted|sore|run down|flat|beat up|worn out|not feeling it/.test(
      `${previous} ${earlier}`,
    ) &&
    /what about the workout|about the workout|still do it|should i still/.test(latest)
  ) {
    const workout = referentWorkout(packet, session)
    if (
      packet.briefing?.dailyState === AVA_DAILY_STATES.RECOVERY_PRIORITY ||
      packet.briefing?.dailyState === AVA_DAILY_STATES.MANAGE_LOAD
    ) {
      return {
        summary: workout
          ? `With how you're feeling, I'd trim ${workout} hard or skip it — recovery matters more tonight.`
          : "With how you're feeling, I'd skip forcing a hard session tonight.",
        actions: [
          buildAction(AVA_CONVERSATION_ACTIONS.START_RECOVERY, 'Start Recovery Flow'),
        ],
      }
    }

    return {
      summary: workout
        ? `${workout} can still work — keep the first couple working sets conservative and cut volume if you need to.`
        : "You can still train — keep the first couple working sets conservative and cut volume if you need to.",
      actions: workout
        ? [
            buildAction(AVA_CONVERSATION_ACTIONS.START_WORKOUT, `Start ${workout}`, {
              workoutName: packet.workout.displayName,
            }),
          ]
        : [],
    }
  }

  if (
    /tired|exhausted|sore|run down|flat|beat up|worn out|not feeling it|soreness|front delt/.test(
      constraints,
    ) &&
    /only have \d+ minutes/.test(constraints) &&
    /what would you do|what should i do/.test(latest)
  ) {
    const workout = referentWorkout(packet, session)
    const minutes = constraints.match(/only have (\d+) minutes/)?.[1] ?? '30'
    return {
      summary: workout
        ? `I'd still do ${workout}, but trimmed hard — main movements only, conservative effort, and stop near ${minutes} minutes.`
        : `I'd keep it trimmed — main movements only, conservative effort, and stop near ${minutes} minutes.`,
      actions: workout
        ? [
            buildAction(AVA_CONVERSATION_ACTIONS.START_WORKOUT, `Start ${workout}`, {
              workoutName: packet.workout.displayName,
            }),
          ]
        : [],
    }
  }

  if (/only have \d+ minutes/.test(constraints) && /what should i do/.test(latest)) {
    const workout = referentWorkout(packet, session)
    const minutes = constraints.match(/only have (\d+) minutes/)?.[1] ?? '30'
    return {
      summary: workout
        ? `With ${minutes} minutes, hit the essentials in ${workout} and skip the extras.`
        : `With ${minutes} minutes, hit the essentials and skip the extras.`,
      actions: workout
        ? [
            buildAction(AVA_CONVERSATION_ACTIONS.START_WORKOUT, `Start ${workout}`, {
              workoutName: packet.workout.displayName,
            }),
          ]
        : [],
    }
  }

  if (/tired|exhausted|beat up| sore/.test(previous) && /what should i change|what should i do|what now/.test(latest)) {
    if (packet.briefing?.dailyState === AVA_DAILY_STATES.RECOVERY_PRIORITY) {
      return {
        summary:
          "I'd leave the hard work alone today. Recovery, food, and sleep will move the needle more than another session.",
        actions: [
          buildAction(AVA_CONVERSATION_ACTIONS.START_RECOVERY, 'Start Recovery Flow'),
        ],
      }
    }

    const workout = referentWorkout(packet, session)
    return {
      summary: workout
        ? `Keep ${workout} if you still want to move, but cut volume and stay conservative on effort.`
        : "Keep it lighter today — fewer hard sets, more rest, and stop while you're ahead.",
    }
  }

  if (/can i just do half|just do half|half workout/.test(latest)) {
    const workout = referentWorkout(packet, session)
    return {
      summary: workout
        ? `Yes — doing half of ${workout} with good intent beats forcing the full session.`
        : 'Yes — a trimmed session still counts if you keep the quality high.',
    }
  }

  return null
}

export const respondToAvaMessage = ({
  message = '',
  packet = {},
  session = createAvaSession(),
  history = [],
  intent = 'message',
} = {}) => {
  const text = normalize(message)
  if (!text) {
    return {
      ok: true,
      source: 'deterministic',
      intent,
      summary: 'Ask me about today\'s workout, readiness, recovery, or nutrition.',
      suggestions: buildAvaSuggestedPrompts(packet),
      actions: [],
      data: {},
    }
  }

  try {
    session.add('user', message)

    if (isSessionConstraintStatement(text)) {
      session.addConstraint(message)
    }

    if (isAffirmativeTrainingPush(text)) {
      if (
        packet.briefing?.dailyState === AVA_DAILY_STATES.RECOVERY_PRIORITY ||
        packet.briefing?.dailyState === AVA_DAILY_STATES.MANAGE_LOAD
      ) {
        const summary =
          "I wouldn't chase another hard session tonight. Recovery is the better move based on what you've logged."
        session.setRecommendation(summary)
        session.addConstraint(text)
        return {
          ok: true,
          source: 'deterministic',
          intent: 'workout',
          summary,
          actions: [
            buildAction(AVA_CONVERSATION_ACTIONS.START_RECOVERY, 'Start Recovery Flow'),
          ],
          data: { disagreement: true },
        }
      }
    }

    const followUp = buildConstraintFollowUp(packet, session)
    if (followUp) {
      session.setRecommendation(followUp.summary)
      return {
        ok: true,
        source: 'deterministic',
        intent: 'message',
        ...followUp,
        suggestions: [],
        data: { followUp: true },
      }
    }

    if (/^why\??$/.test(text)) {
      const summary = buildWhyAnswer(packet)
      session.setRecommendation(summary)
      return {
        ok: true,
        source: 'deterministic',
        intent: 'message',
        summary,
        suggestions: [],
        actions: [],
        data: { referent: referentWorkout(packet, session) },
      }
    }

    const timeConstraintAnswer = buildTimeConstraintAnswer(packet, session, text)
    if (timeConstraintAnswer) {
      session.setRecommendation(timeConstraintAnswer.summary)
      return {
        ok: true,
        source: 'deterministic',
        intent: 'constraint',
        suggestions: [],
        data: { timeConstraint: true, referent: referentWorkout(packet, session) },
        ...timeConstraintAnswer,
      }
    }

    const sorenessAnswer = buildSorenessAnswer(packet, session, text)
    if (sorenessAnswer) {
      session.setRecommendation(sorenessAnswer.summary)
      return {
        ok: true,
        source: 'deterministic',
        intent: 'recovery',
        suggestions: [],
        data: { soreness: true, referent: referentWorkout(packet, session) },
        ...sorenessAnswer,
      }
    }

    const stateAnswer = buildStateStatementAnswer(packet, session, text)
    if (stateAnswer) {
      session.setRecommendation(stateAnswer.summary)
      return {
        ok: true,
        source: 'deterministic',
        intent: 'recovery',
        suggestions: [],
        data: { subjective: true, referent: referentWorkout(packet, session) },
        ...stateAnswer,
      }
    }

    const handlers = [
      () => buildWorkoutAnswer(packet, session, text),
      () => buildReadinessAnswer(packet, text),
      () => buildTrainingHistoryAnswer(packet, text, history),
      () => buildProgressAnswer(packet, text),
      () => buildNutritionAnswer(packet, text),
    ]

    for (const handler of handlers) {
      const result = handler()
      if (result) {
        if (packet.workout?.displayName) {
          session.setTopic({
            type: 'workout',
            workoutName: packet.workout.displayName,
          })
        }
        session.setRecommendation(result.summary)
        return {
          ok: true,
          source: 'deterministic',
          intent,
          suggestions: [],
          data: { referent: referentWorkout(packet, session) },
          ...result,
        }
      }
    }

    const workout = referentWorkout(packet, session)
    const constraints = session.userConstraints?.join(' ').toLowerCase() ?? ''

    if (
      /what would you do|what should i do|should i still|still do it/.test(text) &&
      (constraints || session.topic || session.lastRecommendation)
    ) {
      const guided = buildConstraintFollowUp(packet, session)
      if (guided) {
        session.setRecommendation(guided.summary)
        return {
          ok: true,
          source: 'deterministic',
          intent,
          ...guided,
          suggestions: [],
          data: { followUp: true, referent: workout },
        }
      }
    }

    const fallback = workout
      ? constraints
        ? `Given what you mentioned, I can help you think through ${workout} — effort, timing, or whether to adjust the plan.`
        : `I can help with ${workout}, readiness, recovery, or nutrition. What do you want to figure out?`
      : "I can help with today's plan, readiness, recovery, or nutrition — what do you want to figure out?"

    session.setRecommendation(fallback)
    return {
      ok: true,
      source: 'deterministic',
      intent,
      summary: fallback,
      suggestions: buildAvaSuggestedPrompts(packet).slice(0, 2),
      actions: [],
      data: {},
    }
  } catch (error) {
    return {
      ok: false,
      source: 'deterministic',
      intent,
      summary:
        packet.briefing?.headline
          ? `I can't open the full conversation right now, but today's recommendation is still ${packet.briefing.headline}`
          : "I can't open the full conversation right now, but your Daily Briefing on Home is still available.",
      suggestions: [],
      actions: [],
      data: { error: error?.message ?? 'conversation-failed' },
    }
  }
}

export const conversationCannotMutateCanonicalWorkout = (response, packet) => {
  if (!response || !packet) return true
  return response.data?.canonicalWorkoutOverride !== true
}
