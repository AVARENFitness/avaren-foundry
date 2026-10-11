import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const read = (path) => readFileSync(resolve(process.cwd(), path), 'utf8')
const readStyles = () => [read('src/styles.css'), read('src/styles/screens/later-overrides.css')].join('\n')

describe('mobile app quality regressions', () => {
  it('keeps notification empty state quiet and non-duplicative', () => {
    const source = read('src/screens/NotificationScreen.jsx')
    expect(source).toContain('Nothing needs your attention right now.')
    expect(source).not.toContain('No active notifications.')
  })

  it('keeps quick add sized to the visual viewport while the keyboard is open', () => {
    const modal = read('src/components/QuickAddModal.jsx')
    const backdrop = read('src/components/ui/AppUiBackdrop.jsx')
    const styles = readStyles()

    expect(modal).toContain('window.visualViewport')
    expect(modal).toContain('--quick-add-visible-height')
    expect(backdrop).toContain('style={style}')
    expect(styles).toContain('.quick-add-backdrop')
    expect(styles).toContain('overflow: hidden')
  })

  it('preserves readable spacing between active workout content and muscle rail', () => {
    const styles = readStyles()
    expect(styles).toContain('padding: 16px 17px 11px !important')
    expect(styles).not.toContain('.focus-exercise-header {\n    padding-inline: 1px;\n  }')
  })

  it('makes post-photo nutrition analysis controls visible without auto-opening the keyboard', () => {
    const nutrition = read('src/screens/NutritionScreen.jsx')
    const styles = readStyles()

    expect(nutrition).toContain('data-scan-state={scanState}')
    expect(nutrition).not.toMatch(/rows=\{3\}\s+autoFocus/)
    expect(nutrition).toContain("input.value = ''")
    expect(styles).toContain('.nutrition-scan-sheet[data-scan-state="context"]')
    expect(styles).toContain('grid-template-columns: 82px minmax(0,1fr)')
  })
})
