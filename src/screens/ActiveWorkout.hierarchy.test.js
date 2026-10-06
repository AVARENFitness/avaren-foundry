import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

describe('Active workout visual hierarchy', () => {
  const gym = readFileSync(resolve(process.cwd(), 'src/screens/GymScreen.jsx'), 'utf8')
  const focus = readFileSync(resolve(process.cwd(), 'src/components/FocusExercise.jsx'), 'utf8')

  it('consolidates session banners into one quiet context surface', () => {
    expect(gym).toContain('gym-session-context')
    expect(gym).not.toContain('gym-coach-session-banner')
    expect(gym).not.toContain('gym-execution-focus-banner')
    expect(gym).toContain("useState(false)")
  })

  it('moves exercise setup and history behind progressive disclosure', () => {
    expect(focus).toContain('focus-exercise-details')
    expect(focus).toContain('Setup & history')
    expect(focus).toContain('focus-previous-session-compact')
  })
})
