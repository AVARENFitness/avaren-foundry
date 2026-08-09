export const setPendingCoachFollowUp = (session = null, proposal = null) => {
  if (!session) return
  session.pendingCoachFollowUp = proposal
}

export const clearPendingCoachFollowUp = (session = null) => {
  if (!session) return
  session.pendingCoachFollowUp = null
}

export const getPendingCoachFollowUp = (session = null) =>
  session?.pendingCoachFollowUp ?? null

export const wasCoachFollowUpSubmitted = (session = null, proposalId = null) => {
  if (!session || !proposalId) return false
  return (session.submittedCoachFollowUpIds ?? []).includes(proposalId)
}

export const markCoachFollowUpSubmitted = (session = null, proposalId = null) => {
  if (!session || !proposalId) return
  const ids = session.submittedCoachFollowUpIds ?? []
  if (!ids.includes(proposalId)) {
    session.submittedCoachFollowUpIds = [...ids, proposalId]
  }
}
