import { AVA_ACTION_OUTCOME_KIND } from './avaActionTypes'
import { executeAvaAction } from './avaActionExecutor'
import { logAvaActionDiagnostic } from './avaActionDiagnostics'
import { getAvaActionDefinition } from './avaActionRegistry'
import {
  actionResolutionToChip,
  resolveActionFromMessage,
  resolveModelProposedAction,
} from './avaActionResolver'
import { AVA_ACTION_STAGE } from './avaActionTypes'
import { referentFromModelAction, setSessionActiveReferent } from './avaActionReferent'

export const createAvaActionOutcome = (partial = {}) => ({
  kind: partial.kind ?? AVA_ACTION_OUTCOME_KIND.ACTION_READY,
  actionId: partial.actionId ?? null,
  message: String(partial.message ?? '').trim(),
  payload: partial.payload ?? null,
  reversible: Boolean(partial.reversible),
  undoToken: partial.undoToken ?? null,
  actions: partial.actions ?? [],
  source: partial.source ?? null,
  rejected: Boolean(partial.rejected),
  navigated: Boolean(partial.navigated),
})

export async function orchestrateMessageAction({
  message,
  session,
  packet,
  runtime,
  role = 'athlete',
  requestId = 'message',
} = {}) {
  const resolution = resolveActionFromMessage(message, { session, packet })

  if (resolution?.ambiguous) {
    return createAvaActionOutcome({
      kind: AVA_ACTION_OUTCOME_KIND.ACTION_FAILURE,
      message: resolution.message,
      source: resolution.source,
    })
  }

  if (!resolution?.actionId) {
    return null
  }

  logAvaActionDiagnostic({
    actionId: resolution.actionId,
    source: resolution.source,
    stage: AVA_ACTION_STAGE.RESOLVED,
  })

  if (!resolution.executeImmediately) {
    const definition = getAvaActionDefinition(resolution.actionId)
    return createAvaActionOutcome({
      kind: AVA_ACTION_OUTCOME_KIND.ACTION_FAILURE,
      actionId: resolution.actionId,
      message: definition?.buildFailureMessage({ reason: resolution.reason }) ?? "I couldn't do that.",
      source: resolution.source,
    })
  }

  if (!runtime) {
    return createAvaActionOutcome({
      kind: AVA_ACTION_OUTCOME_KIND.ACTION_READY,
      actionId: resolution.actionId,
      message: resolution.label
        ? `${resolution.label}?`
        : 'Ready when you are.',
      actions: [actionResolutionToChip(resolution)].filter(Boolean),
      source: resolution.source,
    })
  }

  const result = await executeAvaAction({
    actionId: resolution.actionId,
    runtime,
    context: { packet, session, ...resolution.meta },
    source: resolution.source,
    requestId,
    session,
  })

  return createAvaActionOutcome({
    kind: result.ok
      ? AVA_ACTION_OUTCOME_KIND.ACTION_SUCCESS
      : AVA_ACTION_OUTCOME_KIND.ACTION_FAILURE,
    actionId: resolution.actionId,
    message: result.message,
    payload: result.payload ?? null,
    source: resolution.source,
    rejected: result.rejected,
    navigated: result.navigated,
  })
}

export function orchestrateModelAction({
  suggestedAction,
  packet,
  role = 'athlete',
  message = '',
  session = null,
} = {}) {
  const resolution = resolveModelProposedAction(suggestedAction, { packet, role })

  if (resolution?.rejected) {
    return createAvaActionOutcome({
      kind: AVA_ACTION_OUTCOME_KIND.ACTION_FAILURE,
      message: resolution.message,
      rejected: true,
    })
  }

  if (!resolution?.actionId) {
    return null
  }

  logAvaActionDiagnostic({
    actionId: resolution.actionId,
    source: resolution.source,
    stage: AVA_ACTION_STAGE.RESOLVED,
  })

  const chip = actionResolutionToChip(resolution)
  if (session && resolution.actionId) {
    const referent = referentFromModelAction({
      actionId: resolution.actionId,
      label: chip?.label,
    })
    if (referent) {
      setSessionActiveReferent(session, referent)
    }
  }

  return createAvaActionOutcome({
    kind: AVA_ACTION_OUTCOME_KIND.ACTION_READY,
    actionId: resolution.actionId,
    message: message || chip?.label || 'Ready when you are.',
    actions: chip ? [chip] : [],
    source: resolution.source,
  })
}

export async function orchestrateUiAction({
  actionId,
  runtime,
  packet,
  session,
  source = 'ui',
  requestId = 'ui',
  meta = {},
} = {}) {
  const result = await executeAvaAction({
    actionId,
    runtime,
    context: { packet, session, ...meta },
    source,
    requestId,
    session,
  })

  return createAvaActionOutcome({
    kind: result.ok
      ? AVA_ACTION_OUTCOME_KIND.ACTION_SUCCESS
      : AVA_ACTION_OUTCOME_KIND.ACTION_FAILURE,
    actionId: result.actionId ?? actionId,
    message: result.message,
    payload: result.payload ?? null,
    rejected: result.rejected,
    navigated: result.navigated,
  })
}
