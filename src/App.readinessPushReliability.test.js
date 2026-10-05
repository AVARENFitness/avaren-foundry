import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

describe('App daily readiness + push reliability', () => {
  const source = readFileSync(resolve(process.cwd(), 'src/App.jsx'), 'utf8')

  it('uses the local calendar day for readiness prompting', () => {
    expect(source).toContain("import { localCalendarDateKey } from './lib/localCalendarDay'")
    expect(source).toContain('const today = localCalendarDateKey(now)')
  })

  it('refreshes push ownership when the app returns to the foreground', () => {
    expect(source).toContain("window.addEventListener('pageshow', refreshPushOwnership)")
    expect(source).toContain("window.addEventListener('focus', refreshPushOwnership)")
    expect(source).toContain("document.addEventListener('visibilitychange', refreshPushOwnership)")
  })
})
