import { PROPOSAL_STATUS } from './avaPlanTypes'

export const setActivePlanProposal = (session = null, proposal = null) => {
  if (!session) return null
  session.activePlanProposal = proposal
  return proposal
}

export const clearActivePlanProposal = (session = null) => {
  if (!session) return
  session.activePlanProposal = null
}

export const cancelActivePlanProposal = (session = null) => {
  if (!session?.activePlanProposal) return null
  session.activePlanProposal = {
    ...session.activePlanProposal,
    status: PROPOSAL_STATUS.CANCELLED,
  }
  const cancelled = session.activePlanProposal
  session.activePlanProposal = null
  return cancelled
}

export const markActiveProposalApplied = (session = null, proposal = null) => {
  if (!session) return null
  session.activePlanProposal = {
    ...(proposal ?? session.activePlanProposal),
    status: PROPOSAL_STATUS.APPLIED,
  }
  const applied = session.activePlanProposal
  session.activePlanProposal = null
  session.lastAppliedPlanProposal = applied
  return applied
}

export const getActivePlanProposal = (session = null) =>
  session?.activePlanProposal ?? null

export const logAvaPlanDiagnostic = ({
  type = null,
  status = null,
  constraintTypes = [],
  changeTypes = [],
  validationResult = null,
  source = 'deterministic',
} = {}) => {
  if (!import.meta.env?.DEV) return

  console.debug(
    '[ava-plan]',
    JSON.stringify({
      type,
      status,
      constraintTypes,
      changeTypes,
      validationResult,
      source,
    }),
  )
}

export const logAvaPlanApplyDiagnostic = ({
  proposalIdPresent = false,
  actionCount = 0,
  verified = false,
  stale = false,
} = {}) => {
  if (!import.meta.env?.DEV) return

  console.debug(
    '[ava-plan-apply]',
    JSON.stringify({
      proposalIdPresent,
      actionCount,
      verified,
      stale,
    }),
  )
}
