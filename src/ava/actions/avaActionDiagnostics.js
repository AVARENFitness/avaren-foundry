import { AVA_ACTION_STAGE } from './avaActionTypes'

export const logAvaActionDiagnostic = ({
  actionId = null,
  source = 'deterministic',
  stage = AVA_ACTION_STAGE.RESOLVED,
  durationMs = null,
  ok = null,
  referentType = null,
  verified = null,
  destination = null,
  allowed = null,
} = {}) => {
  if (!import.meta.env?.DEV) return

  const payload = {
    actionId,
    source,
    stage,
  }

  if (durationMs != null) payload.durationMs = durationMs
  if (ok != null) payload.ok = ok
  if (referentType) payload.referentType = referentType
  if (verified != null) payload.verified = verified
  if (destination) payload.destination = destination
  if (allowed != null) payload.allowed = allowed

  console.debug('[ava-action]', JSON.stringify(payload))
}

export const logReferentDiagnostic = ({
  verb = null,
  resolvedType = null,
  resolvedActionId = null,
  confidence = null,
  ambiguous = false,
  reason = null,
} = {}) => {
  if (!import.meta.env?.DEV) return

  console.debug(
    '[ava-referent]',
    JSON.stringify({
      verb,
      resolvedType,
      resolvedActionId,
      confidence,
      ambiguous,
      ...(reason ? { reason } : {}),
    }),
  )
}
