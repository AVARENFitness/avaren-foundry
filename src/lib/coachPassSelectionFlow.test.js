import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  normalizePassUsageRpcResult,
  passUsageResultUserMessage,
  resolvePassCandidateId,
} from './coachPass'

describe('coach pass selection debit flow', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('normalizes pass_selection_required candidates with pass_id for selection', () => {
    const passResult = normalizePassUsageRpcResult({
      ok: false,
      pass_selection_required: true,
      candidates: [{ pass_id: 'pass-1', name: 'Training pass', balance: 3 }],
    })

    expect(passResult.passSelectionRequired).toBe(true)
    expect(passResult.candidates[0].pass_id).toBe('pass-1')
    expect(resolvePassCandidateId(passResult.candidates[0])).toBe('pass-1')
  })

  it('calls RPC with session id and selected pass id', async () => {
    const recordCompletedSessionPassUsage = vi.fn().mockResolvedValue({
      ok: true,
      passId: 'pass-1',
      balanceAfter: 2,
    })

    const sessionId = 'session-1'
    const selectedPassId = resolvePassCandidateId({
      pass_id: 'pass-1',
      balance: 3,
    })

    const result = await recordCompletedSessionPassUsage(sessionId, selectedPassId)

    expect(recordCompletedSessionPassUsage).toHaveBeenCalledWith(
      'session-1',
      'pass-1',
    )
    expect(result.ok).toBe(true)
    expect(result.balanceAfter).toBe(2)
  })

  it('treats unchanged rpc results as idempotent success', () => {
    const result = normalizePassUsageRpcResult({ ok: true, unchanged: true })

    expect(result.ok).toBe(true)
    expect(result.unchanged).toBe(true)
    expect(passUsageResultUserMessage(result)).toBe('Pass already applied.')
  })

  it('maps failed eligibility to human-friendly copy', () => {
    const mapped = passUsageResultUserMessage({
      error: 'pass_not_eligible_for_session',
    })

    expect(mapped).toBe("This pass can't be used for this session.")
  })

  it('distinguishes pass_selection_required from generic failure', () => {
    const selectionRequired = normalizePassUsageRpcResult({
      ok: false,
      pass_selection_required: true,
      candidates: [{ pass_id: 'pass-1', balance: 3 }],
    })

    expect(selectionRequired.ok).toBe(false)
    expect(selectionRequired.error).toBe('pass_selection_required')
    expect(passUsageResultUserMessage(selectionRequired)).toContain(
      'Choose a training pass',
    )
    expect(passUsageResultUserMessage({ error: 'empty_response' })).toContain(
      "We couldn't apply this session to the pass",
    )
  })
})
