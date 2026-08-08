import { nutritionDateKey } from '../lib/nutrition'

export const AVA_TX_STATUS = {
  IDLE: 'idle',
  PARSING: 'parsing',
  RESOLVING: 'resolving',
  AWAITING_DISAMBIGUATION: 'awaiting-disambiguation',
  AWAITING_CONFIRMATION: 'awaiting-confirmation',
  AWAITING_REFINEMENT: 'awaiting-refinement',
  AWAITING_QUANTITY: 'awaiting-quantity',
  READY_TO_EXECUTE: 'ready-to-execute',
  EXECUTING: 'executing',
  SUCCEEDED: 'succeeded',
  FAILED: 'failed',
  UNDONE: 'undone',
  CANCELLED: 'cancelled',
}

export const AVA_TX_TYPE = {
  LOG_FOOD: 'log-food',
  LOG_WATER: 'log-water',
  LOG_WEIGHT: 'log-weight',
  LOG_RECIPE: 'log-recipe',
  CORRECT_FOOD: 'correct-food',
}

const createId = () =>
  globalThis.crypto?.randomUUID?.() ??
  `ava-tx-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`

export const createPendingAction = (partial = {}) => ({
  id: partial.id ?? createId(),
  type: partial.type ?? AVA_TX_TYPE.LOG_FOOD,
  status: partial.status ?? AVA_TX_STATUS.PARSING,
  originalUserMessage: partial.originalUserMessage ?? '',
  originalMessage: partial.originalMessage ?? partial.originalUserMessage ?? '',
  entityQuery: partial.entityQuery ?? partial.query ?? null,
  intent: partial.intent ?? 'food',
  candidates: partial.candidates ?? [],
  selectedCandidate: partial.selectedCandidate ?? null,
  resolvedEntity: partial.resolvedEntity ?? null,
  quantity: partial.quantity ?? 1,
  serving: partial.serving ?? null,
  meal: partial.meal ?? null,
  clarificationNeeded: partial.clarificationNeeded ?? null,
  query: partial.query ?? partial.entityQuery ?? null,
  interpretation: partial.interpretation ?? null,
  refinements: partial.refinements ?? [],
  createdAt: partial.createdAt ?? new Date().toISOString(),
})

export const createReversibleAction = (partial = {}) => ({
  transactionId: partial.transactionId ?? createId(),
  type: partial.type ?? AVA_TX_TYPE.LOG_FOOD,
  label: partial.label ?? 'Last AVA action',
  date: partial.date,
  entryIds: partial.entryIds ?? [],
  previousNutrition: partial.previousNutrition ?? null,
  resultingNutrition: partial.resultingNutrition ?? null,
  foodId: partial.foodId ?? null,
  servings: partial.servings ?? 1,
  executedAt: partial.executedAt ?? new Date().toISOString(),
  undone: false,
})

export const ACTIVE_PENDING_STATUSES = [
  AVA_TX_STATUS.PARSING,
  AVA_TX_STATUS.RESOLVING,
  AVA_TX_STATUS.AWAITING_DISAMBIGUATION,
  AVA_TX_STATUS.AWAITING_CONFIRMATION,
  AVA_TX_STATUS.AWAITING_REFINEMENT,
  AVA_TX_STATUS.AWAITING_QUANTITY,
  AVA_TX_STATUS.READY_TO_EXECUTE,
]

export const isAwaitingConfirmation = (session) =>
  session?.pendingAction?.status === AVA_TX_STATUS.AWAITING_CONFIRMATION

export const hasActivePendingTransaction = (session) =>
  Boolean(
    session?.pendingAction &&
      ACTIVE_PENDING_STATUSES.includes(session.pendingAction.status),
  )

export const canUndoLastReversibleAction = (
  session,
  nutrition = null,
  date = null,
) => {
  const last = session?.lastReversibleAction
  if (!last || last.undone) return false
  if (!last.entryIds?.length) return false

  if (!nutrition) return true

  const targetDate = last.date ?? date ?? nutritionDateKey()
  const dayFoods = nutrition?.days?.[targetDate]?.foods ?? []

  return last.entryIds.every((entryId) =>
    dayFoods.some((entry) => entry.id === entryId),
  )
}

export const setPendingAction = (session, pendingAction) => {
  if (!session) return
  session.pendingAction = pendingAction
}

export const clearPendingAction = (session) => {
  if (!session) return
  session.pendingAction = null
}

export const setLastReversibleAction = (session, action) => {
  if (!session) return
  session.lastReversibleAction = action
}

export const clearLastReversibleAction = (session) => {
  if (!session) return
  session.lastReversibleAction = null
}

export const markLastReversibleUndone = (session) => {
  if (!session?.lastReversibleAction) return
  session.lastReversibleAction = {
    ...session.lastReversibleAction,
    undone: true,
  }
}
