import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

describe('coached session athlete history presentation', () => {
  it('shows the approved coach recap but not private coach floor notes', () => {
    const source = readFileSync(
      resolve(process.cwd(), 'src/screens/HistoryScreen.jsx'),
      'utf8',
    )

    expect(source).toContain("session.sessionMode === 'coached_in_person'")
    expect(source).toContain('session.coachRecap')
    expect(source).toContain('COACH RECAP')
    expect(source).not.toContain('privateCoachNote')
  })
})
