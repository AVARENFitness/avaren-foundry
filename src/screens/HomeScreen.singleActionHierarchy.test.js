import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

describe('Athlete Home single-action hierarchy', () => {
  const source = readFileSync(
    resolve(process.cwd(), 'src/screens/HomeScreen.jsx'),
    'utf8',
  )

  it('renders the Today action before AVA context', () => {
    const todayIndex = source.indexOf('<section className="home-today-plan">')
    const avaIndex = source.indexOf('<AvaDailyBriefing')

    expect(todayIndex).toBeGreaterThan(-1)
    expect(avaIndex).toBeGreaterThan(todayIndex)
  })

  it('uses AVA as context only instead of a second primary action surface', () => {
    expect(source).toContain('<AvaDailyBriefing')
    expect(source).toContain('contextOnly')
  })

  it('suppresses the standalone next appointment card when Today already owns appointment', () => {
    expect(source).toContain(
      'homeState.primaryAction?.id !== HOME_ACTION_IDS.APPOINTMENT',
    )
  })
})
