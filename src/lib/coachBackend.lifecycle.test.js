import { beforeEach, describe, expect, it, vi } from 'vitest'
import { DEFAULT_COACH_SCHEDULE_TIMEZONE } from './sessionTimezone'

const mockRpc = vi.fn()
const mockMaybeSingle = vi.fn()
const mockEqCoach = vi.fn()
const mockEqId = vi.fn()
const mockSelect = vi.fn()
const mockFrom = vi.fn()

vi.mock('./supabase', () => ({
  supabase: {
    auth: {
      getUser: vi.fn().mockResolvedValue({
        data: { user: { id: 'coach-1' } },
        error: null,
      }),
    },
    rpc: (...args) => mockRpc(...args),
    from: (...args) => mockFrom(...args),
  },
}))

const businessClientId = '11111111-1111-4111-8111-111111111111'

const archivedClient = {
  id: businessClientId,
  coach_id: 'coach-1',
  status: 'archived',
  linked_user_id: null,
  first_name: 'Test',
}

const setupBusinessClientRead = (record = archivedClient) => {
  mockMaybeSingle.mockResolvedValue({ data: record, error: null })
  mockEqCoach.mockReturnValue({ maybeSingle: mockMaybeSingle })
  mockEqId.mockReturnValue({ eq: mockEqCoach })
  mockSelect.mockReturnValue({ eq: mockEqId })
  mockFrom.mockImplementation((table) => {
    if (table === 'coach_business_clients') {
      return { select: mockSelect }
    }
    throw new Error(`Unexpected table mutation: ${table}`)
  })
}

describe('coachBackend lifecycle RPC wiring', () => {
  beforeEach(async () => {
    vi.clearAllMocks()
    vi.resetModules()
    setupBusinessClientRead()
  })

  it('endBusinessClientCoaching makes one end_business_client_coaching RPC call', async () => {
    mockRpc.mockResolvedValue({
      data: { ok: true, archived: true, cancelled_future_appointments: 2 },
      error: null,
    })

    const { coachBackend } = await import('./coachBackend')
    const result = await coachBackend.endBusinessClientCoaching({
      businessClientId,
      unlinkAccount: false,
    })

    expect(mockRpc).toHaveBeenCalledTimes(1)
    expect(mockRpc).toHaveBeenCalledWith('end_business_client_coaching', {
      p_business_client_id: businessClientId,
      p_unlink_user: false,
      p_ended_at: null,
      p_schedule_timezone: DEFAULT_COACH_SCHEDULE_TIMEZONE,
    })
    expect(result.status).toBe('archived')
  })

  it('endBusinessClientCoaching does not mutate sessions, bridge, or business client directly', async () => {
    mockRpc.mockResolvedValue({
      data: { ok: true, archived: true },
      error: null,
    })

    const { coachBackend } = await import('./coachBackend')
    await coachBackend.endBusinessClientCoaching({ businessClientId })

    expect(mockFrom).toHaveBeenCalledTimes(1)
    expect(mockFrom).toHaveBeenCalledWith('coach_business_clients')
    expect(mockSelect).toHaveBeenCalledWith('*')
    expect(mockRpc).toHaveBeenCalledTimes(1)
  })

  it('unlinkBusinessClientAccount makes one unlink_business_client_user RPC call', async () => {
    mockRpc.mockResolvedValue({
      data: { ok: true, unlinked: true },
      error: null,
    })
    setupBusinessClientRead({
      ...archivedClient,
      status: 'active',
      linked_user_id: null,
    })

    const { coachBackend } = await import('./coachBackend')
    await coachBackend.unlinkBusinessClientAccount({ businessClientId })

    expect(mockRpc).toHaveBeenCalledTimes(1)
    expect(mockRpc).toHaveBeenCalledWith('unlink_business_client_user', {
      p_business_client_id: businessClientId,
    })
  })

  it('reopenBusinessClientCoaching makes one reopen_business_client_coaching RPC call', async () => {
    mockRpc.mockResolvedValue({
      data: { ok: true, reopened: true, bridge_restored: false },
      error: null,
    })
    setupBusinessClientRead({
      ...archivedClient,
      status: 'active',
    })

    const { coachBackend } = await import('./coachBackend')
    await coachBackend.reopenBusinessClientCoaching({ businessClientId })

    expect(mockRpc).toHaveBeenCalledTimes(1)
    expect(mockRpc).toHaveBeenCalledWith('reopen_business_client_coaching', {
      p_business_client_id: businessClientId,
    })
  })

  it('endBusinessClientCoaching RPC failure does not fetch refreshed client state', async () => {
    mockRpc.mockResolvedValue({
      data: null,
      error: { message: 'business_client_not_found' },
    })

    const { coachBackend } = await import('./coachBackend')

    await expect(
      coachBackend.endBusinessClientCoaching({ businessClientId }),
    ).rejects.toThrow(/client record not found/i)

    expect(mockFrom).not.toHaveBeenCalled()
  })

  it('unlinkBusinessClientAccount RPC failure does not fetch refreshed client state', async () => {
    mockRpc.mockResolvedValue({
      data: null,
      error: { message: 'not_authorized' },
    })

    const { coachBackend } = await import('./coachBackend')

    await expect(
      coachBackend.unlinkBusinessClientAccount({ businessClientId }),
    ).rejects.toThrow(/unable to complete this action/i)

    expect(mockFrom).not.toHaveBeenCalled()
  })

  it('reopenBusinessClientCoaching RPC failure does not fetch refreshed client state', async () => {
    mockRpc.mockResolvedValue({
      data: null,
      error: { message: 'business_client_not_found' },
    })

    const { coachBackend } = await import('./coachBackend')

    await expect(
      coachBackend.reopenBusinessClientCoaching({ businessClientId }),
    ).rejects.toThrow(/client record not found/i)

    expect(mockFrom).not.toHaveBeenCalled()
  })
})
