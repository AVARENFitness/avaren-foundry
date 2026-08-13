import { describe, expect, it } from 'vitest'
import {
  mapLifecycleActionError,
  mapLifecycleRpcError,
  normalizeLifecycleRpcResult,
} from './coachClientLifecycle'

describe('coachClientLifecycle RPC helpers', () => {
  it('maps lifecycle RPC errors to friendly copy', () => {
    expect(mapLifecycleRpcError(new Error('business_client_not_found')).message).toBe(
      'Client record not found. Refresh and try again.',
    )
    expect(mapLifecycleRpcError(new Error('not_authorized')).message).toBe(
      'Unable to complete this action.',
    )
  })

  it('does not expose raw RPC names or postgres codes in user messages', () => {
    const mapped = mapLifecycleRpcError(
      new Error('42883: function end_business_client_coaching does not exist'),
    )
    expect(mapped.message).not.toMatch(/end_business_client_coaching|42883/)
  })

  it('accepts successful lifecycle RPC payloads', () => {
    expect(normalizeLifecycleRpcResult({ ok: true, archived: true })).toEqual({
      ok: true,
      archived: true,
    })
    expect(normalizeLifecycleRpcResult({ ok: true, unchanged: true })).toEqual({
      ok: true,
      unchanged: true,
    })
  })

  it('rejects invalid lifecycle RPC payloads', () => {
    expect(() => normalizeLifecycleRpcResult({ ok: false })).toThrow(
      'lifecycle_action_failed',
    )
  })

  it('maps lifecycle action errors for UI toasts', () => {
    expect(
      mapLifecycleActionError(new Error('business_client_not_linked')),
    ).toBe('This client is not linked to an AVAREN account.')
  })
})
