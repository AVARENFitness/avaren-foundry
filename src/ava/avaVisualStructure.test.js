import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const stylesPath = resolve(process.cwd(), 'src/styles.css')
const styles = readFileSync(stylesPath, 'utf8')

describe('AVA visual structure classes', () => {
  it('defines calm conversation rhythm tokens on ava sheet', () => {
    expect(styles).toMatch(/\.ava-sheet--conversation/)
    expect(styles).toMatch(/\.ava-chat-transcript/)
    expect(styles).toMatch(/\.ava-chat-message--ava/)
    expect(styles).toMatch(/\.ava-chat-actions/)
    expect(styles).toMatch(/\.ava-sheet-form/)
  })

  it('defines shared design tokens in :root', () => {
    expect(styles).toMatch(/--space-4:/)
    expect(styles).toMatch(/--radius-md:/)
    expect(styles).toMatch(/--surface-1:/)
    expect(styles).toMatch(/--border-subtle:/)
    expect(styles).toMatch(/--type-page:/)
    expect(styles).toMatch(/--btn-height:/)
  })

  it('defines normalized button hierarchy classes', () => {
    expect(styles).toMatch(/\.ui-btn-secondary/)
    expect(styles).toMatch(/\.ui-btn-tertiary/)
  })

  it('reviewed coach badge stays quieter than due badge', () => {
    const reviewedIndex = styles.indexOf('.coach-command-review-badge.reviewed')
    const dueIndex = styles.indexOf('.coach-command-review-badge.due')

    expect(reviewedIndex).toBeGreaterThan(-1)
    expect(dueIndex).toBeGreaterThan(-1)

    const reviewedBlock = styles.slice(reviewedIndex, reviewedIndex + 180)
    const dueBlock = styles.slice(dueIndex, dueIndex + 180)

    expect(reviewedBlock).toMatch(/#9fd0a8|rgba\(120, 176, 132/)
    expect(dueBlock).toMatch(/#ddc57f|rgba\(216,184,109/)
    expect(reviewedBlock).not.toMatch(/linear-gradient/)
  })

  it('removes legacy oversized gold coach-weekly-review-entry treatment', () => {
    expect(styles).not.toMatch(/\.coach-weekly-review-entry\s*\{/)
  })
})
