import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  buildLeadCreatePayload,
  isLeadFollowUpDue,
  LEAD_STAGE,
  normalizeCoachLead,
} from './coachLead'

vi.mock('./supabase', () => ({
  isSupabaseConfigured: false,
  supabase: {
    auth: {
      getUser: vi.fn().mockResolvedValue({
        data: { user: { id: 'coach-1' } },
        error: null,
      }),
    },
    from: vi.fn(() => ({
      select: vi.fn(() => ({
        eq: vi.fn(() => ({
          order: vi.fn(async () => ({ data: null, error: { code: '42P01' } })),
        })),
      })),
      insert: vi.fn(() => ({
        select: vi.fn(() => ({
          limit: vi.fn(async () => ({ data: null, error: { code: '42P01' } })),
        })),
      })),
      update: vi.fn(() => ({
        eq: vi.fn(() => ({
          eq: vi.fn(() => ({
            select: vi.fn(() => ({
              limit: vi.fn(async () => ({ data: null, error: { code: '42P01' } })),
            })),
          })),
        })),
      })),
    })),
    rpc: vi.fn(async () => ({ data: null, error: { code: '42883' } })),
  },
}))

describe('coachLead pipeline', () => {
  beforeEach(async () => {
    vi.resetModules()
    const { resetDevCoachLeadStore } = await import('./coachBackend')
    resetDevCoachLeadStore()
  })

  it('creates a lead with NEW stage defaults', async () => {
    const { coachBackend } = await import('./coachBackend')
    const lead = await coachBackend.createCoachLead({
      firstName: 'Taylor',
      phone: '555-0100',
      goal: 'Strength coaching',
      source: 'Referral',
    })

    expect(lead.stage).toBe(LEAD_STAGE.NEW)
    expect(lead.firstName).toBe('Taylor')
  })

  it('marks follow-up due only when timestamp is past', () => {
    const dueLead = normalizeCoachLead({
      stage: LEAD_STAGE.CONTACTED,
      nextFollowUpAt: '2026-08-10T12:00:00.000Z',
    })
    const futureLead = normalizeCoachLead({
      stage: LEAD_STAGE.CONTACTED,
      nextFollowUpAt: '2026-12-10T12:00:00.000Z',
    })

    expect(
      isLeadFollowUpDue(dueLead, Date.parse('2026-08-17T12:00:00.000Z')),
    ).toBe(true)
    expect(
      isLeadFollowUpDue(futureLead, Date.parse('2026-08-17T12:00:00.000Z')),
    ).toBe(false)
  })

  it('excludes LOST and WON leads from follow-up due noise', () => {
    const lostLead = normalizeCoachLead({
      stage: LEAD_STAGE.LOST,
      nextFollowUpAt: '2026-08-10T12:00:00.000Z',
    })
    const wonLead = normalizeCoachLead({
      stage: LEAD_STAGE.WON,
      nextFollowUpAt: '2026-08-10T12:00:00.000Z',
    })

    expect(isLeadFollowUpDue(lostLead, Date.parse('2026-08-17T12:00:00.000Z'))).toBe(false)
    expect(isLeadFollowUpDue(wonLead, Date.parse('2026-08-17T12:00:00.000Z'))).toBe(false)
  })

  it('converts WON lead to one business client idempotently', async () => {
    const { coachBackend } = await import('./coachBackend')

    vi.spyOn(coachBackend, 'createBusinessClient').mockResolvedValue({
      id: 'biz-from-lead',
      first_name: 'Jordan',
    })

    const lead = await coachBackend.createCoachLead({
      firstName: 'Jordan',
      goal: 'Fat loss',
      source: 'Instagram',
    })
    await coachBackend.updateCoachLead(lead.id, { stage: LEAD_STAGE.WON })

    const first = await coachBackend.convertCoachLeadToClient(lead.id)
    const second = await coachBackend.convertCoachLeadToClient(lead.id)

    expect(first.businessClient?.id).toBe('biz-from-lead')
    expect(second.businessClient?.id).toBe('biz-from-lead')
    expect(coachBackend.createBusinessClient).toHaveBeenCalledTimes(1)
  })
})
