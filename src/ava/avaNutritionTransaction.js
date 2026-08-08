import { COMMON_FOODS } from '../data/commonFoods'
import { nutritionDateKey } from '../lib/nutrition'
import { isNutritionQuery, isExplicitNutritionLogIntent, shouldRunNutritionTool } from '../lib/avaConversationalRouter'
import { removeFoodEntriesFromNutrition } from '../lib/nutritionActions'
import { answerNutritionQuery } from './avaNutritionQuery'
import {
  extractConfirmationRefinement,
  isConfirmationNegative,
  isConfirmationPositive,
  isConfirmationReply,
  resolveOrdinalCandidate,
} from './avaConfirmationReplies'
import {
  applyCandidateDisplayMeta,
  curateFoodCandidates,
} from './avaFoodCandidates'
import {
  isPendingFoodRefinement,
  logCandidateDiagnostics,
  searchRefinedFoodCandidates,
  shouldRefinePendingSearch,
} from './avaFoodRefinement'
import {
  AVA_TX_STATUS,
  AVA_TX_TYPE,
  canUndoLastReversibleAction,
  clearPendingAction,
  createPendingAction,
  createReversibleAction,
  hasActivePendingTransaction,
  isAwaitingConfirmation,
  markLastReversibleUndone,
  setLastReversibleAction,
  setPendingAction,
} from './avaTransactionState'
import {
  buildNutritionFailureMessage,
  buildNutritionSuccessMessage,
  executeNutritionInterpretation,
  executeNutritionTransaction,
  shouldAutoExecuteNutrition,
} from './avaNutritionExecutor'
import {
  AVA_CONFIDENCE,
  interpretNutritionMessage,
  isExplicitPastTenseConsumption,
  searchFoodMatches,
} from './nutritionParser'

const normalize = (value = '') =>
  String(value).trim().toLowerCase().replace(/\s+/g, ' ')

const CANCEL_PATTERNS =
  /^(never mind|nevermind|cancel|forget it|don't log|do not log|skip it|stop logging)\b/i

const CORRECTION_PATTERNS =
  /\b(actually|make that|correction|instead|rather|not \d+|wasn't|was not)\b/i

const ADDITIVE_PATTERNS = /\b(more|another|additional|extra)\b/i

const WORKOUT_QUERY_PATTERNS =
  /\b(what workout|workout do i have|today'?s workout|training today|workout today)\b/i

export const AVA_CLARIFICATION_OTHER_ID = '__ava_other__'

export const buildClarificationOtherChoice = () => ({
  id: AVA_CLARIFICATION_OTHER_ID,
  name: 'Other',
  brand: 'Search another',
  isOther: true,
  displayTitle: 'Other',
  displaySubtitle: 'Search another brand or name',
})

export const buildDisambiguationChoices = (candidates = [], query = '') => {
  const curated = query
    ? curateFoodCandidates(candidates, query).items
    : candidates
        .filter(
          (item) =>
            item?.id &&
            item?.name &&
            item.id !== AVA_CLARIFICATION_OTHER_ID &&
            !item.isOther,
        )
        .slice(0, 3)
        .map((item) => applyCandidateDisplayMeta(item))

  const trusted = curated
    .filter(
      (item) =>
        item?.id &&
        item?.name &&
        item.id !== AVA_CLARIFICATION_OTHER_ID &&
        !item.isOther,
    )
    .slice(0, 3)

  if (!trusted.length) return []
  return [...trusted, buildClarificationOtherChoice()]
}

export const buildPendingContextLabel = (pending = null) => {
  if (!pending) return null

  const quantity = pending.quantity ?? 1
  const query = pending.entityQuery ?? pending.query ?? 'food'
  const meal = pending.meal ? ` · ${pending.meal}` : ''
  const quantityLabel =
    quantity === 1 ? `1 ${query}` : `${quantity} ${query}`

  return `Logging · ${quantityLabel}${meal}`
}

export const buildClarificationPayload = (interpretation = {}, session = null) => {
  const pending = session?.pendingAction
  const baseChoices =
    interpretation?.clarification?.choices?.length
      ? interpretation.clarification.choices
      : pending?.candidates ?? []

  const choices = buildDisambiguationChoices(
    baseChoices,
    interpretation?.clarification?.query ??
      pending?.entityQuery ??
      pending?.query ??
      '',
  )
  if (!choices.length) return null

  return {
    query: interpretation?.clarification?.query ?? pending?.query ?? pending?.entityQuery,
    quantity: interpretation?.clarification?.quantity ?? pending?.quantity ?? 1,
    meal: interpretation?.clarification?.meal ?? pending?.meal ?? null,
    serving: interpretation?.clarification?.serving ?? pending?.serving ?? null,
    choices,
    summary:
      interpretation?.summary ??
      pending?.clarificationNeeded ??
      `Which “${pending?.query ?? 'food'}” did you mean?`,
  }
}

const parseQuantityFromText = (text = '') => {
  const normalized = normalize(text)
  const wordMap = {
    one: 1,
    two: 2,
    three: 3,
    four: 4,
    five: 5,
    half: 0.5,
  }

  const numeric = normalized.match(/\b(\d+(?:\.\d+)?)\b/)
  if (numeric) return Number(numeric[1])

  for (const [word, value] of Object.entries(wordMap)) {
    if (new RegExp(`\\b${word}\\b`).test(normalized)) return value
  }

  return null
}

export const isTransactionCancelMessage = (message = '') =>
  CANCEL_PATTERNS.test(String(message).trim())

export const isCorrectionMessage = (message = '') =>
  CORRECTION_PATTERNS.test(String(message).trim()) ||
  /^i (actually )?had (two|three|four|five|\d+)/i.test(String(message).trim())

export const isAdditiveCorrectionMessage = (message = '') =>
  ADDITIVE_PATTERNS.test(String(message).trim())

export const resolveCandidateFromFollowUp = (message = '', candidates = []) => {
  const text = normalize(message)
  if (!text || !candidates.length) return null

  const genericTokens = new Set(['milk', 'yogurt', 'bar', 'cheese', 'bread'])

  let best = null
  let bestScore = 0

  for (const candidate of candidates) {
    const name = normalize(candidate.name ?? '')
    const brand = normalize(candidate.brand ?? '')
    const keywords = normalize(candidate.keywords ?? '')
    const haystack = `${name} ${brand} ${keywords}`.trim()

    if (!haystack) continue

    if (text === name) {
      return candidate
    }

    if (name.includes(text) && text.length >= 4) {
      return candidate
    }

    if (
      text.includes(name) &&
      name.length >= 4 &&
      !genericTokens.has(name)
    ) {
      return candidate
    }

    const tokens = text.split(' ').filter(Boolean)
    let score = 0
    const specificTokens = tokens.filter(
      (token) => token.length >= 2 && !genericTokens.has(token),
    )

    if (
      specificTokens.length &&
      specificTokens.every((token) => haystack.includes(token))
    ) {
      score += 20
    }

    for (const token of tokens) {
      if (token.length < 2) continue
      const weight = genericTokens.has(token) ? 4 : 12
      if (haystack.includes(token)) score += weight
    }

    if (brand && text.includes(brand)) score += 8
    if (score > bestScore) {
      bestScore = score
      best = candidate
    }
  }

  return bestScore >= 12 ? best : null
}

const GENERIC_FOOD_TOKENS = new Set([
  'today',
  'bar',
  'food',
  'meal',
  'snack',
  'serving',
  'servings',
  'cup',
  'cups',
  'one',
  'had',
  'the',
  'a',
  'an',
])

const tokenOverlapScore = (left = '', right = '') => {
  const leftTokens = normalize(left)
    .split(' ')
    .filter((token) => token.length >= 3 && !GENERIC_FOOD_TOKENS.has(token))
  const rightText = normalize(right)

  if (!leftTokens.length || !rightText) return 0

  return leftTokens.filter((token) => rightText.includes(token)).length
}

export const isExplicitNewNutritionAction = (
  message = '',
  nutrition = {},
  session = null,
) => {
  const text = normalize(message)
  if (!text) return false

  const pending = session?.pendingAction
  if (pending && isReplyToPendingAction(message, session)) {
    return false
  }

  if (isExplicitPastTenseConsumption(message)) return true
  if (isExplicitNutritionLogIntent(message)) return true
  if (/^(log|add|track)\b/i.test(text)) return true

  const interpretation = interpretNutritionMessage(message, nutrition)
  if (!interpretation.handled) return false

  if (!pending) return true

  if (interpretation.action) return true

  const pendingQuery = pending.query ?? pending.entityQuery ?? ''
  const nextQuery =
    interpretation.clarification?.query ??
    interpretation.preview?.items?.[0]?.label ??
    ''

  if (!nextQuery) return false

  if (tokenOverlapScore(nextQuery, pendingQuery) >= 2) return false

  return tokenOverlapScore(pendingQuery, nextQuery) < 2
}

export const isReplyToPendingAction = (message = '', session = null) => {
  const pending = session?.pendingAction
  if (!pending) return false

  const text = normalize(message)
  if (!text || text.length > 120) return false

  if (pending.status === AVA_TX_STATUS.AWAITING_CONFIRMATION) {
    return isConfirmationReply(text)
  }

  if (isConfirmationReply(text)) return true

  const candidates = pending.candidates ?? []
  if (resolveOrdinalCandidate(text, candidates)) return true
  if (resolveCandidateFromFollowUp(text, candidates)) return true

  if (isExplicitPastTenseConsumption(message)) return false
  if (isExplicitNutritionLogIntent(message)) return false
  if (/^(log|add|track)\b/i.test(text)) return false

  const tokens = text.split(' ').filter(Boolean)
  return tokens.length > 0 && tokens.length <= 4
}

export const isPendingTransactionReply = (message = '', session = null) =>
  isReplyToPendingAction(message, session)

export const syncClarificationFromPending = (session = null) => {
  const pending = session?.pendingAction
  if (
    !pending?.candidates?.length ||
    ![
      AVA_TX_STATUS.AWAITING_DISAMBIGUATION,
      AVA_TX_STATUS.AWAITING_REFINEMENT,
    ].includes(pending.status)
  ) {
    return null
  }

  return buildClarificationPayload(
    {
      summary: pending.clarificationNeeded ?? 'Which one was it?',
    },
    session,
  )
}

const buildFoodActionFromCandidate = (candidate, quantity = 1) => ({
  type: AVA_TX_TYPE.LOG_FOOD,
  items: [
    {
      food: {
        id: candidate.id,
        name: candidate.name,
        calories: Number(candidate.calories || 0),
        protein: Number(candidate.protein || 0),
        carbs: Number(candidate.carbs || 0),
        fat: Number(candidate.fat || 0),
        fiber: Number(candidate.fiber || 0),
        servings: quantity,
      },
      source: candidate.source ?? 'catalog',
    },
  ],
})

const buildInterpretationFromAction = (
  action,
  message,
  confidence = AVA_CONFIDENCE.HIGH,
) => {
  const interpretation = {
    handled: true,
    intent: 'food',
    confidence,
    action,
    message,
  }
  interpretation.autoExecute = shouldAutoExecuteNutrition(interpretation, message)
  interpretation.requiresConfirmation = !interpretation.autoExecute
  return interpretation
}

export const setConfirmationPending = (session, interpretation, context = {}) => {
  const food = interpretation?.action?.items?.[0]?.food ?? null

  setPendingAction(
    session,
    createPendingAction({
      type: AVA_TX_TYPE.LOG_FOOD,
      status: AVA_TX_STATUS.AWAITING_CONFIRMATION,
      originalUserMessage: context.originalMessage ?? interpretation.message ?? '',
      originalMessage: context.originalMessage ?? interpretation.message ?? '',
      interpretation,
      resolvedEntity: food,
      quantity: food?.servings ?? context.quantity ?? 1,
      serving: context.serving ?? null,
      meal: context.meal ?? null,
      candidates: context.candidates ?? [],
      entityQuery: context.query ?? null,
      query: context.query ?? null,
      clarificationNeeded: interpretation.summary ?? null,
    }),
  )
}

export const resolvePendingConfirmation = ({
  message,
  nutrition,
  session,
  options = {},
} = {}) => {
  const pending = session?.pendingAction
  if (!pending || pending.status !== AVA_TX_STATUS.AWAITING_CONFIRMATION) {
    return null
  }

  const text = normalize(message)

  if (isTransactionCancelMessage(text)) {
    clearPendingAction(session)
    return {
      cancelled: true,
      summary: 'Okay — I cancelled that log.',
    }
  }

  if (isConfirmationPositive(text)) {
    const interpretation = pending.interpretation
    if (!interpretation?.action) {
      clearPendingAction(session)
      return {
        ok: false,
        summary: buildNutritionFailureMessage(),
      }
    }

    const execution = executeNutritionInterpretation({
      nutrition,
      interpretation,
      allowDuplicate: true,
      transactionId: pending.id,
    })

    if (execution.ok) {
      recordSuccessfulNutritionExecution({ session, execution })
    }

    clearPendingAction(session)

    return {
      ok: execution.ok,
      executed: execution.ok,
      execution,
      summary: execution.ok
        ? buildNutritionSuccessMessage({
            action: interpretation.action,
            applied: execution.applied,
            nutritionAfter: execution.nutrition,
          })
        : execution.summary,
    }
  }

  if (isConfirmationNegative(text)) {
    const refinement = extractConfirmationRefinement(text)
    const candidates = pending.candidates ?? []

    if (refinement && candidates.length) {
      const replacement =
        resolveCandidateFromFollowUp(refinement, candidates) ??
        resolveCandidateFromFollowUp(
          refinement,
          searchFoodMatches(nutrition, refinement, { limit: 4 }).map(
            (entry) => entry.item,
          ),
        )

      if (replacement) {
        const interpretation = buildInterpretationFromAction(
          buildFoodActionFromCandidate(replacement, pending.quantity ?? 1),
          pending.originalUserMessage ?? pending.originalMessage,
        )

        if (interpretation.autoExecute) {
          const execution = executeNutritionInterpretation({
            nutrition,
            interpretation,
            allowDuplicate: true,
            transactionId: pending.id,
          })

          if (execution.ok) {
            recordSuccessfulNutritionExecution({ session, execution })
          }

          clearPendingAction(session)

          return {
            ok: execution.ok,
            executed: execution.ok,
            execution,
            summary: execution.ok
              ? buildNutritionSuccessMessage({
                  action: interpretation.action,
                  applied: execution.applied,
                  nutritionAfter: execution.nutrition,
                })
              : execution.summary,
          }
        }

        setConfirmationPending(session, interpretation, {
          originalMessage: pending.originalUserMessage ?? pending.originalMessage,
          candidates,
          query: pending.query ?? pending.entityQuery,
          quantity: pending.quantity,
          meal: pending.meal,
          serving: pending.serving,
        })

        return {
          awaitingConfirmation: true,
          summary: `Log ${replacement.name} for today?`,
          interpretation,
        }
      }
    }

    if (candidates.length) {
      setPendingAction(
        session,
        createPendingAction({
          ...pending,
          status: AVA_TX_STATUS.AWAITING_DISAMBIGUATION,
          interpretation: null,
          selectedCandidate: null,
        }),
      )

      const clarification = buildClarificationPayload(
        {
          summary: `Which “${pending.query ?? pending.entityQuery ?? 'food'}” did you mean?`,
          clarification: {
            query: pending.query ?? pending.entityQuery,
            quantity: pending.quantity ?? 1,
            meal: pending.meal ?? null,
            serving: pending.serving ?? null,
            choices: candidates,
          },
        },
        session,
      )

      return {
        restoredDisambiguation: true,
        summary: clarification?.summary ?? `Which “${pending.query ?? 'food'}” did you mean?`,
        interpretation: {
          handled: true,
          clarification,
        },
      }
    }

    clearPendingAction(session)
    return {
      cancelled: true,
      summary: "Okay — I won't log that.",
    }
  }

  const refinementCandidate =
    resolveCandidateFromFollowUp(text, pending.candidates ?? []) ??
    resolveOrdinalCandidate(text, pending.candidates ?? [])

  if (refinementCandidate && !refinementCandidate.isOther) {
    const interpretation = buildInterpretationFromAction(
      buildFoodActionFromCandidate(refinementCandidate, pending.quantity ?? 1),
      pending.originalUserMessage ?? pending.originalMessage,
    )

    if (interpretation.autoExecute) {
      const execution = executeNutritionInterpretation({
        nutrition,
        interpretation,
        allowDuplicate: true,
        transactionId: pending.id,
      })

      if (execution.ok) {
        recordSuccessfulNutritionExecution({ session, execution })
      }

      clearPendingAction(session)

      return {
        ok: execution.ok,
        executed: execution.ok,
        execution,
        summary: execution.ok
          ? buildNutritionSuccessMessage({
              action: interpretation.action,
              applied: execution.applied,
              nutritionAfter: execution.nutrition,
            })
          : execution.summary,
      }
    }

    setConfirmationPending(session, interpretation, {
      originalMessage: pending.originalUserMessage ?? pending.originalMessage,
      candidates: pending.candidates ?? [],
      query: pending.query ?? pending.entityQuery,
      quantity: pending.quantity,
      meal: pending.meal,
      serving: pending.serving,
    })

    return {
      awaitingConfirmation: true,
      summary: `Log ${refinementCandidate.name} for today?`,
      interpretation,
    }
  }

  if (isConfirmationReply(text)) {
    return {
      ok: false,
      needsRetry: true,
      summary: pending.clarificationNeeded ?? 'Confirm this log, or say no to cancel.',
    }
  }

  return null
}

export const resolvePendingDisambiguation = ({
  message,
  nutrition,
  session,
  selectedChoice = null,
}) => {
  const pending = session?.pendingAction
  if (
    !pending ||
    ![
      AVA_TX_STATUS.AWAITING_DISAMBIGUATION,
      AVA_TX_STATUS.AWAITING_REFINEMENT,
    ].includes(pending.status)
  ) {
    return null
  }

  if (
    selectedChoice?.isOther ||
    selectedChoice?.id === AVA_CLARIFICATION_OTHER_ID
  ) {
    setPendingAction(
      session,
      createPendingAction({
        ...pending,
        status: AVA_TX_STATUS.AWAITING_REFINEMENT,
        candidates: [],
        selectedCandidate: null,
      }),
    )

    return {
      ok: false,
      needsRefinement: true,
      summary:
        "No problem — tell me the brand or exact name and I'll match it carefully.",
      pending: session.pendingAction,
    }
  }

  const refineSearch = shouldRefinePendingSearch(
    message,
    pending.candidates ?? [],
    pending,
  )

  const candidate =
    selectedChoice ??
    resolveOrdinalCandidate(message, pending.candidates) ??
    (refineSearch
      ? null
      : resolveCandidateFromFollowUp(message, pending.candidates))

  if (
    !candidate &&
    !selectedChoice &&
    (isPendingFoodRefinement(message, pending) || refineSearch)
  ) {
    const { refinements, candidates } = searchRefinedFoodCandidates(
      nutrition,
      pending,
      message,
    )

    if (!candidates.length) {
      return {
        ok: false,
        needsRetry: true,
        summary: `I couldn't find a ${normalize(message)} match for that ${pending.query ?? 'food'}. Want to try a different brand or name?`,
        pending,
      }
    }

    setPendingAction(
      session,
      createPendingAction({
        ...pending,
        status: AVA_TX_STATUS.AWAITING_DISAMBIGUATION,
        refinements,
        candidates,
        clarificationNeeded: 'Which one was it?',
      }),
    )

    let refinedSelection = null
    if (candidates.length === 1) {
      refinedSelection = candidates[0]
    } else {
      const exact = candidates.find(
        (item) => normalize(item.name ?? '') === normalize(message),
      )
      if (exact) refinedSelection = exact
    }

    if (refinedSelection && !refinedSelection.isOther) {
      const interpretation = buildInterpretationFromAction(
        buildFoodActionFromCandidate(refinedSelection, pending.quantity ?? 1),
        pending.originalUserMessage ?? pending.originalMessage ?? message,
      )

      if (interpretation.autoExecute) {
        return {
          ok: true,
          interpretation,
          pending: session.pendingAction,
          resolvedLabel: refinedSelection.name,
        }
      }

      setConfirmationPending(session, interpretation, {
        originalMessage: pending.originalUserMessage ?? pending.originalMessage ?? message,
        candidates,
        query: pending.query ?? pending.entityQuery,
        quantity: pending.quantity ?? 1,
        meal: pending.meal ?? null,
        serving: pending.serving ?? null,
      })

      return {
        ok: false,
        awaitingConfirmation: true,
        summary: `Log ${refinedSelection.name} for today?`,
        interpretation,
        pending: session.pendingAction,
        resolvedLabel: refinedSelection.name,
      }
    }

    return {
      ok: false,
      refined: true,
      needsRetry: true,
      summary: 'Which one was it?',
      pending: session.pendingAction,
    }
  }

  const catalogMatches =
    pending.status === AVA_TX_STATUS.AWAITING_REFINEMENT
      ? searchFoodMatches(
          nutrition,
          `${pending.query ?? ''} ${message}`.trim(),
          { limit: 4 },
        ).map((entry) => entry.item)
      : []

  const resolvedCandidate =
    candidate ??
    resolveCandidateFromFollowUp(message, catalogMatches) ??
    resolveCandidateFromFollowUp(
      message,
      searchFoodMatches(nutrition, message, { limit: 4 }).map((entry) => entry.item),
    )

  if (!resolvedCandidate || resolvedCandidate.isOther) {
    if (pending.status === AVA_TX_STATUS.AWAITING_REFINEMENT) {
      return {
        ok: false,
        needsRefinement: true,
        summary:
          "I couldn't find a confident match. Can you give me the brand or exact name?",
        pending,
      }
    }

    return {
      ok: false,
      needsRetry: true,
      summary: `I still need to know which ${pending.query ?? 'food'} you meant.`,
      pending,
    }
  }

  const interpretation = buildInterpretationFromAction(
    buildFoodActionFromCandidate(resolvedCandidate, pending.quantity ?? 1),
    pending.originalUserMessage ?? pending.originalMessage ?? message,
  )

  if (selectedChoice && !selectedChoice.isOther) {
    interpretation.autoExecute = true
    interpretation.requiresConfirmation = false

    return {
      ok: true,
      interpretation,
      pending,
      resolvedLabel: resolvedCandidate.name,
    }
  }

  if (!interpretation.autoExecute) {
    setConfirmationPending(session, interpretation, {
      originalMessage: pending.originalUserMessage ?? pending.originalMessage ?? message,
      candidates: pending.candidates ?? [],
      query: pending.query ?? pending.entityQuery,
      quantity: pending.quantity ?? 1,
      meal: pending.meal ?? null,
      serving: pending.serving ?? null,
    })

    return {
      ok: false,
      awaitingConfirmation: true,
      summary: `Log ${resolvedCandidate.name} for today?`,
      interpretation,
      pending: session.pendingAction,
      resolvedLabel: resolvedCandidate.name,
    }
  }

  return {
    ok: true,
    interpretation,
    pending,
    resolvedLabel: resolvedCandidate.name,
  }
}

export const buildCorrectionAction = ({
  message,
  nutrition,
  session,
  date = nutritionDateKey(),
}) => {
  const last = session?.lastReversibleAction
  if (!last || last.undone || last.type !== AVA_TX_TYPE.LOG_FOOD) {
    return null
  }

  const text = normalize(message)
  const quantity = parseQuantityFromText(message)
  const additive = isAdditiveCorrectionMessage(message)

  const dayFoods = nutrition?.days?.[date]?.foods ?? []
  const targetEntries = dayFoods.filter((entry) => last.entryIds.includes(entry.id))
  if (!targetEntries.length) return null

  const primary = targetEntries[0]
  const currentServings = Number(primary.servings ?? 1)

  if (/milk|whole|skim|2%|two percent|almond|oat/.test(text)) {
    const milkCandidates = COMMON_FOODS.filter((item) => /milk/i.test(item.name))
    const replacement = resolveCandidateFromFollowUp(message, [
      ...(nutrition.savedFoods ?? []),
      ...milkCandidates,
    ])

    if (replacement) {
      return {
        type: 'replace-food',
        date,
        removeEntryIds: last.entryIds,
        replacementAction: buildFoodActionFromCandidate(
          replacement,
          currentServings,
        ),
        label: replacement.name,
      }
    }
  }

  if (quantity == null) return null

  if (additive) {
    return {
      type: 'add-food',
      date,
      action: buildFoodActionFromCandidate(
        {
          id: last.foodId,
          name: primary.name,
          calories: primary.calories / currentServings,
          protein: primary.protein / currentServings,
          carbs: primary.carbs / currentServings,
          fat: primary.fat / currentServings,
          fiber: primary.fiber / currentServings,
          source: primary.source ?? 'catalog',
        },
        quantity,
      ),
      label: primary.name,
    }
  }

  return {
    type: 'replace-quantity',
    date,
    removeEntryIds: last.entryIds,
    action: buildFoodActionFromCandidate(
      {
        id: last.foodId,
        name: primary.name,
        calories: primary.calories / currentServings,
        protein: primary.protein / currentServings,
        carbs: primary.carbs / currentServings,
        fat: primary.fat / currentServings,
        fiber: primary.fiber / currentServings,
        source: primary.source ?? 'catalog',
      },
      quantity,
    ),
    label: primary.name,
  }
}

export function executeCorrectionTransaction({
  nutrition,
  correction,
  session,
  transactionId = null,
}) {
  if (!correction) {
    return { ok: false, summary: buildNutritionFailureMessage() }
  }

  if (correction.type === 'add-food') {
    const execution = executeNutritionTransaction({
      nutrition,
      action: correction.action,
      date: correction.date,
      allowDuplicate: true,
      transactionId,
    })

    if (!execution.ok) return execution

    const newEntryIds = execution.applied?.entries?.map((entry) => entry.id) ?? []
    setLastReversibleAction(
      session,
      createReversibleAction({
        transactionId: execution.transactionId,
        type: AVA_TX_TYPE.LOG_FOOD,
        label: correction.label ?? 'Food',
        date: correction.date,
        entryIds: newEntryIds,
        previousNutrition: execution.undo?.nutrition ?? null,
        resultingNutrition: execution.nutrition,
        foodId: correction.action.items?.[0]?.food?.id ?? null,
        servings: correction.action.items?.[0]?.food?.servings ?? 1,
      }),
    )
    clearPendingAction(session)

    return {
      ...execution,
      summary: `Got it — I logged ${quantityLabel(correction.action.items[0].food.servings)} ${correction.label}.`,
    }
  }

  let workingNutrition = nutrition

  if (correction.removeEntryIds?.length) {
    workingNutrition = removeFoodEntriesFromNutrition(
      workingNutrition,
      correction.date,
      correction.removeEntryIds,
    ).nutrition
  }

  const action = correction.action ?? correction.replacementAction
  const execution = executeNutritionTransaction({
    nutrition: workingNutrition,
    action,
    date: correction.date,
    allowDuplicate: true,
    transactionId: transactionId ?? correction.transactionId,
  })

  if (!execution.ok) return execution

  const entry = execution.applied?.entries?.[0]
  setLastReversibleAction(
    session,
    createReversibleAction({
      transactionId: execution.transactionId,
      type: AVA_TX_TYPE.LOG_FOOD,
      label: correction.label ?? entry?.name ?? 'Food',
      date: correction.date,
      entryIds: execution.applied?.entries?.map((item) => item.id) ?? [],
      previousNutrition: execution.undo?.nutrition ?? null,
      resultingNutrition: execution.nutrition,
      foodId: action.items?.[0]?.food?.id ?? null,
      servings: action.items?.[0]?.food?.servings ?? 1,
    }),
  )

  clearPendingAction(session)

  return {
    ...execution,
    summary:
      correction.type === 'replace-quantity'
        ? `Updated — that's ${action.items[0].food.servings} ${correction.label} total now.`
        : correction.type === 'replace-food'
          ? `Updated — I switched that to ${correction.label}.`
          : execution.summary,
  }
}

const quantityLabel = (servings) =>
  servings === 1 ? 'one more' : `${servings} more`

export function undoLastReversibleAction({ nutrition, session, date = nutritionDateKey() }) {
  const last = session?.lastReversibleAction
  if (!last || last.undone) {
    return {
      ok: false,
      summary: "I couldn't undo that one.",
    }
  }

  if (!canUndoLastReversibleAction(session, nutrition, date)) {
    markLastReversibleUndone(session)
    return {
      ok: false,
      summary: "I couldn't undo that one.",
    }
  }

  let nextNutrition = nutrition

  if (last.entryIds?.length) {
    nextNutrition = removeFoodEntriesFromNutrition(
      nextNutrition,
      last.date ?? date,
      last.entryIds,
    ).nutrition
  } else if (last.previousNutrition) {
    nextNutrition = last.previousNutrition
  } else {
    return {
      ok: false,
      summary: "I couldn't undo that one.",
    }
  }

  markLastReversibleUndone(session)
  clearPendingAction(session)

  return {
    ok: true,
    nutrition: nextNutrition,
    summary: `Done — I removed ${last.label ?? 'that entry'}.`,
  }
}

export function recordSuccessfulNutritionExecution({
  session,
  execution,
  date = nutritionDateKey(),
}) {
  if (!execution?.ok || !session) return

  clearPendingAction(session)

  const entries = execution.applied?.entries ?? []
  const primary = entries[0]
  setLastReversibleAction(
    session,
    createReversibleAction({
      transactionId: execution.transactionId,
      type: execution.action?.type ?? AVA_TX_TYPE.LOG_FOOD,
      label: primary?.name ?? 'Food',
      date,
      entryIds: entries.map((entry) => entry.id),
      previousNutrition: execution.undo?.nutrition ?? null,
      resultingNutrition: execution.nutrition,
      foodId: execution.action?.items?.[0]?.food?.id ?? null,
      servings: execution.action?.items?.[0]?.food?.servings ?? 1,
    }),
  )
}

export function processAvaNutritionMessage({
  message = '',
  nutrition = {},
  session = null,
  packet = null,
  options = {},
} = {}) {
  const text = String(message ?? '').trim()
  if (!text) return { routed: false }

  if (hasActivePendingTransaction(session) && isTransactionCancelMessage(text)) {
    clearPendingAction(session)
    return {
      routed: true,
      result: {
        ok: true,
        source: 'local',
        intent: 'food',
        summary: 'Okay — I cancelled that log.',
        data: { cancelled: true, tool: true },
      },
    }
  }

  if (hasActivePendingTransaction(session) && WORKOUT_QUERY_PATTERNS.test(text)) {
    clearPendingAction(session)
    return { routed: false, cancelledPending: true }
  }

  if (isAwaitingConfirmation(session)) {
    const confirmation = resolvePendingConfirmation({
      message: text,
      nutrition,
      session,
      options,
    })

    if (confirmation) {
      if (confirmation.cancelled) {
        return {
          routed: true,
          result: {
            ok: true,
            source: 'local',
            intent: 'food',
            summary: confirmation.summary,
            data: { cancelled: true, tool: true },
          },
        }
      }

      if (confirmation.awaitingConfirmation || confirmation.restoredDisambiguation) {
        return {
          routed: true,
          result: {
            ok: true,
            source: 'local',
            intent: 'food',
            summary: confirmation.summary,
            data: {
              tool: true,
              interpretation: confirmation.interpretation,
            },
          },
        }
      }

      if (confirmation.needsRetry) {
        return {
          routed: true,
          result: {
            ok: true,
            source: 'local',
            intent: 'food',
            summary: confirmation.summary,
            data: { tool: true },
          },
        }
      }

      return {
        routed: true,
        result: {
          ok: confirmation.ok,
          source: 'local',
          intent: 'food',
          summary: confirmation.summary,
          data: {
            tool: true,
            executed: confirmation.executed,
            nutritionUpdated: confirmation.executed,
            execution: confirmation.execution,
            interpretation: confirmation.interpretation,
          },
        },
      }
    }

    if (!isConfirmationReply(text)) {
      clearPendingAction(session)
    }
  }

  if (isNutritionQuery(text) && !isCorrectionMessage(text)) {
    const answer = answerNutritionQuery(text, nutrition)
    if (answer) {
      return {
        routed: true,
        result: {
          ok: true,
          source: 'local',
          intent: 'nutrition-query',
          summary: answer.summary,
          data: { query: true, readOnly: true },
        },
      }
    }
  }

  if (
    hasActivePendingTransaction(session) &&
    !isAwaitingConfirmation(session)
  ) {
    if (
      isExplicitNewNutritionAction(text, nutrition, session) &&
      !isReplyToPendingAction(text, session) &&
      !options.selectedChoice
    ) {
      clearPendingAction(session)
    } else {
    const resolved = resolvePendingDisambiguation({
      message: text,
      nutrition,
      session,
      selectedChoice: options.selectedChoice ?? null,
    })

    if (resolved?.ok) {
      const execution = executeNutritionInterpretation({
        nutrition,
        interpretation: resolved.interpretation,
        allowDuplicate: true,
        transactionId: session.pendingAction?.id,
      })

      if (execution.ok) {
        recordSuccessfulNutritionExecution({ session, execution })
      }

      clearPendingAction(session)

      return {
        routed: true,
        result: {
          ok: execution.ok,
          source: 'local',
          intent: 'food',
          summary: execution.ok
            ? buildNutritionSuccessMessage({
                action: resolved.interpretation.action,
                applied: execution.applied,
                nutritionAfter: execution.nutrition,
              })
            : execution.summary,
          data: {
            tool: true,
            executed: execution.ok,
            nutritionUpdated: execution.ok,
            execution,
            interpretation: resolved.interpretation,
          },
        },
      }
    }

    if (resolved?.awaitingConfirmation) {
      return {
        routed: true,
        result: {
          ok: true,
          source: 'local',
          intent: 'food',
          summary: resolved.summary,
          data: {
            tool: true,
            interpretation: resolved.interpretation,
          },
        },
      }
    }

    if (resolved?.needsRetry || resolved?.needsRefinement) {
      const clarification = buildClarificationPayload(
        {
          summary: resolved.summary,
          clarification: resolved.needsRefinement
            ? null
            : {
                query: session.pendingAction?.query,
                quantity: session.pendingAction?.quantity,
                meal: session.pendingAction?.meal,
                choices: session.pendingAction?.candidates ?? [],
              },
        },
        session,
      )

      return {
        routed: true,
        result: {
          ok: true,
          source: 'local',
          intent: 'food',
          summary: resolved.summary,
          data: {
            tool: true,
            awaitingRefinement: Boolean(resolved.needsRefinement),
            interpretation: clarification
              ? {
                  handled: true,
                  summary: clarification.summary,
                  clarification,
                }
              : {
                  handled: true,
                  summary: resolved.summary,
                  awaitingRefinement: true,
                },
          },
        },
      }
    }

    if (!options.selectedChoice && !isReplyToPendingAction(text, session)) {
      clearPendingAction(session)
    } else if (isReplyToPendingAction(text, session)) {
      const clarification = buildClarificationPayload(
        { summary: `I still need to know which ${session.pendingAction?.query ?? 'food'} you meant.` },
        session,
      )

      return {
        routed: true,
        result: {
          ok: true,
          source: 'local',
          intent: 'food',
          summary: clarification?.summary ?? `I still need to know which ${session.pendingAction?.query ?? 'food'} you meant.`,
          data: {
            tool: true,
            interpretation: clarification
              ? {
                  handled: true,
                  summary: clarification.summary,
                  clarification,
                }
              : undefined,
          },
        },
      }
    }
    }
  }

  if (isCorrectionMessage(text) && session?.lastReversibleAction && !session.lastReversibleAction.undone) {
    const correction = buildCorrectionAction({ message: text, nutrition, session })
    if (correction) {
      const execution = executeCorrectionTransaction({
        nutrition,
        correction,
        session,
        transactionId: createPendingAction().id,
      })

      return {
        routed: true,
        result: {
          ok: execution.ok,
          source: 'local',
          intent: 'food',
          summary: execution.summary,
          data: {
            tool: true,
            executed: execution.ok,
            nutritionUpdated: execution.ok,
            execution,
            correction: true,
          },
        },
      }
    }
  }

  const interpretation = interpretNutritionMessage(text, nutrition, options)

  if (!interpretation.handled) {
    if (shouldRunNutritionTool(text, { packet, session })) {
      return {
        routed: true,
        result: {
          ok: true,
          source: 'local',
          intent: 'food',
          summary:
            "I couldn't find a confident match. Can you give me the brand or exact name?",
          data: { tool: true, noMatch: true },
        },
      }
    }

    return { routed: false }
  }

  if (
    interpretation.clarification &&
    !options.selectedChoice &&
    !interpretation.action
  ) {
    const choices = interpretation.clarification.choices ?? []

    if (!choices.length) {
      return {
        routed: true,
        result: {
          ok: true,
          source: 'local',
          intent: interpretation.intent,
          summary:
            "I couldn't find a confident match. Can you give me the brand or exact name?",
          data: { tool: true, noMatch: true },
        },
      }
    }

    setPendingAction(
      session,
      createPendingAction({
        type: AVA_TX_TYPE.LOG_FOOD,
        status: AVA_TX_STATUS.AWAITING_DISAMBIGUATION,
        originalUserMessage: text,
        originalMessage: text,
        candidates: choices,
        quantity: interpretation.clarification.quantity ?? 1,
        serving: interpretation.clarification.serving ?? null,
        meal: interpretation.clarification.meal ?? null,
        entityQuery: interpretation.clarification.query,
        query: interpretation.clarification.query,
        clarificationNeeded: interpretation.summary,
      }),
    )

    const clarificationPayload =
      buildClarificationPayload(interpretation, session) ??
      buildClarificationPayload({}, session)

    return {
      routed: true,
      result: {
        ok: true,
        source: 'local',
        intent: interpretation.intent,
        summary: clarificationPayload?.summary ?? interpretation.summary,
        data: {
          interpretation: {
            ...interpretation,
            clarification: clarificationPayload ?? interpretation.clarification,
          },
          tool: true,
        },
      },
    }
  }

  if (interpretation.action && shouldAutoExecuteNutrition(interpretation, text)) {
    const execution = executeNutritionInterpretation({
      nutrition,
      interpretation,
      transactionId: createPendingAction().id,
    })

    if (execution.ok) {
      recordSuccessfulNutritionExecution({ session, execution })
    }

    return {
      routed: true,
      result: {
        ok: execution.ok,
        source: 'local',
        intent: interpretation.intent,
        summary: execution.summary,
        data: {
          interpretation,
          tool: true,
          executed: execution.ok,
          nutritionUpdated: execution.ok,
          execution,
        },
      },
    }
  }

  if (
    interpretation.requiresConfirmation &&
    interpretation.action &&
    !interpretation.autoExecute
  ) {
    setConfirmationPending(session, interpretation, {
      originalMessage: text,
      candidates: interpretation.clarification?.choices ?? [],
      query: interpretation.clarification?.query ?? null,
      quantity: interpretation.clarification?.quantity ?? interpretation.action?.items?.[0]?.food?.servings ?? 1,
      meal: interpretation.clarification?.meal ?? null,
      serving: interpretation.clarification?.serving ?? null,
    })
  }

  return {
    routed: true,
    result: {
      ok: true,
      source: 'local',
      intent: interpretation.intent,
      summary: interpretation.summary,
      data: { interpretation, tool: true },
    },
  }
}
