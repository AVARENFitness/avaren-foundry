import { formatWorkoutName } from './avaContext'
import {
  isSessionConstraintStatement,
  isStateStatement,
} from './avaConversationalRouter'

export const AVA_SESSION_MAX_STATEMENTS = 6
export const AVA_SESSION_MAX_CONSTRAINTS = 4
export const AVA_SESSION_MAX_RECENT_MESSAGES = 12

const normalize = (value = '') =>
  String(value).trim().toLowerCase().replace(/\s+/g, ' ')

export const isCommitmentStatement = (message = '') => {
  const text = normalize(message)
  if (!text) return false

  return (
    /\bdon't want to skip\b/.test(text) ||
    /\bdo not want to skip\b/.test(text) ||
    /\bdon't want to miss\b/.test(text) ||
    /\bstill want to (train|work out|workout|lift)\b/.test(text) ||
    /\bwant to (train|work out|workout|lift) (today|still|anyway)\b/.test(text)
  )
}

export const shouldCaptureSessionContext = (message = '') => {
  const text = String(message ?? '').trim()
  if (!text) return false

  return (
    isStateStatement(text) ||
    isSessionConstraintStatement(text) ||
    isCommitmentStatement(text)
  )
}

const resolveWorkoutName = (packet = {}) =>
  packet.workout?.displayName ??
  formatWorkoutName(packet.facts?.canonicalWorkout) ??
  null

const extractTimeConstraintMinutes = (text = '') => {
  const match = String(text).match(/\b(?:about |only )?(\d+)\s*minutes?\b/i)
  return match ? Number(match[1]) : null
}

export const recordUserTurn = (session, message, { packet } = {}) => {
  if (!session || !String(message ?? '').trim()) return

  const text = String(message).trim()
  const lastUser = session.messages?.filter((item) => item.role === 'user').at(-1)
  if (lastUser?.text === text) return

  session.add('user', text)

  if (isStateStatement(text) || isCommitmentStatement(text)) {
    session.addUserStatement(text)
  }

  if (isSessionConstraintStatement(text) || isCommitmentStatement(text)) {
    session.addConstraint(text)
  }

  const workoutName = resolveWorkoutName(packet)
  if (
    workoutName &&
    (isStateStatement(text) ||
      isSessionConstraintStatement(text) ||
      isCommitmentStatement(text))
  ) {
    const minutes = extractTimeConstraintMinutes(text)
    session.setTopic({
      type: 'workout',
      workoutName,
      ...(Number.isFinite(minutes) ? { timeConstraintMinutes: minutes } : {}),
    })
  }
}

export const recordAvaTurn = (session, text, meta = {}) => {
  if (!session || !String(text ?? '').trim()) return

  const summary = String(text).trim()
  const lastAva = session.messages?.filter((item) => item.role === 'ava').at(-1)
  if (lastAva?.text === summary) return

  session.add('ava', summary, meta)
  session.setRecommendation(summary)
}
