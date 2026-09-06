import { describe, expect, it } from 'vitest'
import {
  countActiveClientsWithLowPasses,
  isLowPassBalance,
  LOW_PASS_ATTENTION_THRESHOLD,
} from './coachPassAttention'

describe('coachPassAttention · active low-pass count', () => {
  const activeHealthy = {
    id: 'bc-1',
    business_client_id: 'bc-1',
    status: 'active',
    linked_user_id: 'u1',
  }
  const activeHealthyTwo = {
    id: 'bc-2',
    business_client_id: 'bc-2',
    status: 'active',
    linked_user_id: null,
  }
  const archivedLow = {
    id: 'bc-3',
    business_client_id: 'bc-3',
    status: 'archived',
    linked_user_id: 'u3',
  }
  const activeLowUnlinked = {
    id: 'bc-4',
    business_client_id: 'bc-4',
    status: 'active',
    linked_user_id: null,
  }

  it('2 active healthy + archived low balance => Low Passes count = 0', () => {
    expect(
      countActiveClientsWithLowPasses({
        clients: [activeHealthy, activeHealthyTwo, archivedLow],
        passSummaryByBusinessClientId: {
          'bc-1': { totalBalance: 8, activeCount: 1 },
          'bc-2': { totalBalance: 6, activeCount: 1 },
          'bc-3': { totalBalance: 0, activeCount: 1 },
        },
      }),
    ).toBe(0)
  })

  it('active low-balance client => count = 1', () => {
    expect(
      countActiveClientsWithLowPasses({
        clients: [activeHealthy, activeLowUnlinked],
        passSummaryByBusinessClientId: {
          'bc-1': { totalBalance: 8, activeCount: 1 },
          'bc-4': {
            totalBalance: LOW_PASS_ATTENTION_THRESHOLD,
            activeCount: 1,
          },
        },
      }),
    ).toBe(1)
  })

  it('archived low-balance client is excluded', () => {
    expect(
      countActiveClientsWithLowPasses({
        clients: [archivedLow],
        passSummaryByBusinessClientId: {
          'bc-3': { totalBalance: 1, activeCount: 1 },
        },
      }),
    ).toBe(0)
  })

  it('unlinked active low-balance client is included', () => {
    expect(
      countActiveClientsWithLowPasses({
        clients: [activeLowUnlinked],
        passSummaryByBusinessClientId: {
          'bc-4': { totalBalance: 0, activeCount: 1 },
        },
      }),
    ).toBe(1)
  })

  it('preserves low-balance threshold semantics', () => {
    expect(isLowPassBalance(2)).toBe(true)
    expect(isLowPassBalance(3)).toBe(false)
  })
})
