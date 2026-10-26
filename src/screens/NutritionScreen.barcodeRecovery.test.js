import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

describe('manual barcode recovery input', () => {
  it('strips non-digits rather than looking for a literal slash-D', () => {
    const source = readFileSync(resolve(process.cwd(), 'src/screens/NutritionScreen.jsx'), 'utf8')
    expect(source).toContain("setBarcodeManualValue(event.target.value.replace(/\\D/g, '').slice(0, 13))")
    expect(source).not.toContain("setBarcodeManualValue(event.target.value.replace(/\\\\D/g, '').slice(0, 13))")
  })
})
