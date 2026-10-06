import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

describe('ProgressScreen visual hierarchy', () => {
  const source = readFileSync(
    resolve(process.cwd(), 'src/screens/ProgressScreen.jsx'),
    'utf8',
  )

  it('opens with overall progress instead of the goal editor', () => {
    const overall = source.indexOf('OVERALL PROGRESS')
    const broadGoal = source.indexOf('Training goal & priorities')

    expect(overall).toBeGreaterThan(-1)
    expect(broadGoal).toBeGreaterThan(overall)
    expect(source).toContain('Your training is moving.')
  })

  it('keeps lift-specific progress behind explicit exercise selection', () => {
    expect(source).toContain("const [selectedExercise, setSelectedExercise] = useState('')")
    expect(source).toContain('Select an exercise')
    expect(source).toContain('progress-selected-lift')
    expect(source).toContain('STRENGTH TREND')
  })

  it('supports a persisted goal for each selected lift', () => {
    expect(source).toContain('liftGoals = {}')
    expect(source).toContain('onLiftGoalChange')
    expect(source).toContain('LIFT GOAL')
    expect(source).toContain('Save goal')
    expect(source).toContain("unit: 'lb'")
  })
})
