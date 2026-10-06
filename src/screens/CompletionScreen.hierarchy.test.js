import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

describe('CompletionScreen visual hierarchy', () => {
  const source = readFileSync(
    resolve(process.cwd(), 'src/screens/CompletionScreen.jsx'),
    'utf8',
  )

  it('keeps recovery and next workout near the completed-session hero', () => {
    const hero = source.indexOf('Session complete')
    const recovery = source.indexOf('Cooldown + Recovery')
    const details = source.indexOf('Workout details')

    expect(hero).toBeGreaterThan(-1)
    expect(recovery).toBeGreaterThan(hero)
    expect(details).toBeGreaterThan(recovery)
  })

  it('keeps long session detail and reflection optional', () => {
    expect(source).toContain('completion-detail-disclosure')
    expect(source).toContain('completion-reflection-disclosure')
    expect(source).toContain('Session reflection')
  })

  it('preserves the single Done exit action', () => {
    expect(source).toContain('sprint5-done-button')
    expect(source).toContain('onClick={onDone}')
  })
})
