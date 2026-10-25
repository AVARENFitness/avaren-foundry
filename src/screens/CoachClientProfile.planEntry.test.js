import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
describe('client planning entry point', () => {
  it('keeps the living Quick Plan prominent and advanced tools behind disclosure', () => {
    const source = readFileSync(resolve(process.cwd(), 'src/screens/CoachClientProfile.jsx'), 'utf8')
    expect(source).toContain('Open client plan')
    expect(source).toContain('<CoachQuickPlan businessClientId=')
    expect(source).toContain('<summary>Structured training tools</summary>')
    expect(source).toContain('Assign a scheduled workout')
    expect(source).toContain('Build a reusable workout')
    expect(source).toContain('Assign a structured program')
    expect(source).toContain('onDirtyChange={setQuickPlanDirty}')
  })
})
