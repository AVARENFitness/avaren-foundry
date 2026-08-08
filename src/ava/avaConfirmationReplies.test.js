import { describe, expect, it } from 'vitest'
import {
  isConfirmationPositive,
  isConfirmationNegative,
  resolveOrdinalCandidate,
} from './avaConfirmationReplies'

describe('avaConfirmationReplies', () => {
  it('detects positive confirmation replies', () => {
    expect(isConfirmationPositive('yes')).toBe(true)
    expect(isConfirmationPositive('yeah log it')).toBe(true)
    expect(isConfirmationPositive('how much protein')).toBe(false)
  })

  it('detects negative confirmation replies', () => {
    expect(isConfirmationNegative('no')).toBe(true)
    expect(isConfirmationNegative('never mind')).toBe(true)
    expect(isConfirmationNegative('no, 2%')).toBe(true)
  })

  it('resolves ordinal candidate selections', () => {
    const candidates = [
      { id: 'a', name: 'Nature Valley Oats' },
      { id: 'b', name: 'Nature Valley Peanut Butter' },
    ]

    expect(resolveOrdinalCandidate('the first one', candidates)?.id).toBe('a')
    expect(resolveOrdinalCandidate('option 2', candidates)?.id).toBe('b')
    expect(resolveOrdinalCandidate('the peanut butter one', candidates)?.id).toBe('b')
  })
})
