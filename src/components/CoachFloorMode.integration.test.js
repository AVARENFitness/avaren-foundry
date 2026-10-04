import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

describe('Coach Floor Mode integration', () => {
  it('makes Start Session the coached appointment primary path', () => {
    const source = readFileSync(
      resolve(process.cwd(), 'src/components/coach/CoachSessionDetailSheet.jsx'),
      'utf8',
    )

    expect(source).toContain('Start Session')
    expect(source).toContain('onStartFloorMode?.(session)')
    expect(source).toContain('Complete without workout')
  })

  it('keeps Apple Pencil-friendly numeric and note inputs in floor mode', () => {
    const source = readFileSync(
      resolve(process.cwd(), 'src/components/CoachFloorMode.jsx'),
      'utf8',
    )

    expect(source).toContain('inputMode="decimal"')
    expect(source).toContain('inputMode="numeric"')
    expect(source).toContain('Write with Apple Pencil')
    expect(source).toContain('iPad Scribble converts handwriting into text here.')
  })

  it('requires coach approval before athlete recap delivery', () => {
    const source = readFileSync(
      resolve(process.cwd(), 'src/components/CoachFloorMode.jsx'),
      'utf8',
    )

    expect(source).toContain('REVIEW SESSION')
    expect(source).toContain('Save + send recap')
    expect(source).toContain('privateNote')
    expect(source).toContain('athleteRecap')
  })
})
