import {
  derivePassFundingUsageDisplay,
  formatPassFundingUsageLabel,
  normalizeAthletePassHistory,
  normalizeAthletePassSummary,
  PASS_LEDGER_ENTRY_TYPE,
} from './coachPass'
import { isLowPassBalance } from './coachPassAttention'

const groupKey = (businessClientId) =>
  businessClientId == null || businessClientId === ''
    ? '__default__'
    : String(businessClientId)

const lastPurchaseAt = (ledger = []) => {
  const purchases = (ledger ?? []).filter(
    (entry) =>
      (entry.entryType ?? entry.entry_type) === PASS_LEDGER_ENTRY_TYPE.PURCHASE,
  )
  if (!purchases.length) return null
  return [...purchases].sort((first, second) =>
    String(second.occurredAt ?? second.createdAt ?? '').localeCompare(
      String(first.occurredAt ?? first.createdAt ?? ''),
    ),
  )[0]?.occurredAt ?? null
}

/**
 * Build athlete-facing pass status from the same RPC-backed pass rows +
 * athlete-visible ledger history the coach funding display uses.
 *
 * Does not invent a second balance — reuses derivePassFundingUsageDisplay.
 */
export const buildAthletePassStatus = ({
  summaryRows = [],
  historyRows = [],
} = {}) => {
  const passes = normalizeAthletePassSummary(summaryRows)
  const history = normalizeAthletePassHistory(historyRows)

  if (!passes.length) {
    return {
      visible: false,
      groups: [],
      primary: null,
      multipleRelationships: false,
    }
  }

  const passGroups = new Map()
  passes.forEach((pass) => {
    const key = groupKey(pass.businessClientId)
    if (!passGroups.has(key)) {
      passGroups.set(key, {
        businessClientId:
          key === '__default__' ? null : pass.businessClientId,
        passes: [],
        ledger: [],
      })
    }
    passGroups.get(key).passes.push(pass)
  })

  history.forEach((entry) => {
    const key = groupKey(entry.businessClientId)
    // History for an unknown/default bucket still attaches when only one group.
    if (passGroups.has(key)) {
      passGroups.get(key).ledger.push(entry)
      return
    }
    if (passGroups.size === 1 && passGroups.has('__default__')) {
      passGroups.get('__default__').ledger.push(entry)
    }
  })

  const groups = [...passGroups.values()].map((group) => {
    const usage = derivePassFundingUsageDisplay({
      passes: group.passes,
      ledger: group.ledger,
    })
    const remaining = Number(usage.remaining ?? 0)
    const used = Number(usage.used ?? 0)
    const effectiveTotal = Number(usage.effectiveTotal ?? remaining)

    return {
      businessClientId: group.businessClientId,
      remaining,
      used,
      effectiveTotal,
      usageLabel: formatPassFundingUsageLabel({ used, effectiveTotal }),
      isLow: isLowPassBalance(remaining),
      lastPurchaseAt: lastPurchaseAt(group.ledger),
      primaryPassName: usage.primaryPass?.name ?? group.passes[0]?.name ?? null,
      source: usage.source,
    }
  })

  groups.sort((first, second) => second.remaining - first.remaining)

  return {
    visible: true,
    groups,
    primary: groups[0] ?? null,
    multipleRelationships: groups.length > 1,
  }
}

export const athleteHasPassStatus = (status) => Boolean(status?.visible)

export const formatAthletePassRemainingLabel = (remaining) => {
  const value = Number(remaining ?? 0)
  if (!Number.isFinite(value)) return '0 remaining'
  return `${value} remaining`
}
