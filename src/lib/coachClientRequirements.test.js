import { describe, expect, it, vi } from 'vitest'
import {
  COACHING_REQUIREMENT_KEYS,
  createsActiveWeeklyCheckInObligation,
  hasActiveCoachBridge,
  isDuplicateActiveLinkedRelationshipsError,
  isInvalidWeeklyCheckInRequirementError,
  mergeWeeklyCheckInRequirement,
  normalizeCoachingRequirements,
  normalizeUpdateCoachingRequirementsRpcResult,
  readCoachingRequirementsFromClient,
  WEEKLY_CHECK_IN_REQUIREMENT,
} from './coachClientRequirements'

describe('coachClientRequirements hardening', () => {
  it('preserves unrelated requirement keys when merging weekly_check_in', () => {
    expect(
      mergeWeeklyCheckInRequirement(
        {
          weekly_check_in: 'required',
          nutrition_tracking: 'required',
        },
        WEEKLY_CHECK_IN_REQUIREMENT.NOT_REQUIRED,
      ),
    ).toEqual({
      weekly_check_in: 'not_required',
      nutrition_tracking: 'required',
    })
  })

  it('parses deterministic update RPC payload', () => {
    expect(
      normalizeUpdateCoachingRequirementsRpcResult({
        ok: true,
        business_client_id: 'bc-1',
        weekly_check_in: 'not_required',
      }),
    ).toEqual({
      ok: true,
      businessClientId: 'bc-1',
      weeklyCheckIn: 'not_required',
    })
  })

  it('maps duplicate relationship and invalid enum RPC errors', () => {
    expect(
      isDuplicateActiveLinkedRelationshipsError({
        message: 'duplicate_active_linked_relationships',
      }),
    ).toBe(true)
    expect(
      isInvalidWeeklyCheckInRequirementError({
        message: 'invalid_weekly_check_in_requirement',
      }),
    ).toBe(true)
  })

  it('returns not_required when athlete has no active bridged relationship context', () => {
    expect(
      normalizeCoachingRequirements({
        weekly_check_in: WEEKLY_CHECK_IN_REQUIREMENT.NOT_REQUIRED,
      }),
    ).toEqual({ weekly_check_in: 'not_required' })
  })

  it('does not create obligation for offline stored-required clients', () => {
    const offlineStoredRequired = {
      status: 'active',
      linked_user_id: null,
      coaching_requirements: { weekly_check_in: 'required' },
    }

    expect(hasActiveCoachBridge(offlineStoredRequired)).toBe(false)
    expect(createsActiveWeeklyCheckInObligation(offlineStoredRequired)).toBe(false)
  })

  it('creates obligation only for active connected bridged required clients', () => {
    const connectedRequired = {
      status: 'active',
      linked_user_id: '11111111-1111-4111-8111-111111111111',
      hasCoachBridge: true,
      coaching_requirements: { weekly_check_in: 'required' },
    }

    expect(createsActiveWeeklyCheckInObligation(connectedRequired)).toBe(true)

    expect(
      createsActiveWeeklyCheckInObligation({
        ...connectedRequired,
        coaching_requirements: { weekly_check_in: 'not_required' },
      }),
    ).toBe(false)
  })

  it('does not create obligation for archived clients', () => {
    expect(
      createsActiveWeeklyCheckInObligation({
        status: 'archived',
        linked_user_id: '11111111-1111-4111-8111-111111111111',
        hasCoachBridge: true,
        coaching_requirements: { weekly_check_in: 'required' },
      }),
    ).toBe(false)
  })

  it('does not create obligation when bridge is absent', () => {
    expect(
      createsActiveWeeklyCheckInObligation({
        status: 'active',
        linked_user_id: '11111111-1111-4111-8111-111111111111',
        hasCoachBridge: false,
        coaching_requirements: { weekly_check_in: 'required' },
      }),
    ).toBe(false)
  })

  it('defaults stored connected clients to required for backward compatibility', () => {
    expect(
      readCoachingRequirementsFromClient({
        status: 'active',
        linked_user_id: '11111111-1111-4111-8111-111111111111',
      }).weekly_check_in,
    ).toBe('required')
  })

  it('preserves not_required through normalizeBusinessClientRecord', async () => {
    const { normalizeBusinessClientRecord } = await import('./coachBusinessClient.js')

    expect(
      normalizeBusinessClientRecord({
        id: 'bc-jake',
        status: 'active',
        linked_user_id: '11111111-1111-4111-8111-111111111111',
        coaching_requirements: { weekly_check_in: 'not_required' },
      }).coaching_requirements,
    ).toEqual({ weekly_check_in: 'not_required' })
  })
})

describe('coachBackend coaching requirements RPC contract', () => {
  it('calls merge-safe RPC signature with weekly enum only', async () => {
    vi.resetModules()

    const rpc = vi.fn(async () => ({
      data: {
        ok: true,
        business_client_id: '11111111-1111-4111-8111-111111111111',
        weekly_check_in: 'not_required',
      },
      error: null,
    }))

    const from = vi.fn(() => ({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      maybeSingle: vi.fn(async () => ({
        data: {
          id: '11111111-1111-4111-8111-111111111111',
          coach_id: 'coach-1',
          linked_user_id: '22222222-2222-4222-8222-222222222222',
          status: 'active',
          coaching_requirements: {
            weekly_check_in: 'required',
            nutrition_tracking: 'required',
          },
        },
        error: null,
      })),
    }))

    vi.doMock('./supabase', () => ({
      supabase: {
        rpc,
        auth: {
          getUser: vi.fn(async () => ({
            data: { user: { id: 'coach-1' } },
            error: null,
          })),
        },
        from,
      },
    }))

    const { coachBackend } = await import('./coachBackend.js')

    const updated = await coachBackend.updateBusinessClientCoachingRequirements({
      businessClientId: '11111111-1111-4111-8111-111111111111',
      weeklyCheckInRequired: false,
    })

    expect(rpc).toHaveBeenCalledWith(
      'update_business_client_coaching_requirements',
      {
        p_business_client_id: '11111111-1111-4111-8111-111111111111',
        p_weekly_check_in: 'not_required',
      },
    )

    expect(updated.coaching_requirements).toEqual({
      weekly_check_in: 'not_required',
      nutrition_tracking: 'required',
    })
  })
})
