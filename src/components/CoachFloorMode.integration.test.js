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

  it('lets an active client start training without a scheduled appointment', () => {
    const source = readFileSync(
      resolve(process.cwd(), 'src/screens/CoachClientProfile.jsx'),
      'utf8',
    )

    expect(source).toContain('Start Training')
    expect(source).toContain('showAdHocFloorMode')
    expect(source).toContain('<CoachFloorMode')
    expect(source).toContain('adHoc')
  })

  it('uses quick coaching mode by default', () => {
    const source = readFileSync(
      resolve(process.cwd(), 'src/components/CoachFloorMode.jsx'),
      'utf8',
    )

    expect(source).toContain('coach-floor-shell--quick')
    expect(source).toContain('Context')
    expect(source).toContain('coach-floor-context-toggle')
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

  it('never changes a pass just because a workout is recorded', () => {
    const source = readFileSync(
      resolve(process.cwd(), 'src/components/CoachFloorMode.jsx'),
      'utf8',
    )

    expect(source).toContain('Pass balance stays unchanged')
    expect(source).toContain('completeScheduledAttendance')
    expect(source).not.toContain('passSelectionRequired')
    expect(source).not.toContain('Which pass should this session use?')
  })

  it('supports one-tap repeat of the previous live set', () => {
    const source = readFileSync(
      resolve(process.cwd(), 'src/components/CoachFloorMode.jsx'),
      'utf8',
    )

    expect(source).toContain('Repeat last')
    expect(source).toContain('currentExercise.sets[setIndex - 1]')
  })
})
