export const AVA_PIPELINE_KIND = {
  RESPONSE: 'response',
  CLARIFICATION: 'clarification',
  CONFIRMATION: 'confirmation',
  ACTION_READY: 'action_ready',
  ACTION_CONFIRMATION: 'action_confirmation',
  ACTION_SUCCESS: 'action_success',
  ACTION_FAILURE: 'action_failure',
  CANCELLED: 'cancelled',
  COACH_RESULT: 'coach_result',
}

const FALLBACK_MESSAGE = "I couldn't finish that action. Try that again."

const attachOtherChoice = (payload = null) => {
  if (!payload?.choices?.length) return payload

  const hasOther = payload.choices.some(
    (choice) => choice?.isOther || choice?.name === 'Other',
  )

  if (hasOther) return payload

  return {
    ...payload,
    choices: [
      ...payload.choices,
      {
        id: '__ava_other__',
        name: 'Other',
        brand: 'None of these',
        isOther: true,
      },
    ],
  }
}

const resolveClarificationPayload = (result, session = null, options = {}) => {
  if (options.clarificationPayload?.choices?.length) {
    return attachOtherChoice(options.clarificationPayload)
  }

  const interpretation = result?.data?.interpretation
  if (interpretation?.clarification?.choices?.length) {
    return attachOtherChoice(interpretation.clarification)
  }

  const pending = session?.pendingAction
  if (pending?.candidates?.length) {
    return attachOtherChoice({
      query: pending.query ?? pending.entityQuery ?? null,
      quantity: pending.quantity ?? 1,
      meal: pending.meal ?? null,
      serving: pending.serving ?? null,
      choices: pending.candidates,
      summary:
        pending.clarificationNeeded ??
        interpretation?.summary ??
        result?.summary ??
        `Which “${pending.query ?? 'food'}” did you mean?`,
    })
  }

  return null
}

export const createPipelineOutcome = (partial = {}) => ({
  kind: partial.kind ?? AVA_PIPELINE_KIND.RESPONSE,
  message: String(partial.message ?? '').trim() || FALLBACK_MESSAGE,
  candidates: partial.candidates ?? null,
  pendingAction: partial.pendingAction ?? null,
  actionResult: partial.actionResult ?? null,
  raw: partial.raw ?? null,
  showPreview: Boolean(partial.showPreview),
  readOnly: Boolean(partial.readOnly),
  awaitingRefinement: Boolean(partial.awaitingRefinement),
  suggestions: partial.suggestions ?? [],
  actions: partial.actions ?? [],
  coachResults: partial.coachResults ?? [],
})

export const createPipelineFailure = (message = FALLBACK_MESSAGE, raw = null) =>
  createPipelineOutcome({
    kind: AVA_PIPELINE_KIND.ACTION_FAILURE,
    message,
    raw,
  })

export const normalizePipelineOutcome = (result, session = null, options = {}) => {
  if (!result) {
    return createPipelineFailure()
  }

  if (result?.data?.cancelled) {
    return createPipelineOutcome({
      kind: AVA_PIPELINE_KIND.CANCELLED,
      message: result.summary,
      raw: result,
    })
  }

  if (result?.data?.executed || result?.data?.nutritionUpdated) {
    return createPipelineOutcome({
      kind: AVA_PIPELINE_KIND.ACTION_SUCCESS,
      message: result.summary,
      actionResult: result.data?.execution ?? null,
      raw: result,
    })
  }

  const clarificationPayload = resolveClarificationPayload(result, session, options)

  if (result?.data?.awaitingRefinement || result?.data?.interpretation?.awaitingRefinement) {
    return createPipelineOutcome({
      kind: AVA_PIPELINE_KIND.CLARIFICATION,
      message: clarificationPayload?.summary ?? result.summary,
      candidates: clarificationPayload,
      pendingAction: session?.pendingAction ?? null,
      awaitingRefinement: true,
      raw: result,
    })
  }

  if (result?.data?.readOnly || result?.data?.query) {
    return createPipelineOutcome({
      kind: AVA_PIPELINE_KIND.RESPONSE,
      message: result.summary,
      readOnly: true,
      raw: result,
    })
  }

  if (clarificationPayload?.choices?.length) {
    return createPipelineOutcome({
      kind: AVA_PIPELINE_KIND.CLARIFICATION,
      message: clarificationPayload.summary ?? result.summary,
      candidates: clarificationPayload,
      pendingAction: session?.pendingAction ?? null,
      raw: result,
    })
  }

  const interpretation = result?.data?.interpretation

  if (
    interpretation?.requiresConfirmation &&
    interpretation?.preview
  ) {
    return createPipelineOutcome({
      kind: AVA_PIPELINE_KIND.CONFIRMATION,
      message: interpretation.summary ?? result.summary ?? 'Confirm this log?',
      pendingAction: session?.pendingAction ?? null,
      showPreview: true,
      raw: result,
    })
  }

  if (result?.data?.noMatch || result?.data?.tool) {
    return createPipelineOutcome({
      kind: AVA_PIPELINE_KIND.RESPONSE,
      message: result.summary,
      raw: result,
    })
  }

  if (result.summary || result.actions?.length || result.suggestions?.length) {
    return createPipelineOutcome({
      kind: AVA_PIPELINE_KIND.RESPONSE,
      message: result.summary ?? FALLBACK_MESSAGE,
      suggestions: result.suggestions ?? [],
      actions: result.actions ?? [],
      raw: result,
    })
  }

  return createPipelineFailure(FALLBACK_MESSAGE, result)
}
