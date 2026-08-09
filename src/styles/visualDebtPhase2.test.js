import { describe, expect, it } from 'vitest'
import { readFileSync, existsSync } from 'node:fs'
import { resolve } from 'node:path'

const root = process.cwd()
const stylesPath = resolve(root, 'src/styles.css')
const styles = readFileSync(stylesPath, 'utf8')

const screenStyles = {
  builder: resolve(root, 'src/styles/screens/builder.css'),
  forge: resolve(root, 'src/styles/screens/forge.css'),
  history: resolve(root, 'src/styles/screens/history.css'),
  coachHub: resolve(root, 'src/styles/screens/coach-hub.css'),
}

describe('visual debt phase 2 · stylesheet extraction', () => {
  it('extracts forge, builder, history, and coach hub screen styles', () => {
    for (const file of Object.values(screenStyles)) {
      expect(existsSync(file)).toBe(true)
      expect(readFileSync(file, 'utf8').length).toBeGreaterThan(100)
    }
  })

  it('keeps core styles.css leaner than phase 1 baseline', () => {
    const lineCount = styles.split('\n').length
    expect(lineCount).toBeLessThan(19000)
  })

  it('moves builder surface rules out of styles.css', () => {
    expect(styles).not.toMatch(/\/\* ===== SPRINT 3 · WORKOUT BUILDER/)
    expect(readFileSync(screenStyles.builder, 'utf8')).toMatch(/\.builder-screen/)
    expect(readFileSync(screenStyles.builder, 'utf8')).toMatch(/7\.9\.26/)
  })

  it('moves journey/history rules out of styles.css', () => {
    expect(styles).not.toMatch(/\/\* ===== THE JOURNEY =====/)
    const historyCss = readFileSync(screenStyles.history, 'utf8')
    expect(historyCss).toMatch(/\.journey-screen/)
    expect(historyCss).toMatch(/\.journey-event-copy h3/)
  })

  it('moves forge rules out of styles.css', () => {
    expect(styles).not.toMatch(/\/\* ===== AVAREN BUILDER v0\.6 · THE FORGE UI/)
    const forgeCss = readFileSync(screenStyles.forge, 'utf8')
    expect(forgeCss).toMatch(/\.forge-achievement-card/)
    expect(forgeCss).toMatch(/7\.9\.26/)
  })

  it('uses canonical coach hub typography file', () => {
    const coachHubCss = readFileSync(screenStyles.coachHub, 'utf8')
    expect(coachHubCss).toMatch(/\.coach-hub-page-header h1/)
    expect(coachHubCss).toMatch(/var\(--type-page/)
  })

  it('does not retain legacy coach-weekly-review-entry selector', () => {
    expect(styles).not.toMatch(/\.coach-weekly-review-entry\s*\{/)
  })

  it('imports extracted stylesheets from main entry', () => {
    const main = readFileSync(resolve(root, 'src/main.jsx'), 'utf8')
    expect(main).toMatch(/styles\/screens\/builder\.css/)
    expect(main).toMatch(/styles\/screens\/forge\.css/)
    expect(main).toMatch(/styles\/screens\/history\.css/)
    expect(main).toMatch(/styles\/screens\/coach-hub\.css/)
  })
})

describe('visual debt phase 2 · history vs progress hierarchy', () => {
  it('styles journey cards for session scanning, not dashboard analytics', () => {
    const historyCss = readFileSync(screenStyles.history, 'utf8')
    expect(historyCss).toMatch(/\.journey-event-copy h3/)
    expect(historyCss).toMatch(/\.journey-month-header/)
    expect(historyCss).not.toMatch(/chart-panel/)
  })

  it('keeps progress chart styles in core stylesheet', () => {
    expect(styles).toMatch(/\.progress-chart-panel/)
    expect(styles).toMatch(/\.progress-summary-hero/)
  })
})
