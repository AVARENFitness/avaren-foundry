import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

describe('AVAREN motion system', () => {
  const styles = readFileSync(resolve(process.cwd(), 'src/styles.css'), 'utf8')
  const navigation = readFileSync(
    resolve(process.cwd(), 'src/hooks/useNavigation.js'),
    'utf8',
  )
  const shell = readFileSync(
    resolve(process.cwd(), 'src/components/AppShell.jsx'),
    'utf8',
  )

  it('uses one shared motion token system', () => {
    expect(styles).toContain('--motion-ease-standard')
    expect(styles).toContain('--motion-fast: 110ms')
    expect(styles).toContain('--motion-medium: 190ms')
    expect(styles).toContain('--motion-slow: 280ms')
  })

  it('restarts screen entrance motion on route changes', () => {
    expect(shell).toContain('<main key={screen} className="screen" data-screen={screen}>')
    expect(styles).toContain('@keyframes avarenScreenIn')
  })

  it('keeps primary navigation transitions short and avoids smooth-scroll lag', () => {
    expect(navigation).toContain('}, 110)')
    expect(navigation).toContain("behavior: 'auto'")
    expect(navigation).not.toContain("behavior: 'smooth'")
  })

  it('honors reduced-motion preferences', () => {
    expect(styles).toContain('@media (prefers-reduced-motion: reduce)')
    expect(styles).toContain('animation: none !important')
  })

  it('adds state motion for workouts, disclosures, overlays, and navigation', () => {
    expect(styles).toContain('avarenSetComplete')
    expect(styles).toContain('avarenDisclosureIn')
    expect(styles).toContain('avarenSheetIn')
    expect(styles).toContain('.bottom-nav button.active::before')
  })
})
