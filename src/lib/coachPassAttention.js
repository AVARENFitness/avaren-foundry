import {
  filterActiveRoster,
  resolveRecordBusinessClientId,
} from './coachBusinessClient'

export const LOW_PASS_ATTENTION_THRESHOLD = 2

export const isLowPassBalance = (
  balance,
  { threshold = LOW_PASS_ATTENTION_THRESHOLD } = {},
) => {
  const value = Number(balance ?? 0)
  return value >= 0 && value <= threshold
}

/**
 * Coach Today "Low passes" — canonical active business clients only.
 * Archived/ended clients never contribute.
 */
export const countActiveClientsWithLowPasses = ({
  clients = [],
  passSummaryByBusinessClientId = {},
  threshold = LOW_PASS_ATTENTION_THRESHOLD,
} = {}) => {
  const activeIds = new Set(
    filterActiveRoster(clients)
      .map((client) => resolveRecordBusinessClientId(client))
      .filter(Boolean)
      .map(String),
  )

  return Object.entries(passSummaryByBusinessClientId ?? {}).filter(
    ([businessClientId, summary]) => {
      if (!activeIds.has(String(businessClientId))) return false
      const activeCount = Number(summary?.activeCount ?? 0)
      const totalBalance = Number(summary?.totalBalance ?? 0)
      return activeCount > 0 && isLowPassBalance(totalBalance, { threshold })
    },
  ).length
}
