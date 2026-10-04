import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

describe('Athlete schedule presentation', () => {
  const source = readFileSync(
    resolve(process.cwd(), 'src/screens/AthleteInPersonScheduleScreen.jsx'),
    'utf8',
  )

  it('keeps past sessions collapsed behind a disclosure', () => {
    expect(source).toContain(
      '<details className="athlete-in-person-schedule-history">',
    )
    expect(source).toContain('Previous coaching sessions')
    expect(source).toContain('{pastAppointments.length}')
  })
})
