import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

describe('CoachClientProfile overview presentation', () => {
  it('keeps detailed intelligence on Progress, not Overview', () => {
    const source = readFileSync(
      resolve(process.cwd(), 'src/screens/CoachClientProfile.jsx'),
      'utf8',
    )

    const overviewCase = source.slice(
      source.indexOf("case 'overview':"),
      source.indexOf("case 'sessions':"),
    )
    const progressCase = source.slice(
      source.indexOf("case 'progress':"),
      source.indexOf('default:'),
    )

    expect(overviewCase).not.toContain('ClientIntelligenceDashboard')
    expect(overviewCase).toContain('CoachClientInPersonPanel')
    expect(overviewCase).toContain('RECENT TRAINING')
    expect(overviewCase).not.toContain('clientManagementPanel')
    expect(overviewCase).not.toContain('View usage')
    expect(overviewCase).not.toContain('All caught up')
    expect(overviewCase).not.toContain('Add note')
    expect(overviewCase).toContain('Message athlete')
    expect(progressCase).toContain('ClientIntelligenceDashboard')
  })
})
