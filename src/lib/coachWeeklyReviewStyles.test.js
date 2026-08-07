import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const stylesPath = resolve(process.cwd(), 'src/styles.css')
const styles = readFileSync(stylesPath, 'utf8')

describe('coach weekly review history styles', () => {
  const historySection = styles.slice(
    styles.indexOf('.coach-weekly-review-history {'),
    styles.indexOf('.coach-weekly-review-banner'),
  )

  it('uses readable primary text on dark review-history buttons', () => {
    expect(historySection).toMatch(
      /\.coach-weekly-review-history button[\s\S]*?color:\s*var\(--cream\)/,
    )
    expect(historySection).toMatch(
      /\.coach-weekly-review-history strong[\s\S]*?color:\s*#eee7dc/,
    )
  })

  it('uses readable secondary text for review-history metadata', () => {
    expect(historySection).toMatch(
      /\.coach-weekly-review-history span[\s\S]*?color:\s*var\(--muted\)/,
    )
  })

  it('keeps hover and focus states for review-history rows', () => {
    expect(historySection).toMatch(/\.coach-weekly-review-history button:hover/)
    expect(historySection).toMatch(
      /\.coach-weekly-review-history button:focus-visible/,
    )
  })
})
