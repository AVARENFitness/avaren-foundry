import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

describe('Onboarding visual hierarchy', () => {
  const source = readFileSync(
    resolve(process.cwd(), 'src/screens/OnboardingScreen.jsx'),
    'utf8',
  )

  it('uses a concise three-step first-run model', () => {
    expect(source).toContain("id: 'welcome'")
    expect(source).toContain("id: 'daily-system'")
    expect(source).toContain("id: 'ready'")
    expect(source).not.toContain("id: 'training'")
    expect(source).not.toContain("id: 'nutrition'")
    expect(source).not.toContain("id: 'schedule'")
  })

  it('teaches Home-first progressive disclosure instead of a feature catalog', () => {
    expect(source).toContain('Start with today.')
    expect(source).toContain('Home tells you what matters now')
    expect(source).toContain('You do not need to learn everything now.')
  })
})
