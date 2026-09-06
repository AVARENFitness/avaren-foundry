import { describe, expect, it } from 'vitest'
import { COACH_ATTENTION_CATEGORY } from './coachAttention'
import {
  NEXT_BEST_ACTION,
  sortNextBestActions,
  toNextBestActionFromAttention,
  toNextBestActionFromLead,
} from './coachNextBestAction'

describe('coachNextBestAction', () => {
  it('maps low passes to open passes action', () => {
    expect(
      toNextBestActionFromAttention({
        category: COACH_ATTENTION_CATEGORY.LOW_SESSION_BALANCE,
        businessClientId: 'biz-1',
        priorityTier: 'medium',
      }),
    ).toEqual({
      subjectType: 'business_client',
      subjectId: 'biz-1',
      businessClientId: 'biz-1',
      athleteId: null,
      reason: COACH_ATTENTION_CATEGORY.LOW_SESSION_BALANCE,
      priority: 'medium',
      action: NEXT_BEST_ACTION.OPEN_PASSES,
    })
  })

  it('maps no appointment to schedule action', () => {
    expect(
      toNextBestActionFromAttention({
        category: COACH_ATTENTION_CATEGORY.NO_NEXT_APPOINTMENT,
        businessClientId: 'biz-2',
        priorityTier: 'high',
      }).action,
    ).toBe(NEXT_BEST_ACTION.SCHEDULE)
  })

  it('maps lead follow-up to open lead action', () => {
    expect(
      toNextBestActionFromLead({ leadId: 'lead-1', priority: 'high' }),
    ).toEqual({
      subjectType: 'lead',
      subjectId: 'lead-1',
      reason: 'FOLLOW_UP_DUE',
      priority: 'high',
      action: NEXT_BEST_ACTION.OPEN_LEAD,
    })
  })

  it('orders higher priority actions first', () => {
    const ordered = sortNextBestActions([
      { priority: 'low', action: NEXT_BEST_ACTION.OPEN_CLIENT },
      { priority: 'high', action: NEXT_BEST_ACTION.OPEN_LEAD },
      { priority: 'medium', action: NEXT_BEST_ACTION.SCHEDULE },
    ])

    expect(ordered[0].priority).toBe('high')
    expect(ordered[1].priority).toBe('medium')
  })
})
