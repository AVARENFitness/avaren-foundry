import { describe, expect, it } from 'vitest'
import {
  ACCOUNT_SECTIONS,
  DEFAULT_ACCOUNT_SECTION,
  LEGACY_OVERVIEW_REDIRECT_SECTION,
  normalizeAccountSection,
  resolveInitialAccountSection,
} from './accountSectionNav'

describe('accountSectionNav', () => {
  it('defines four account tabs without Overview', () => {
    expect(ACCOUNT_SECTIONS).toEqual([
      'Training',
      'Recovery',
      'Account',
      'Support',
    ])
    expect(ACCOUNT_SECTIONS).not.toContain('Overview')
  })

  it('defaults to Account for fresh navigation', () => {
    expect(resolveInitialAccountSection()).toBe(DEFAULT_ACCOUNT_SECTION)
    expect(DEFAULT_ACCOUNT_SECTION).toBe('Account')
  })

  it('redirects legacy Overview to Training', () => {
    expect(normalizeAccountSection('Overview')).toBe(
      LEGACY_OVERVIEW_REDIRECT_SECTION,
    )
    expect(resolveInitialAccountSection('Overview')).toBe('Training')
  })

  it('falls back unknown sections to Account', () => {
    expect(normalizeAccountSection('')).toBe('Account')
    expect(normalizeAccountSection('Settings')).toBe('Account')
  })
})
