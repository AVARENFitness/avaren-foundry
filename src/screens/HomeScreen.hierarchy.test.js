import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

describe('HomeScreen calm hierarchy', () => {
  const source = readFileSync(
    resolve(process.cwd(), 'src/screens/HomeScreen.jsx'),
    'utf8',
  )

  it('keeps Today before coach and support surfaces', () => {
    const today = source.indexOf('<section className="home-today-plan">')
    const coachHub = source.indexOf('home-coach-hub-shortcut--quiet')
    const ava = source.indexOf('<AvaDailyBriefing')

    expect(today).toBeGreaterThan(-1)
    expect(coachHub).toBeGreaterThan(today)
    expect(ava).toBeGreaterThan(today)
  })

  it('keeps immediate coaching facts visible while deeper schedule detail is collapsed', () => {
    expect(source).toContain('home-coaching-now')
    expect(source).toContain('compact')
    expect(source).toContain('home-coaching-schedule')
    expect(source).toContain('Coaching & schedule')
  })

  it('preserves the primary Today action and quick nutrition logging', () => {
    expect(source).toContain('handlePrimaryHomeAction')
    expect(source).toContain('home-nutrition-quicklog')
    expect(source).toContain('onOpenNutritionLog')
  })
})
