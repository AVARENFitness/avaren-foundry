import { describe, expect, it } from 'vitest'
import {
  INVITE_EMAIL_REQUIRED,
  validateInviteEmail,
} from './coachClientUi'

describe('coachClientUi invite validation', () => {
  it('requires email for Invite to AVAREN', () => {
    expect(validateInviteEmail('')).toBe(INVITE_EMAIL_REQUIRED)
    expect(validateInviteEmail('   ')).toBe(INVITE_EMAIL_REQUIRED)
    expect(validateInviteEmail('not-an-email')).toBe(INVITE_EMAIL_REQUIRED)
  })

  it('accepts a valid invite email', () => {
    expect(validateInviteEmail('athlete@example.com')).toBeNull()
  })
})
