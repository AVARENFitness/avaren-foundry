import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

describe('Workout Builder blank-slate behavior', () => {
  const builder = readFileSync(
    resolve(process.cwd(), 'src/screens/WorkoutBuilderScreen.jsx'),
    'utf8',
  )
  const app = readFileSync(resolve(process.cwd(), 'src/App.jsx'), 'utf8')

  it('does not preload a workout program for a new account', () => {
    expect(app).toContain('rotation: []')
    expect(app).toContain('nextWorkout: null')
    expect(app).toContain('workouts: {}')
    expect(app).toContain('selectedWorkout: null')
    expect(app).not.toContain('? DEFAULT_PROGRAM')
  })

  it('lets the final workout be deleted to reach a true blank state', () => {
    expect(builder).not.toContain('if (draft.rotation.length <= 1) return')
    expect(builder).not.toContain('disabled={draft.rotation.length <= 1}')
    expect(builder).toContain("replacement =")
    expect(builder).toContain("?? null")
  })

  it('provides a deliberate clear-all action without deleting history', () => {
    expect(builder).toContain('clearAllWorkouts')
    expect(builder).toContain('Clear every workout from your builder?')
    expect(builder).toContain('Your completed workout history will stay intact')
    expect(builder).toContain('Clear all workouts')
  })

  it('cleans invalid weekly-plan references when a program is saved', () => {
    expect(app).toContain("value === 'Rest' || workoutNames.has(value) ? value : 'Rest'")
  })
})
