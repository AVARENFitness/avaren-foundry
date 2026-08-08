import { describe, expect, it } from 'vitest'
import { sanitizeCoachLabelDraft } from './clientDisplayName'

describe('coach label UX helpers', () => {
  it('treats cleared label as empty string for fallback', () => {
    expect(sanitizeCoachLabelDraft('   ')).toBe('')
    expect(sanitizeCoachLabelDraft('Jake')).toBe('Jake')
  })
})

describe('identity editor mode flow', () => {
  it('documents expected post-save transition', () => {
    const transitions = {
      saving: 'saved',
      saved: 'view',
      error: 'editing',
    }

    expect(transitions.saving).toBe('saved')
    expect(transitions.saved).toBe('view')
    expect(transitions.error).toBe('editing')
  })
})
